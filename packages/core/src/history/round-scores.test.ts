import { describe, expect, it } from "vitest";
import {
  describeRoundScoresError,
  resolveRound,
  roundWinCounts,
  roundWinLeaders,
} from "./round-scores.ts";

const player = (
  score: number,
  roundScores: number[] | undefined,
  rank?: number,
): { score: number; roundScores?: number[]; rank?: number } => ({
  score,
  ...(roundScores !== undefined ? { roundScores } : {}),
  ...(rank !== undefined ? { rank } : {}),
});

// A takes rounds 1+3 narrowly, B takes round 2 big — 2–1 on seals for A
// despite 97 < 110 rupees.
const decisive = [player(97, [52, 10, 35]), player(110, [48, 60, 2])];
// Round 1 ties at 50 — the tiebreak cases build on this.
const tiedR1 = [player(90, [50, 10, 30]), player(112, [50, 60, 2])];

describe("resolveRound", () => {
  it("gives an untied round to its rupee leader", () => {
    expect(resolveRound(decisive, 0)).toEqual({ winner: 0, by: "rupees" });
    expect(resolveRound(decisive, 1)).toEqual({ winner: 1, by: "rupees" });
  });

  it("walks the rulebook ladder on a tie: bonus tokens, then goods tokens", () => {
    expect(resolveRound(tiedR1, 0)).toEqual({ winner: null, needs: "bonus" });
    expect(resolveRound(tiedR1, 0, { round: 0, bonusTokens: [3, 1] })).toEqual({
      winner: 0,
      by: "bonus",
    });
    expect(resolveRound(tiedR1, 0, { round: 0, bonusTokens: [2, 2] })).toEqual({
      winner: null,
      needs: "goods",
    });
    expect(resolveRound(tiedR1, 0, { round: 0, bonusTokens: [2, 2], goodsTokens: [4, 7] })).toEqual(
      { winner: 1, by: "goods" },
    );
    expect(resolveRound(tiedR1, 0, { round: 0, bonusTokens: [2, 2], goodsTokens: [5, 5] })).toEqual(
      { winner: null, needs: "unbreakable" },
    );
  });

  it("treats an all-zero round as missing scores, not a real tie", () => {
    expect(resolveRound([player(50, [50, 0]), player(40, [40, 0])], 1)).toEqual({
      winner: null,
      needs: "scores",
    });
  });
});

describe("roundWinCounts / roundWinLeaders", () => {
  it("counts seals per player, unresolved rounds awarding nobody", () => {
    expect(roundWinCounts(decisive)).toEqual([2, 1]);
    expect(roundWinCounts(tiedR1)).toEqual([1, 1]);
    expect(roundWinLeaders(tiedR1)).toEqual([0, 1]);
  });

  it("counts a tied round's seal through its tiebreak", () => {
    const tiebreaks = [{ round: 0, bonusTokens: [3, 1] }];
    expect(roundWinCounts(tiedR1, tiebreaks)).toEqual([2, 1]);
    expect(roundWinLeaders(tiedR1, tiebreaks)).toEqual([0]);
  });

  it("handles empty and roundless inputs", () => {
    expect(roundWinCounts([])).toEqual([]);
    expect(roundWinCounts([player(5, undefined), player(3, undefined)])).toEqual([0, 0]);
  });
});

