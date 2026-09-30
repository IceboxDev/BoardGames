/**
 * Win probability by simulation: sample a set of spies from the posterior,
 * play the rest of the game out with simple bot policies, count who wins.
 *
 * The rollout players don't learn during the rollout — each Resistance seat
 * trusts the table by the posterior at the starting point (conditioned on its
 * own innocence), spies sabotage as the bots do. It is a model estimate, good
 * for "how is this going", not a proof.
 */

import { createRng, type Rng } from "../../../lib/rng";
import type { ResistanceRecord } from "../record";
import {
  combinations,
  failsNeeded,
  MAX_REJECTIONS,
  maskOf,
  openMissions,
  popcount,
  tablePosition,
  teamSize,
  WINS_NEEDED,
} from "../rules";
import { type ModelEnv, spyFailChance } from "./model";
import type { Analysis, SolverEvent } from "./posterior";

/** The record as it stood before event `count` (the first `count` events only). */
export function recordUpTo(
  record: ResistanceRecord,
  events: readonly SolverEvent[],
  count: number,
): ResistanceRecord {
  const last = events[count - 1];
  if (!last) return { ...record, rounds: [], roles: record.roles, winner: null, winReason: null };
  const rounds = record.rounds.slice(0, last.round + 1).map((round, r) => {
    if (r < last.round) return round;
    const proposals = round.proposals.slice(0, last.proposalIndex + 1).map((p, i) => {
      if (i < last.proposalIndex || last.kind !== "proposal") return p;
      return { ...p, votes: null };
    });
    return { proposals, result: last.kind === "mission" ? round.result : null };
  });
  const cut = { ...record, rounds, winner: null, winReason: null };
  const pos = tablePosition(cut);
  return { ...cut, winner: pos.winner, winReason: pos.winReason };
}

/**
 * How often a bot spy sabotages when no rule says otherwise — bolder than the
 * Solver's default belief (0.75): spies that hesitate lose, and a bot whose
 * play matched the model exactly would be trivially read by its own teammates.
 */
export const BOT_SPY_FAIL_RATE = 0.9;

export interface WinEstimate {
  /** P(the Resistance wins). */
  resistance: number;
  rollouts: number;
}

export function winProbability(
  record: ResistanceRecord,
  analysis: Analysis,
  count: number,
  env: ModelEnv,
  rollouts = 600,
  seed = 1,
): WinEstimate {
  const snap = analysis.snapshots[count];
  const cut = recordUpTo(record, analysis.events, count);
  const start = tablePosition(cut);
  if (start.winner) return { resistance: start.winner === "resistance" ? 1 : 0, rollouts: 0 };
  if (!snap || snap.alive === 0) return { resistance: 0.5, rollouts: 0 };

  const n = record.playerCount;
  const rng = createRng(seed);
  const worlds = analysis.worlds;
  const cumulative: number[] = [];
  let acc = 0;
  for (const w of snap.weights) {
    acc += w;
    cumulative.push(acc);
  }
  const sampleWorld = (r: Rng) => {
    const x = r() * acc;
    const i = cumulative.findIndex((c) => c >= x);
    return worlds[i === -1 ? worlds.length - 1 : i] ?? 0;
  };

  // Each Resistance seat's trust: the posterior with its own seat known clean.
  const seatWeights = Array.from({ length: n }, (_, v) => {
    const ws = worlds.map((world, i) => (world & (1 << v) ? 0 : (snap.weights[i] ?? 0)));
    const total = ws.reduce((a, b) => a + b, 0);
    return total > 0 ? ws.map((w) => w / total) : ws;
  });
  const cleanCache = new Map<number, number>();
  const pClean = (v: number, mask: number) => {
    const key = v * 1024 + mask;
    let p = cleanCache.get(key);
    if (p === undefined) {
      p = 0;
      const ws = seatWeights[v] ?? [];
      for (let i = 0; i < worlds.length; i++) if (((worlds[i] ?? 0) & mask) === 0) p += ws[i] ?? 0;
      cleanCache.set(key, p);
    }
    return p;
  };
  const bestCache = new Map<number, { mask: number; p: number }>();
  const bestTeam = (v: number, size: number) => {
    const key = v * 16 + size;
    let best = bestCache.get(key);
    if (!best) {
      best = { mask: 0, p: -1 };
      for (const team of combinations(n, size)) {
        if (!team.includes(v)) continue;
        const mask = maskOf(team);
        const p = pClean(v, mask);
        if (p > best.p) best = { mask, p };
      }
      bestCache.set(key, best);
    }
    return best;
  };
  const trust = snap.pSpy;
  const botEnv: ModelEnv = {
    ...env,
    assumptions: { ...env.assumptions, baseFailRate: BOT_SPY_FAIL_RATE },
  };

  let resistanceWins = 0;
  for (let r = 0; r < rollouts; r++) {
    const spies = sampleWorld(rng);
    const results = [...start.missionResults];
    let successes = start.successes;
    let fails = start.fails;
    let leader = start.leader;
    let rejections = start.rejections;
    let winner: "resistance" | "spy" | null = null;

    for (let guard = 0; guard < 30 && !winner; guard++) {
      const mission =
        openMissions(results, successes, record.variants.targeting)[0] ?? results.indexOf(null);
      const size = teamSize(n, mission);
      const needed = failsNeeded(n, mission);
      let team: number;
      if (spies & (1 << leader)) {
        // Spy leader: itself (plus a second spy if the mission needs two) and
        // the most trusted Resistance players.
        team = 1 << leader;
        const partners = Array.from({ length: n }, (_, s) => s).filter(
          (s) => s !== leader && spies & (1 << s),
        );
        for (const s of partners.slice(0, needed - 1)) team |= 1 << s;
        const clean = Array.from({ length: n }, (_, s) => s)
          .filter((s) => !(spies & (1 << s)))
          .sort((a, b) => (trust[a] ?? 0) - (trust[b] ?? 0));
        for (const s of clean) if (popcount(team) < size) team |= 1 << s;
      } else {
        team = bestTeam(leader, size).mask;
      }

      const hammer = rejections === MAX_REJECTIONS - 1;
      let yes = 0;
      for (let v = 0; v < n; v++) {
        if (spies & (1 << v)) {
          if (hammer || (team & spies) !== 0) yes++;
        } else if (hammer || pClean(v, team) >= bestTeam(v, size).p - 0.1) {
          yes++;
        }
      }

      leader = (leader + 1) % n;
      if (yes * 2 > n) {
        const aboard = popcount(team & spies);
        const chance = spyFailChance(
          {
            mission,
            teamSize: size,
            spiesOnTeam: aboard,
            situation: { successes, fails, rejections },
          },
          botEnv,
        ).chance;
        let played = 0;
        for (let k = 0; k < aboard; k++) if (rng() < chance) played++;
        const success = played < needed;
        results[mission] = success;
        if (success) successes++;
        else fails++;
        rejections = 0;
        if (successes >= WINS_NEEDED) winner = "resistance";
        else if (fails >= WINS_NEEDED) winner = "spy";
      } else if (++rejections >= MAX_REJECTIONS) {
        winner = "spy";
      }
    }
    if (winner === "resistance") resistanceWins++;
  }
  return { resistance: resistanceWins / rollouts, rollouts };
}
