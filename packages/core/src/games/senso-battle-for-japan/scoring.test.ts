import { describe, expect, it } from "vitest";
import { buildResult, computeScores, resolveWinners, scoreEmperor } from "./scoring";
import { baseState, lettersFromBoard, setBoard, setFactions } from "./test-helpers";

describe("scoring on the setup board", () => {
  it("scores cube VP plus one per controlled region", () => {
    const state = setFactions(baseState(4), ["takeda", "uesugi", "oda", "mori"]);
    expect(lettersFromBoard(state.board)).toEqual([
      "m..",
      "m.",
      "m.",
      ".",
      "o..",
      "oo",
      "tto",
      ".",
      "utu",
      "u..",
    ]);
    expect(computeScores(state)).toEqual([8, 8, 8, 7]);
  });

  it("the Emperor scores 2 per empty-or-uncontrolled region, 0 for a cube in region 4 or 8", () => {
    const state = setFactions(baseState(5), [null, "takeda", "uesugi", "oda", "mori"]);
    expect(scoreEmperor(state.board)).toBe(14);
    expect(computeScores(state)[0]).toBe(14);
    state.board[3] = ["takeda"];
    expect(scoreEmperor(state.board)).toBe(12);
    state.board[7] = ["mori"];
    expect(scoreEmperor(state.board)).toBe(10);
    // Breaking Takeda's control of region 7 (label) turns it back on for the Emperor.
    state.board[6] = ["takeda", "uesugi", "oda"];
    expect(scoreEmperor(state.board)).toBe(12);
  });
});

describe("tie-breaks", () => {
  it("equal scores fall back to cubes on the map", () => {
    const state = setFactions(baseState(2), ["takeda", "uesugi"]);
    // Takeda: 3 VP (one cube); Uesugi: 2+1 (two cubes, no control bonus since split).
    setBoard(state, ["t..", "u.", "..", ".", "...", "..", "...", "u", "...", "..."]);
    const scores = computeScores(state);
    expect(scores).toEqual([3, 3]);
    expect(resolveWinners(state, scores)).toEqual({ winners: [1], tiebreak: "cubes" });
  });

  it("a persisting tie crowns a seated Emperor (literal rule) and is a draw without one", () => {
    const state = setFactions(baseState(2), ["takeda", "uesugi"]);
    setBoard(state, ["t..", "u.", "..", ".", "...", "..", "...", ".", "...", "..."]);
    const result = buildResult(state);
    expect(result.scores).toEqual([3, 2]);
    expect(result.winner).toBe(0);

    setBoard(state, ["t..", "..", "..", ".", "u..", "..", "...", ".", "...", "..."]);
    const draw = buildResult(state);
    expect(draw.winner).toBeNull();
    expect(draw.winners).toEqual([0, 1]);
    expect(draw.tiebreak).toBe("draw");
    expect(draw.placements).toEqual([1, 1]);

    const five = setFactions(baseState(5), [null, "takeda", "uesugi", "oda", "mori"]);
    setBoard(five, ["t..", "..", "..", ".", "u..", "..", "...", ".", "...", "..."]);
    const scores = computeScores(five);
    expect(scores).toEqual([20, 3, 3, 0, 0]);
    // Takeda and Uesugi tie on score and cubes; the Emperor, even from outside the tie, takes the throne.
    expect(resolveWinners(five, [0, 3, 3, 0, 0])).toEqual({ winners: [0], tiebreak: "emperor" });
    // Tied on score with the Emperor, the clans still win the cube count first.
    expect(resolveWinners(five, [3, 3, 0, 0, 0])).toEqual({ winners: [1], tiebreak: "cubes" });
  });
});
