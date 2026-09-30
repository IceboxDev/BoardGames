/**
 * Exact Bayesian inference over every possible set of spies.
 *
 * `analyze` walks a record event by event — each proposal, each vote, each
 * mission — and keeps two views of the worlds:
 *
 *   - `core`: worlds the GAME's rule allows (the Resistance never plays Fail)
 *     plus the perspective's own knowledge — certainty, "proven".
 *   - `weights`: those worlds weighed by the behavioural assumptions — the
 *     Solver's best estimate, "likely".
 *
 * A snapshot after every event lets the UI scrub the timeline and lets the
 * grader judge each decision on what the decider knew at that moment.
 */

import type { ProposalRecord, ResistanceRecord, Role } from "../record";
import { combinations, isApproved, maskOf, spyCount } from "../rules";
import type { Assumptions, RuleId } from "./assumptions";
import { RULE_IDS } from "./assumptions";
import {
  type Likelihood,
  type ModelEnv,
  missionLikelihood,
  proposalLikelihood,
  type Situation,
  setting,
  voteLikelihood,
} from "./model";

export type Perspective =
  | { kind: "public" }
  | { kind: "seat"; seat: number; role: Role; knownSpies: readonly number[] }
  | { kind: "omniscient"; roles: readonly Role[] };

export type SolverEvent = {
  /** Position in `Analysis.events`. */
  index: number;
  round: number;
  proposalIndex: number;
  proposal: ProposalRecord;
  situation: Situation;
} & (
  | { kind: "proposal" }
  | { kind: "vote"; votes: readonly boolean[] }
  | {
      kind: "mission";
      fails: number;
      success: boolean;
      cards?: readonly ("success" | "fail" | null)[];
    }
);

export interface Snapshot {
  /** Normalised model weights per world (sum 1). */
  weights: Float64Array;
  /** 1 where the world survives the game's rule and the perspective. */
  core: Uint8Array;
  pSpy: number[];
  /** P(spy) over core worlds alone, uniformly — 0/1 here is PROOF. */
  pSpyCore: number[];
  alive: number;
  aliveCore: number;
  entropyBits: number;
}

export interface Contradiction {
  event: SolverEvent;
  /** Hard assumptions the event broke; relaxed for that event only. */
  rules: RuleId[];
}

export interface Analysis {
  playerCount: number;
  worlds: number[];
  events: SolverEvent[];
  /** `snapshots[i]` = after the first `i` events; `snapshots[0]` = prior. */
  snapshots: Snapshot[];
  contradictions: Contradiction[];
  /** Events the game's own rule can't explain (a data-entry slip); skipped. */
  impossible: SolverEvent[];
  /** Worlds each hard assumption eliminated ("cards" = the game's own rule). */
  eliminatedBy: Partial<Record<RuleId | "cards", number>>;
}

export function enumerateWorlds(playerCount: number): number[] {
  return combinations(playerCount, spyCount(playerCount)).map(maskOf);
}

export function worldAllowed(world: number, perspective: Perspective): boolean {
  switch (perspective.kind) {
    case "public":
      return true;
    case "seat": {
      const isSpy = (world & (1 << perspective.seat)) !== 0;
      if (isSpy !== (perspective.role === "spy")) return false;
      return perspective.knownSpies.every((s) => (world & (1 << s)) !== 0);
    }
    case "omniscient":
      return perspective.roles.every((r, s) => ((world & (1 << s)) !== 0) === (r === "spy"));
  }
}

/** The events in a record, in the order the table saw them. */
export function recordEvents(record: ResistanceRecord): SolverEvent[] {
  const events: SolverEvent[] = [];
  let successes = 0;
  let fails = 0;
  record.rounds.forEach((round, r) => {
    let rejections = 0;
    round.proposals.forEach((proposal, p) => {
      const situation = { successes, fails, rejections };
      const base = { round: r, proposalIndex: p, proposal, situation };
      events.push({ ...base, index: events.length, kind: "proposal" });
      if (proposal.votes === null) return;
      events.push({ ...base, index: events.length, kind: "vote", votes: proposal.votes });
      if (!isApproved(proposal.votes, record.playerCount)) {
        rejections++;
        return;
      }
      const result = round.result;
      if (result && p === round.proposals.length - 1) {
        events.push({
          ...base,
          index: events.length,
          kind: "mission",
          fails: result.fails,
          success: result.success,
          cards: result.cards,
        });
      }
    });
    if (round.result) {
      if (round.result.success) successes++;
      else fails++;
    }
  });
  return events;
}

function likelihood(world: number, event: SolverEvent, env: ModelEnv): Likelihood {
  switch (event.kind) {
    case "proposal":
      return proposalLikelihood(world, event.proposal, env);
    case "vote":
      return voteLikelihood(world, event.proposal, event.votes, event.situation, env);
    case "mission":
      return missionLikelihood(
        world,
        {
          mission: event.proposal.mission,
          team: event.proposal.team,
          fails: event.fails,
          cards: event.cards,
        },
        event.situation,
        env,
      );
  }
}

function snapshotOf(
  worlds: readonly number[],
  weights: Float64Array,
  core: Uint8Array,
  n: number,
): Snapshot {
  const pSpy = Array(n).fill(0);
  const coreCount = Array(n).fill(0);
  let alive = 0;
  let aliveCore = 0;
  let entropy = 0;
  worlds.forEach((world, i) => {
    const w = weights[i];
    if (w > 0) {
      alive++;
      entropy -= w * Math.log2(w);
    }
    if (core[i]) aliveCore++;
    for (let s = 0; s < n; s++) {
      if (world & (1 << s)) {
        pSpy[s] += w;
        if (core[i]) coreCount[s]++;
      }
    }
  });
  return {
    weights,
    core,
    pSpy,
    pSpyCore: coreCount.map((c) => (aliveCore ? c / aliveCore : 0)),
    alive,
    aliveCore,
    entropyBits: entropy,
  };
}

