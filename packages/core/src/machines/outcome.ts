/**
 * How a finished game ended, in one shape every game shares.
 *
 * Each game keeps its own rich `getResult` for its game-over screen; the
 * outcome is the part everything *outside* the game reads — the replay store,
 * match history, ratings and the local AI tournament runner. Before it existed
 * those consumers guessed at field names (`winner`, `durak`, `outcome`,
 * `scoreA`…) and got it wrong: a Durak loser was recorded as the winner and
 * every Pandemic game as a draw.
 *
 * Three kinds cover every game:
 *   - `ranked` — each seat finishes in a place (1 = best; ties share a place,
 *     competition style: 1, 1, 3). Two-player games are ranked too.
 *   - `coop`   — the whole table wins or loses together.
 *   - `teams`  — seats belong to teams and one team wins (or nobody does).
 */

import { z } from "zod";

const RankedOutcomeSchema = z.object({
  kind: z.literal("ranked"),
  /** `placements[seat]`, 1-based. Every seat sharing place 1 is a draw. */
  placements: z.array(z.number().int().min(1)).min(1).readonly(),
  /** Final score per seat, when the game keeps one. */
  scores: z.array(z.number()).readonly().optional(),
});

const CoopOutcomeSchema = z.object({
  kind: z.literal("coop"),
  won: z.boolean(),
  /** A table score, when the game keeps one (e.g. cards answered). */
  score: z.number().optional(),
  /** Machine-readable reason, e.g. `"loss_outbreaks"`. */
  detail: z.string().optional(),
});

const TeamsOutcomeSchema = z.object({
  kind: z.literal("teams"),
  /** `teamOf[seat]` — the team index each seat played for. */
  teamOf: z.array(z.number().int().min(0)).min(2).readonly(),
  /** `null` when no team won (a draw). */
  winningTeam: z.number().int().min(0).nullable(),
  /** Score per team, when the game keeps one. */
  teamScores: z.array(z.number()).readonly().optional(),
});

export const GameOutcomeSchema = z.discriminatedUnion("kind", [
  RankedOutcomeSchema,
  CoopOutcomeSchema,
  TeamsOutcomeSchema,
]);
export type GameOutcome = z.infer<typeof GameOutcomeSchema>;
export type RankedOutcome = z.infer<typeof RankedOutcomeSchema>;
export type CoopOutcome = z.infer<typeof CoopOutcomeSchema>;
export type TeamsOutcome = z.infer<typeof TeamsOutcomeSchema>;

export type SeatResult = "win" | "loss" | "draw";

// ── Builders ──────────────────────────────────────────────────────────────

/**
 * Competition ranking of `scores` ("1224"): equal scores share a place and the
 * next place skips. `better: "high"` ranks the largest score first.
 */
export function placementsFromScores(
  scores: readonly number[],
  better: "high" | "low" = "high",
): number[] {
  return scores.map((score) => {
    const ahead = scores.filter((other) => (better === "high" ? other > score : other < score));
    return ahead.length + 1;
  });
}

/**
 * A ranked outcome ordered by each seat's key tuple, compared left to right,
 * higher first — `[score, tiebreak…]`. Seats equal on every key share a place.
 * `scores` records the first key.
 */
export function rankedByKeys(keys: readonly (readonly number[])[]): RankedOutcome {
  const beats = (a: readonly number[], b: readonly number[]) => {
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const x = a[i] ?? 0;
      const y = b[i] ?? 0;
      if (x !== y) return x > y;
    }
    return false;
  };
  return {
    kind: "ranked",
    placements: keys.map((mine) => keys.filter((other) => beats(other, mine)).length + 1),
    scores: keys.map((k) => k[0] ?? 0),
  };
}

/** A ranked outcome ordered by score. */
export function rankedByScore(
  scores: readonly number[],
  better: "high" | "low" = "high",
): RankedOutcome {
  return { kind: "ranked", placements: placementsFromScores(scores, better), scores: [...scores] };
}

/**
 * A ranked outcome from explicit winners: every seat in `winners` shares first
 * place and everyone else shares second. An empty `winners` is a draw.
 */
export function rankedByWinners(
  seatCount: number,
  winners: readonly number[],
  scores?: readonly number[],
): RankedOutcome {
  const placements = Array.from({ length: seatCount }, (_, seat) =>
    winners.length === 0 || winners.includes(seat) ? 1 : 2,
  );
  return { kind: "ranked", placements, ...(scores ? { scores: [...scores] } : {}) };
}

// ── Readers ───────────────────────────────────────────────────────────────

/** Win / loss / draw from one seat's point of view. */
export function seatResult(outcome: GameOutcome, seat: number): SeatResult {
  switch (outcome.kind) {
    case "coop":
      return outcome.won ? "win" : "loss";
    case "teams": {
      if (outcome.winningTeam === null) return "draw";
      return outcome.teamOf[seat] === outcome.winningTeam ? "win" : "loss";
    }
    case "ranked": {
      const place = outcome.placements[seat];
      if (place === undefined) return "loss";
      if (place !== 1) return "loss";
      return outcome.placements.every((p) => p === 1) ? "draw" : "win";
    }
  }
}

/** A seat's 1-based finishing place, or `null` where places don't apply (co-op). */
export function seatPlacement(outcome: GameOutcome, seat: number): number | null {
  switch (outcome.kind) {
    case "coop":
      return null;
    case "teams":
      if (outcome.winningTeam === null) return 1;
      return outcome.teamOf[seat] === outcome.winningTeam ? 1 : 2;
    case "ranked":
      return outcome.placements[seat] ?? null;
  }
}

/** A seat's final score (its team's, in a team game), or `null` when none is kept. */
export function seatScore(outcome: GameOutcome, seat: number): number | null {
  switch (outcome.kind) {
    case "coop":
      return outcome.score ?? null;
    case "teams": {
      const team = outcome.teamOf[seat];
      return team === undefined ? null : (outcome.teamScores?.[team] ?? null);
    }
    case "ranked":
      return outcome.scores?.[seat] ?? null;
  }
}

/**
 * Which of two groups of seats did better — for pitting two strategies against
 * each other at a table. The group holding the best place wins; when both hold
 * it, the lower mean place wins; otherwise it is a draw. For two seats this is
 * simply who won.
 */
export function compareSeatGroups(
  outcome: GameOutcome,
  groupA: readonly number[],
  groupB: readonly number[],
): "a" | "b" | "draw" {
  const places = (group: readonly number[]) =>
    group.map((seat) => seatPlacement(outcome, seat)).filter((p): p is number => p !== null);
  const a = places(groupA);
  const b = places(groupB);
  if (a.length === 0 || b.length === 0) return "draw";
  const bestA = Math.min(...a);
  const bestB = Math.min(...b);
  if (bestA !== bestB) return bestA < bestB ? "a" : "b";
  const meanA = a.reduce((s, p) => s + p, 0) / a.length;
  const meanB = b.reduce((s, p) => s + p, 0) / b.length;
  if (meanA === meanB) return "draw";
  return meanA < meanB ? "a" : "b";
}
