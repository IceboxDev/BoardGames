/**
 * Plain-English facts from a snapshot: what is PROVEN (by the game's own rule
 * and the perspective) and what is merely LIKELY (true in every world the
 * assumptions leave standing).
 */

import { maskOf, popcount } from "../rules";
import { RULE_INFO } from "./assumptions";
import type { Analysis, Snapshot } from "./posterior";

export type Certainty = "proven" | "assumed";

export interface Deduction {
  kind: "spies-exact" | "spy" | "resistance" | "at-least" | "clean" | "contradiction";
  certainty: Certainty;
  seats: number[];
  text: string;
}

export type SeatNamer = (seat: number) => string;

export const defaultNamer: SeatNamer = (seat) => `P${seat + 1}`;

function list(seats: readonly number[], name: SeatNamer): string {
  const names = seats.map(name);
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/** Min/max spies aboard `team` across the worlds a predicate keeps. */
function spyRange(
  analysis: Analysis,
  keep: (i: number) => boolean,
  team: readonly number[],
): [number, number] {
  const mask = maskOf(team);
  let lo = Number.POSITIVE_INFINITY;
  let hi = 0;
  analysis.worlds.forEach((world, i) => {
    if (!keep(i)) return;
    const c = popcount(world & mask);
    lo = Math.min(lo, c);
    hi = Math.max(hi, c);
  });
  return [lo === Number.POSITIVE_INFINITY ? 0 : lo, hi];
}

export function deductions(
  analysis: Analysis,
  at: number,
  name: SeatNamer = defaultNamer,
  /** A seat whose role the perspective already knows — not worth stating. */
  self?: number,
): Deduction[] {
  const snap: Snapshot | undefined = analysis.snapshots[at];
  if (!snap) return [];
  const n = analysis.playerCount;
  const out: Deduction[] = [];
  const seats = Array.from({ length: n }, (_, s) => s).filter((s) => s !== self);

  const exact = (certainty: Certainty, keep: (i: number) => boolean) => {
    const idx = analysis.worlds.findIndex((_, i) => keep(i));
    const world = analysis.worlds[idx] ?? 0;
    const spies = Array.from({ length: n }, (_, s) => s).filter((s) => world & (1 << s));
    out.push({
      kind: "spies-exact",
      certainty,
      seats: spies,
      text: `The spies are ${list(spies, name)}.`,
    });
  };

  if (snap.aliveCore === 1) exact("proven", (i) => snap.core[i] === 1);
  else if (snap.alive === 1) exact("assumed", (i) => snap.weights[i] > 0);

  if (snap.aliveCore > 1) {
    for (const s of seats) {
      const core = snap.pSpyCore[s] ?? 0;
      const model = snap.pSpy[s] ?? 0;
      if (core === 1) {
        out.push({ kind: "spy", certainty: "proven", seats: [s], text: `${name(s)} is a spy.` });
      } else if (core === 0) {
        out.push({
          kind: "resistance",
          certainty: "proven",
          seats: [s],
          text: `${name(s)} is Resistance.`,
        });
      } else if (snap.alive > 1 && model > 0.999) {
        out.push({ kind: "spy", certainty: "assumed", seats: [s], text: `${name(s)} is a spy.` });
      } else if (snap.alive > 1 && model < 0.001) {
        out.push({
          kind: "resistance",
          certainty: "assumed",
          seats: [s],
          text: `${name(s)} is Resistance.`,
        });
      }
    }

    // What each mission says about its team, where the players aren't settled.
    const settled = new Set(out.filter((d) => d.seats.length === 1).flatMap((d) => d.seats));
    for (const event of analysis.events.slice(0, at)) {
      if (event.kind !== "mission") continue;
      const team = event.proposal.team;
      if (team.every((s) => settled.has(s) || s === self)) continue;
      const label = `mission ${event.proposal.mission + 1}`;
      const [coreLo] = spyRange(analysis, (i) => snap.core[i] === 1, team);
      const [, modelHi] = spyRange(analysis, (i) => snap.weights[i] > 0, team);
      const provenAboard = team.filter((s) => snap.pSpyCore[s] === 1).length;
      if (coreLo > provenAboard && coreLo < team.length) {
        out.push({
          kind: "at-least",
          certainty: "proven",
          seats: [...team],
          text: `At least ${coreLo} of ${list(team, name)} ${coreLo === 1 ? "is a spy" : "are spies"} (${label}: ${event.fails} fail${event.fails === 1 ? "" : "s"}).`,
        });
      } else if (event.success && modelHi === 0) {
        out.push({
          kind: "clean",
          certainty: "assumed",
          seats: [...team],
          text: `The ${label} team — ${list(team, name)} — was clean.`,
        });
      }
    }
  }

  for (const c of analysis.contradictions) {
    if (c.event.index >= at) continue;
    out.push({
      kind: "contradiction",
      certainty: "assumed",
      seats: [],
      text: `Round ${c.event.round + 1} broke “${c.rules.map((r) => RULE_INFO[r].label).join("”, “")}” — relaxed there.`,
    });
  }
  for (const e of analysis.impossible) {
    if (e.index >= at) continue;
    out.push({
      kind: "contradiction",
      certainty: "proven",
      seats: [],
      text: `Round ${e.round + 1}'s ${e.kind} can't happen under the rules — check the entry; it was skipped.`,
    });
  }
  return out;
}