describe("describeRoundScoresError", () => {
  const good = { players: [player(97, [52, 10, 35], 1), player(110, [48, 60, 2], 2)] };

  it("passes a coherent record and ignores records without round scores", () => {
    expect(describeRoundScoresError(good)).toBeNull();
    expect(
      describeRoundScoresError({ players: [player(42, undefined), player(30, undefined)] }),
    ).toBeNull();
  });

  it("accepts a tied round settled by bonus tokens, and by goods tokens", () => {
    const byBonus = {
      players: [player(90, [50, 10, 30], 1), player(112, [50, 60, 2], 2)],
      roundTiebreaks: [{ round: 0, bonusTokens: [3, 1] }],
    };
    expect(describeRoundScoresError(byBonus)).toBeNull();
    const byGoods = {
      players: [player(90, [50, 10, 30], 2), player(112, [50, 60, 2], 1)],
      roundTiebreaks: [{ round: 0, bonusTokens: [2, 2], goodsTokens: [4, 7] }],
    };
    expect(describeRoundScoresError(byGoods)).toBeNull();
  });

  it("walks the recorder through an unsettled tie, step by step", () => {
    const tied = (
      roundTiebreaks?: { round: number; bonusTokens: number[]; goodsTokens?: number[] }[],
    ) => ({
      players: [player(90, [50, 10, 30]), player(112, [50, 60, 2])],
      ...(roundTiebreaks ? { roundTiebreaks } : {}),
    });
    expect(describeRoundScoresError(tied())).toBe("round 1 is tied — record its bonus tokens");
    expect(describeRoundScoresError(tied([{ round: 0, bonusTokens: [2, 2] }]))).toBe(
      "round 1's bonus tokens are tied — record its goods tokens",
    );
    expect(
      describeRoundScoresError(tied([{ round: 0, bonusTokens: [2, 2], goodsTokens: [5, 5] }])),
    ).toBe("round 1 is still tied — check its bonus and goods token counts");
  });

  it("flags stale, duplicate, misaligned, or superfluous tiebreak records", () => {
    expect(
      describeRoundScoresError({
        players: good.players,
        roundTiebreaks: [{ round: 0, bonusTokens: [3, 1] }],
      }),
    ).toMatch(/round 1 isn't tied/);
    expect(
      describeRoundScoresError({
        players: [player(90, [50, 10, 30], 1), player(112, [50, 60, 2], 2)],
        roundTiebreaks: [
          { round: 0, bonusTokens: [3, 1] },
          { round: 0, bonusTokens: [1, 3] },
        ],
      }),
    ).toMatch(/more than one tiebreak/);
    expect(
      describeRoundScoresError({
        players: [player(90, [50, 10, 30], 1), player(112, [50, 60, 2], 2)],
        roundTiebreaks: [{ round: 0, bonusTokens: [3] }],
      }),
    ).toMatch(/must cover every player/);
    expect(
      describeRoundScoresError({
        players: [player(90, [50, 10, 30], 1), player(112, [50, 60, 2], 2)],
        roundTiebreaks: [{ round: 3, bonusTokens: [3, 1] }],
      }),
    ).toMatch(/references a round that isn't recorded/);
    // Bonus already decides it — goods must not be recorded (mirrors
    // Decrypto's "remove the tiebreak answer" strictness).
    expect(
      describeRoundScoresError({
        players: [player(90, [50, 10, 30], 1), player(112, [50, 60, 2], 2)],
        roundTiebreaks: [{ round: 0, bonusTokens: [3, 1], goodsTokens: [4, 7] }],
      }),
    ).toMatch(/already decide it — remove its goods tokens/);
    expect(
      describeRoundScoresError({
        players: [player(42, undefined), player(30, undefined)],
        roundTiebreaks: [{ round: 0, bonusTokens: [3, 1] }],
      }),
    ).toMatch(/needs round scores recorded/);
  });

  it("flags an empty round and split seals", () => {
    expect(describeRoundScoresError({ players: [player(50, [50, 0]), player(40, [40, 0])] })).toBe(
      "round 2 has no rupees recorded",
    );
    // Two settled rounds split 1–1 — a best-of-three can't end there.
    expect(
      describeRoundScoresError({ players: [player(60, [50, 10]), player(52, [40, 12])] }),
    ).toBe("the seals are split — record the deciding round");
  });

  it("flags partial or unequal round records", () => {
    expect(
      describeRoundScoresError({
        players: [player(97, [52, 10, 35], 1), player(110, undefined, 2)],
      }),
    ).toMatch(/round scores recorded/);
    expect(
      describeRoundScoresError({
        players: [player(97, [52, 10, 35], 1), player(108, [48, 60], 2)],
      }),
    ).toMatch(/same number of rounds/);
  });

  it("flags out-of-bounds round counts", () => {
    expect(
      describeRoundScoresError({ players: [player(52, [52], 1), player(48, [48], 2)] }),
    ).toMatch(/2–3 rounds/);
    expect(
      describeRoundScoresError({
        players: [player(4, [1, 1, 1, 1], 1), player(0, [0, 0, 0, 0], 2)],
      }),
    ).toMatch(/2–3 rounds/);
  });

  it("flags a draw, a bad total, missing or non-1..n ranks, and a false crown", () => {
    expect(describeRoundScoresError({ ...good, draw: true as const })).toMatch(/cannot be a draw/);
    expect(
      describeRoundScoresError({
        players: [player(98, [52, 10, 35], 1), player(110, [48, 60, 2], 2)],
      }),
    ).toMatch(/sum of that player's round scores/);
    expect(
      describeRoundScoresError({
        players: [player(97, [52, 10, 35]), player(110, [48, 60, 2], 2)],
      }),
    ).toMatch(/every player placed/);
    expect(
      describeRoundScoresError({
        players: [player(97, [52, 10, 35], 1), player(110, [48, 60, 2], 3)],
      }),
    ).toMatch(/rank every player/);
    expect(
      describeRoundScoresError({
        players: [player(97, [52, 10, 35], 2), player(110, [48, 60, 2], 1)],
      }),
    ).toMatch(/doesn't match the recorded round scores/);
  });
});
