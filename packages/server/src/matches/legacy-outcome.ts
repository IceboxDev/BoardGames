/**
 * The outcome of a replay row saved before outcomes were recorded (migration
 * 0046). Those rows kept a free-text `winner` whose meaning depended on the
 * game — so this is the one place that knows those meanings, and it corrects
 * the two that were recorded wrong.
 */

import { type GameOutcome, rankedByWinners } from "@boardgames/core/machines/outcome";

export interface LegacyReplayRow {
  readonly gameSlug: string;
  readonly winner: string | null;
  readonly playerCount: number | null;
  readonly scores: readonly number[] | null;
}

/** Co-operative games: `winner` was "p0" for a team win and "p1" for a loss. */
const COOP = new Set(["sky-team", "quiztopia", "pandemic"]);

function seatOf(winner: string | null): number | null {
  const match = winner ? /^p(\d+)$/.exec(winner) : null;
  return match ? Number(match[1]) : null;
}

export function legacyOutcome(row: LegacyReplayRow): GameOutcome {
  const seats = row.playerCount ?? row.scores?.length ?? 2;
  const seat = seatOf(row.winner);

  if (COOP.has(row.gameSlug)) {
    // Pandemic was always stored as "draw" (its result is a bare string the old
    // writer never matched), so its true result is unknown — report a loss
    // rather than invent a win.
    return { kind: "coop", won: seat === 0 };
  }

  if (row.gameSlug === "decrypto") {
    // `winner` was the winning TEAM: seats 0–1 are team 0; team 1 is seats 2–3
    // (or the lone interceptor at seat 2 when three played).
    const teamOf = Array.from({ length: Math.max(seats, 3) }, (_, s) => (s < 2 ? 0 : 1));
    return { kind: "teams", teamOf, winningTeam: seat };
  }

  if (row.gameSlug === "durak") {
    // `winner` held the durak — the LOSER. Everyone else shares first place.
    return {
      kind: "ranked",
      placements: Array.from({ length: seats }, (_, s) =>
        seat === null || s !== seat ? 1 : seats,
      ),
    };
  }

  const scores = row.scores && row.scores.length === seats ? row.scores : undefined;
  return rankedByWinners(seats, seat === null ? [] : [seat], scores);
}
