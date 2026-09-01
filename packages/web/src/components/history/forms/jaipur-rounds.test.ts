import type { MatchOutcomeFreeForAll } from "@boardgames/core/history/types";
import { describe, expect, it } from "vitest";
import { normalizeJaipurOutcome } from "./jaipur-rounds";

type Player = MatchOutcomeFreeForAll["players"][number];

const jp = (userId: string, roundScores?: number[], rank?: number): Player => ({
  userId,
  displayName: `Player ${userId}`,
  score: 0,
  ...(roundScores !== undefined ? { roundScores } : {}),
  ...(rank !== undefined ? { rank } : {}),
});

const outcome = (
  players: Player[],
  roundTiebreaks?: MatchOutcomeFreeForAll["roundTiebreaks"],
): MatchOutcomeFreeForAll => ({
  kind: "free-for-all",
  scenario: "Standard",
  players,
  ...(roundTiebreaks ? { roundTiebreaks } : {}),
});

describe("normalizeJaipurOutcome", () => {
  it("pads missing rounds, sums totals, and crowns the seal leader over a higher total", () => {
    // A takes rounds 1+3 narrowly, B takes round 2 big — A wins 2–1 on seals
    // despite 97 < 110 rupees.
    const out = normalizeJaipurOutcome(outcome([jp("a", [52, 10, 35]), jp("b", [48, 60, 2])]), 3);
    expect(out.players[0]).toMatchObject({ score: 97, rank: 1, roundScores: [52, 10, 35] });
    expect(out.players[1]).toMatchObject({ score: 110, rank: 2, roundScores: [48, 60, 2] });
    expect(out.roundTiebreaks).toBeUndefined();
  });

  it("pads a fresh player to the round count and truncates on a 3→2 flip", () => {
    const padded = normalizeJaipurOutcome(outcome([jp("a", [52, 48]), jp("b")]), 2);
    expect(padded.players[1].roundScores).toEqual([0, 0]);
    const truncated = normalizeJaipurOutcome(
      outcome([jp("a", [52, 10, 35]), jp("b", [48, 60, 2])]),
      2,
    );
    expect(truncated.players[0]).toMatchObject({ score: 62, roundScores: [52, 10] });
    // Dropping A's round-3 win leaves a 1–1 seal split — ranks clear until the
    // deciding round comes back.
    expect(truncated.players.every((p) => p.rank === undefined)).toBe(true);
  });

  it("leaves the untouched all-zero state unranked with no tiebreaks", () => {
    const out = normalizeJaipurOutcome(outcome([jp("a", [0, 0, 0]), jp("b", [0, 0, 0])]), 3);
    expect(out.players.every((p) => p.rank === undefined)).toBe(true);
    expect(out.roundTiebreaks).toBeUndefined();
  });

  it("opens a zeroed tiebreak (bonus + goods, both tied at 0) for a rupee-tied round", () => {
    const out = normalizeJaipurOutcome(outcome([jp("a", [50, 10, 30]), jp("b", [50, 60, 2])]), 3);
    expect(out.roundTiebreaks).toEqual([{ round: 0, bonusTokens: [0, 0], goodsTokens: [0, 0] }]);
    // Unresolved round → no seal → 1–1 → unranked until the tokens settle it.
    expect(out.players.every((p) => p.rank === undefined)).toBe(true);
  });

  it("settles the seal from bonus tokens and strips the goods fields once they're moot", () => {
    const out = normalizeJaipurOutcome(
      outcome(
        [jp("a", [50, 10, 30]), jp("b", [50, 60, 2])],
        [{ round: 0, bonusTokens: [3, 1], goodsTokens: [0, 0] }],
      ),
      3,
    );
    expect(out.roundTiebreaks).toEqual([{ round: 0, bonusTokens: [3, 1] }]);
    // A takes round 1 by bonus tokens + round 3 by rupees — 2–1.
    expect(out.players[0].rank).toBe(1);
    expect(out.players[1].rank).toBe(2);
  });

  it("keeps goods tokens while the bonus tokens tie, and resolves through them", () => {
    const out = normalizeJaipurOutcome(
      outcome(
        [jp("a", [50, 10, 30]), jp("b", [50, 60, 2])],
        [{ round: 0, bonusTokens: [2, 2], goodsTokens: [4, 7] }],
      ),
      3,
    );
    expect(out.roundTiebreaks).toEqual([{ round: 0, bonusTokens: [2, 2], goodsTokens: [4, 7] }]);
    // B takes round 1 by goods tokens + round 2 by rupees — 2–1 for B.
    expect(out.players[1].rank).toBe(1);
    expect(out.players[0].rank).toBe(2);
  });

  it("drops a stale tiebreak when the edited rupees no longer tie", () => {
    const out = normalizeJaipurOutcome(
      outcome([jp("a", [52, 10, 35]), jp("b", [48, 60, 2])], [{ round: 0, bonusTokens: [3, 1] }]),
      3,
    );
    expect(out.roundTiebreaks).toBeUndefined();
    expect(out.players[0].rank).toBe(1);
  });
});
