import { isRaceTotalsOnly } from "@boardgames/core/history/score-race";
import type { MatchOutcomeFreeForAll } from "@boardgames/core/history/types";
import { reconcileRanks } from "./free-for-all-placement";

// Pure helpers behind ScoreRaceForm (Take 5, Bandit), kept apart from the
// component like jaipur-rounds.ts so the normalization is testable.

type Player = MatchOutcomeFreeForAll["players"][number];

/**
 * Converge a race record: every player holds the same number of hands (a
 * fresh roster starts on hand 1), `score` is the sum, and a tie pins `rank`.
 * A totals-only legacy record is left alone.
 */
export function normalizeRace(players: readonly Player[]): Player[] {
  if (players.length === 0 || isRaceTotalsOnly(players)) return [...players];
  const rounds = Math.max(1, ...players.map((p) => p.raceRounds?.length ?? 0));
  const padded = players.map((p) => {
    const raceRounds = (p.raceRounds ?? []).slice(0, rounds);
    while (raceRounds.length < rounds) raceRounds.push(0);
    return { ...p, raceRounds, score: raceRounds.reduce((a, b) => a + b, 0) };
  });
  if (padded.every((p) => p.score === 0)) return padded.map((p) => ({ ...p, rank: undefined }));
  return reconcileRanks(padded, true);
}

/** Whether two player lists carry the same hands, totals and ranks. */
export function sameRace(a: readonly Player[], b: readonly Player[]): boolean {
  return (
    a.length === b.length &&
    a.every((p, i) => {
      const q = b[i];
      const ar = p.raceRounds ?? [];
      const br = q.raceRounds ?? [];
      return (
        p.userId === q.userId &&
        p.score === q.score &&
        p.rank === q.rank &&
        (p.raceRounds === undefined) === (q.raceRounds === undefined) &&
        ar.length === br.length &&
        ar.every((s, r) => s === br[r])
      );
    })
  );
}
