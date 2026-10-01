/**
 * The Solver showing its work. Every number on the dashboard can be taken
 * apart here into the sums that produced it:
 *
 *   - `teamMath`   — P(success) = Σₖ P(k spies aboard) × P(fewer Fails than needed | k),
 *                    with each spy's fail chance derived rule by rule.
 *   - `seatStory`  — how one seat's P(spy) moved, event by event.
 *   - `factProof`  — which events (and which rules) ruled out every spy set
 *                    that would have made a fact false.
 */

import { failsNeeded, isApproved, maskOf, popcount } from "../rules";
import type { RuleId } from "./assumptions";
import { breaksFact, type Deduction, type SeatNamer } from "./deductions";
import { type FailChanceStep, type ModelEnv, type Situation, spyFailChance } from "./model";
import type { Analysis, Snapshot, SolverEvent } from "./posterior";
import { successChance } from "./recommend";

/** "Mission 2 — Bo, Cy, Dee: 1 Fail", "Ada proposes …", "Vote on …: approved 5–2". */
export function describeEvent(event: SolverEvent, playerCount: number, name: SeatNamer): string {
  const team = event.proposal.team.map(name).join(", ");
  switch (event.kind) {
    case "proposal":
      return `${name(event.proposal.leader)} proposed ${team} for mission ${event.proposal.mission + 1}`;
    case "vote": {
      const yes = event.votes.filter(Boolean).length;
      return `Vote on ${team}: ${isApproved(event.votes, playerCount) ? "approved" : "rejected"} ${yes}–${playerCount - yes}`;
    }
    case "mission":
      return `Mission ${event.proposal.mission + 1} (${team}): ${event.fails} Fail${event.fails === 1 ? "" : "s"} — ${event.success ? "success" : "sabotaged"}`;
  }
}

// ── Team math ────────────────────────────────────────────────────────────

export interface SpiesAboardRow {
  /** k — spies aboard. */
  spies: number;
  /** Spy sets (still possible) with exactly k aboard. */
  worlds: number;
  /** P(k spies aboard) — the weight of those sets. */
  pWorlds: number;
  /** One spy's chance of playing Fail here, and how it was derived. */
  failChance: number;
  steps: FailChanceStep[];
  /** P(fewer than `needed` Fails | k spies, each failing independently). */
  pSuccessGiven: number;
  /** pWorlds × pSuccessGiven. */
  contribution: number;
}

export interface TeamMath {
  team: number[];
  mission: number;
  needed: number;
  pClean: number;
  pSuccess: number;
  aliveWorlds: number;
  members: { seat: number; pSpy: number; proven: "spy" | "resistance" | null }[];
  rows: SpiesAboardRow[];
}

export function teamMath(
  analysis: Analysis,
  snapshot: Snapshot,
  team: readonly number[],
  mission: number,
  situation: Situation,
  env: ModelEnv,
): TeamMath {
  const mask = maskOf(team);
  const needed = failsNeeded(analysis.playerCount, mission);
  const rows = new Map<number, { worlds: number; pWorlds: number }>();
  analysis.worlds.forEach((world, i) => {
    const w = snapshot.weights[i] ?? 0;
    if (w === 0) return;
    const k = popcount(world & mask);
    const row = rows.get(k) ?? { worlds: 0, pWorlds: 0 };
    row.worlds++;
    row.pWorlds += w;
    rows.set(k, row);
  });
  const out: SpiesAboardRow[] = [...rows.entries()]
    .sort(([a], [b]) => a - b)
    .map(([spies, { worlds, pWorlds }]) => {
      const fail =
        spies === 0
          ? { chance: 0, steps: [] }
          : spyFailChance({ mission, teamSize: team.length, spiesOnTeam: spies, situation }, env);
      const pSuccessGiven = spies === 0 ? 1 : successChance(spies, needed, fail.chance);
      return {
        spies,
        worlds,
        pWorlds,
        failChance: fail.chance,
        steps: fail.steps,
        pSuccessGiven,
        contribution: pWorlds * pSuccessGiven,
      };
    });
  return {
    team: [...team],
    mission,
    needed,
    pClean: out.find((r) => r.spies === 0)?.pWorlds ?? 0,
    pSuccess: out.reduce((a, r) => a + r.contribution, 0),
    aliveWorlds: snapshot.alive,
    members: team.map((seat) => {
      const core = snapshot.pSpyCore[seat] ?? 0;
      return {
        seat,
        pSpy: snapshot.pSpy[seat] ?? 0,
        proven: core === 1 ? "spy" : core === 0 ? "resistance" : null,
      };
    }),
    rows: out,
  };
}

