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

describe("normalizeJaipurOutcome — round-count inference", () => {
  it("starts a fresh record at two rounds, unranked, with no tiebreaks", () => {
    const out = normalizeJaipurOutcome(outcome([jp("a"), jp("b")]));
    expect(out.players[0].roundScores).toEqual([0, 0]);
    expect(out.players.every((p) => p.rank === undefined)).toBe(true);
    expect(out.roundTiebreaks).toBeUndefined();
  });

  it("grows to three rounds the moment rounds 1+2 split 1–1", () => {
    const out = normalizeJaipurOutcome(outcome([jp("a", [52, 10]), jp("b", [48, 60])]));
    expect(out.players[0].roundScores).toEqual([52, 10, 0]);
    // Round 3 is still unplayed → no seal decision yet → unranked.
    expect(out.players.every((p) => p.rank === undefined)).toBe(true);
  });

  it("stays at two rounds on a 2–0 sweep and crowns the sweeper", () => {
    const out = normalizeJaipurOutcome(outcome([jp("a", [52, 48]), jp("b", [48, 40])]));
    expect(out.players[0]).toMatchObject({ score: 100, rank: 1, roundScores: [52, 48] });
    expect(out.players[1].rank).toBe(2);
  });

  it("crowns the seal leader of a full 2–1 record over a higher rupee total", () => {
    const out = normalizeJaipurOutcome(outcome([jp("a", [52, 10, 35]), jp("b", [48, 60, 2])]));
    expect(out.players[0]).toMatchObject({ score: 97, rank: 1 });
    expect(out.players[1]).toMatchObject({ score: 110, rank: 2 });
  });

  it("trims an untouched round 3 when an edit turns rounds 1+2 into a sweep", () => {
    const out = normalizeJaipurOutcome(outcome([jp("a", [52, 48, 0]), jp("b", [48, 40, 0])]));
    expect(out.players[0].roundScores).toEqual([52, 48]);
    expect(out.players[0].rank).toBe(1);
  });

  it("never trims a round 3 that holds scores — a mid-edit 2–0 state keeps data", () => {
    // The admin is correcting round 2; while typing, A briefly leads both
    // early rounds. Round 3's real scores must survive the pass-through.
    const out = normalizeJaipurOutcome(outcome([jp("a", [52, 48, 35]), jp("b", [48, 40, 2])]));
    expect(out.players[0].roundScores).toEqual([52, 48, 35]);
  });

  it("opens a tiebreak for a rupee-tied round and grows to three once it resolves 1–1", () => {
    const tied = normalizeJaipurOutcome(outcome([jp("a", [50, 10]), jp("b", [50, 60])]));
    // Round 1 unresolved → two rounds, zeroed bonus+goods fields open.
    expect(tied.players[0].roundScores).toEqual([50, 10]);
    expect(tied.roundTiebreaks).toEqual([{ round: 0, bonusTokens: [0, 0], goodsTokens: [0, 0] }]);
    const resolved = normalizeJaipurOutcome(
      outcome([jp("a", [50, 10]), jp("b", [50, 60])], [{ round: 0, bonusTokens: [3, 1] }]),
    );
    // A takes round 1 by bonus tokens, B round 2 → 1–1 → round 3 appears.
    expect(resolved.players[0].roundScores).toEqual([50, 10, 0]);
    expect(resolved.roundTiebreaks).toEqual([{ round: 0, bonusTokens: [3, 1] }]);
  });

  it("settles a full record through goods tokens and drops a stale tiebreak", () => {
    const byGoods = normalizeJaipurOutcome(
      outcome(
        [jp("a", [50, 10, 30]), jp("b", [50, 60, 2])],
        [{ round: 0, bonusTokens: [2, 2], goodsTokens: [7, 4] }],
      ),
    );
    // A takes round 1 by goods + round 3 by rupees — 2–1.
    expect(byGoods.players[0].rank).toBe(1);
    const stale = normalizeJaipurOutcome(
      outcome([jp("a", [52, 10, 35]), jp("b", [48, 60, 2])], [{ round: 0, bonusTokens: [3, 1] }]),
    );
    expect(stale.roundTiebreaks).toBeUndefined();
  });
});