function normalise(weights: Float64Array): number {
  let sum = 0;
  for (const w of weights) sum += w;
  if (sum > 0) for (let i = 0; i < weights.length; i++) weights[i] /= sum;
  return sum;
}

export function analyze(
  record: ResistanceRecord,
  assumptions: Assumptions,
  perspective: Perspective = { kind: "public" },
): Analysis {
  const baseEnv: ModelEnv = {
    playerCount: record.playerCount,
    blindSpies: record.variants.blindSpies,
    assumptions,
  };
  const hardRules = RULE_IDS.filter((id) => setting(baseEnv, id).mode === "hard");
  const relaxed = new Set<RuleId>();
  const contradictions: Contradiction[] = [];

  // A record that breaks a hard assumption is re-read with that assumption
  // relaxed for the whole game — whoever broke it once may do so again.
  for (;;) {
    const pass = runPass(record, { ...baseEnv, relaxed }, perspective);
    if (!pass.contradiction) return { ...pass.analysis, contradictions };
    const fresh = pass.contradiction.rules.filter((r) => !relaxed.has(r));
    const rules = fresh.length > 0 ? fresh : hardRules.filter((r) => !relaxed.has(r));
    if (rules.length === 0) return { ...pass.analysis, contradictions };
    contradictions.push({ event: pass.contradiction.event, rules });
    for (const r of rules) relaxed.add(r);
  }
}

function runPass(
  record: ResistanceRecord,
  env: ModelEnv,
  perspective: Perspective,
): { analysis: Analysis; contradiction: Contradiction | null } {
  const n = record.playerCount;
  const worlds = enumerateWorlds(n);
  let core = Uint8Array.from(worlds, (w) => (worldAllowed(w, perspective) ? 1 : 0));
  let weights = Float64Array.from(core);
  normalise(weights);

  const events = recordEvents(record);
  const snapshots: Snapshot[] = [snapshotOf(worlds, weights, core, n)];
  const impossible: SolverEvent[] = [];
  const eliminatedBy: Partial<Record<RuleId | "cards", number>> = {};
  /** The hard assumption that zeroed each world, if one did. */
  const killedBy: (RuleId | null)[] = worlds.map(() => null);
  const analysis = (): Analysis => ({
    playerCount: n,
    worlds,
    events,
    snapshots,
    contradictions: [],
    impossible,
    eliminatedBy,
  });

  for (const event of events) {
    const next = new Float64Array(worlds.length);
    const nextCore = new Uint8Array(worlds.length);
    const liks = worlds.map((world, i) => {
      const lik = likelihood(world, event, env);
      nextCore[i] = core[i] && lik.feasible ? 1 : 0;
      next[i] = weights[i] * (lik.feasible ? lik.p : 0);
      return lik;
    });
    if (!nextCore.some(Boolean)) {
      // Not even the game's rule explains it — a slip in a hand-entered record.
      impossible.push(event);
      snapshots.push(snapshotOf(worlds, weights, core, n));
      continue;
    }
    liks.forEach((lik, i) => {
      if (weights[i] <= 0) return;
      if (!lik.feasible) {
        eliminatedBy.cards = (eliminatedBy.cards ?? 0) + 1;
      } else if (lik.zeroedBy) {
        killedBy[i] = lik.zeroedBy;
        eliminatedBy[lik.zeroedBy] = (eliminatedBy[lik.zeroedBy] ?? 0) + 1;
      }
    });
    if (total(next) === 0) {
      // The worlds the evidence still allows were killed by these assumptions.
      const rules = new Set<RuleId>();
      worlds.forEach((_, i) => {
        const rule = killedBy[i];
        if (nextCore[i] && rule) rules.add(rule);
      });
      return { analysis: analysis(), contradiction: { event, rules: [...rules] } };
    }
    normalise(next);
    weights = next;
    core = nextCore;
    snapshots.push(snapshotOf(worlds, weights, core, n));
  }
  return { analysis: analysis(), contradiction: null };
}

function total(weights: Float64Array): number {
  let sum = 0;
  for (const w of weights) sum += w;
  return sum;
}

/** P(both spies) for every pair of seats. */
export function pairMatrix(analysis: Analysis, snapshot: Snapshot): number[][] {
  const n = analysis.playerCount;
  const m = Array.from({ length: n }, () => Array(n).fill(0));
  analysis.worlds.forEach((world, i) => {
    const w = snapshot.weights[i];
    if (w === 0) return;
    for (let a = 0; a < n; a++) {
      if (!(world & (1 << a))) continue;
      for (let b = 0; b < n; b++) if (world & (1 << b)) m[a][b] += w;
    }
  });
  return m;
}

/** The most likely worlds, best first. */
export function topWorlds(
  analysis: Analysis,
  snapshot: Snapshot,
  limit = 5,
): { spies: number[]; p: number }[] {
  const n = analysis.playerCount;
  return analysis.worlds
    .map((world, i) => ({ world, p: snapshot.weights[i] }))
    .filter((x) => x.p > 0)
    .sort((a, b) => b.p - a.p)
    .slice(0, limit)
    .map(({ world, p }) => ({
      spies: Array.from({ length: n }, (_, s) => s).filter((s) => world & (1 << s)),
      p,
    }));
}