// ── One seat over time ───────────────────────────────────────────────────

export interface SeatMove {
  event: SolverEvent;
  before: number;
  after: number;
  /**
   * What did it: the rules (or the cards) that ruled spy sets out at this
   * event — empty when the event only re-weighed them (a soft lean).
   */
  ruledOutBy: (RuleId | "cards")[];
}

export interface SeatStory {
  seat: number;
  /** P(spy) after each snapshot (index = events applied). */
  series: { at: number; pSpy: number; pSpyCore: number }[];
  /** Spy sets still possible that contain the seat / all still possible. */
  worldsWith: number;
  worldsAlive: number;
  /** The events that moved this seat's odds the most, biggest first. */
  moves: SeatMove[];
}

export function seatStory(analysis: Analysis, seat: number, at: number): SeatStory {
  const snaps = analysis.snapshots.slice(0, at + 1);
  const series = snaps.map((s, i) => ({
    at: i,
    pSpy: s.pSpy[seat] ?? 0,
    pSpyCore: s.pSpyCore[seat] ?? 0,
  }));
  const moves: SeatMove[] = [];
  for (let i = 0; i < snaps.length - 1; i++) {
    const event = analysis.events[i];
    const before = series[i]?.pSpy ?? 0;
    const after = series[i + 1]?.pSpy ?? 0;
    if (event && Math.abs(after - before) >= 0.005) {
      const by = new Set<RuleId | "cards">();
      for (const fate of analysis.fates) {
        const f = fate.model;
        if (f && f.event === i && f.by !== "perspective") by.add(f.by);
      }
      moves.push({ event, before, after, ruledOutBy: [...by] });
    }
  }
  moves.sort((a, b) => Math.abs(b.after - b.before) - Math.abs(a.after - a.before));
  const snap = analysis.snapshots[at];
  let worldsWith = 0;
  analysis.worlds.forEach((world, i) => {
    if ((snap?.weights[i] ?? 0) > 0 && world & (1 << seat)) worldsWith++;
  });
  return {
    seat,
    series,
    worldsWith,
    worldsAlive: snap?.alive ?? 0,
    moves: moves.slice(0, 6),
  };
}

// ── Proof of a fact ──────────────────────────────────────────────────────

export interface ProofStep {
  /** -1 = known before the game (the perspective's own role). */
  event: number;
  by: RuleId | "cards" | "perspective";
  /** Spy sets this step ruled out that would have broken the fact. */
  count: number;
}

export interface FactProof {
  /** Spy sets that would make the fact false. */
  breaking: number;
  /** How they were ruled out, in game order. */
  steps: ProofStep[];
  /** Breaking sets still standing (0 when the fact holds). */
  standing: number;
  /** All spy sets at the start. */
  total: number;
}

export function factProof(analysis: Analysis, at: number, fact: Deduction): FactProof {
  const snap = analysis.snapshots[at];
  const groups = new Map<string, ProofStep>();
  let breaking = 0;
  let standing = 0;
  analysis.worlds.forEach((world, i) => {
    if (!breaksFact(fact, world)) return;
    breaking++;
    const fates = analysis.fates[i];
    // A proven fact needs a certain elimination; an assumed one takes either.
    const fate =
      fates?.core && fates.core.event < at
        ? fates.core
        : fact.certainty === "assumed" && fates?.model && fates.model.event < at
          ? fates.model
          : null;
    if (!fate) {
      if ((snap?.weights[i] ?? 0) > 0 || (snap?.core[i] ?? 0) === 1) standing++;
      return;
    }
    const key = `${fate.event}:${fate.by}`;
    const step = groups.get(key) ?? { event: fate.event, by: fate.by, count: 0 };
    step.count++;
    groups.set(key, step);
  });
  return {
    breaking,
    steps: [...groups.values()].sort((a, b) => a.event - b.event),
    standing,
    total: analysis.worlds.length,
  };
}
