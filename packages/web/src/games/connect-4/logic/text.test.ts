import type { GameRecord } from "@boardgames/core/games/connect-4/types";
import { describe, expect, it } from "vitest";
import { moveStory } from "./analysis-model";
import {
  bestText,
  chipText,
  columnsText,
  endWords,
  flawCount,
  ordinal,
  practiceFeedback,
  practicePrompt,
  seatName,
  storyText,
  unsolvedText,
  verdictText,
} from "./text";

const game = (patch: Partial<GameRecord>): GameRecord => ({
  firstPlayer: 0,
  moves: [],
  winner: null,
  reason: "full",
  winningCells: [],
  ...patch,
});

describe("Connect 4 words", () => {
  it("names a seat, falling back to its colour", () => {
    expect(seatName(0, ["Ann"])).toBe("Ann");
    expect(seatName(1, ["Ann"])).toBe("Yellow");
  });

  it("words every way a game ends", () => {
    expect(endWords(game({ reason: "connect", winner: 1 }), ["Ann", "Bo"])).toMatchObject({
      actor: 1,
      log: " connects four",
      status: "Bo connects four!",
    });
    expect(
      endWords(game({ reason: "resign", winner: 1, resigned: 0 }), ["Ann", "Bo"]),
    ).toMatchObject({
      actor: 0,
      status: "Bo wins — Ann resigned",
      summary: "Ann resigned.",
    });
    for (const reason of ["full", "repetition", "stalemate"] as const) {
      const words = endWords(game({ reason }), []);
      expect(words.actor).toBeNull();
      expect(words.log).toMatch(/^Draw — /);
      expect(words.status).toMatch(/^Drawn game — /);
    }
  });

  it("words the solver's verdict from either side, counting the winner's discs", () => {
    expect(verdictText({ kind: "win", discs: 3 }, 0, ["Ann", "Bo"])).toBe(
      "Ann wins with their 3rd disc from here",
    );
    expect(verdictText({ kind: "loss", discs: 1 }, 0, ["Ann", "Bo"])).toBe(
      "Bo wins with their next disc",
    );
    expect(verdictText({ kind: "win", discs: 0 }, 1, [])).toBe("Yellow wins with best play");
    expect(verdictText({ kind: "draw" }, 1, [])).toBe("Draw with best play");
  });

  it("speaks to the viewer as you", () => {
    expect(verdictText({ kind: "win", discs: 18 }, 0, ["You", "Perfect"])).toBe(
      "You win with your 18th disc from here",
    );
  });

  it("counts in English", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22].map(ordinal)).toEqual([
      "1st",
      "2nd",
      "3rd",
      "4th",
      "11th",
      "12th",
      "13th",
      "21st",
      "22nd",
    ]);
    expect(flawCount("mistake", 1)).toBe("1 mistake");
    expect(flawCount("inaccuracy", 2)).toBe("2 inaccuracies");
  });

  it("chips an outcome", () => {
    expect(chipText({ kind: "win", winner: 1, discs: 7 })).toBe("#7");
    expect(chipText({ kind: "draw" })).toBe("=");
    expect(chipText({ kind: "unknown" })).toBe("?");
    expect(chipText({ kind: "over", winner: 0 })).toBe("won");
  });

  it("tells what a move did", () => {
    const names = ["You", "Perfect"];
    const base = { index: 6, player: 0 as const, column: 1, bestColumns: [2, 4] };
    const thrown = moveStory({
      ...base,
      grade: "mistake",
      before: { kind: "win", discs: 9 },
      after: { kind: "draw" },
    });
    expect(storyText(thrown, names)).toBe(
      "Throws away the win: You were winning (#9), now it's a draw.",
    );
    expect(bestText(thrown)).toBe("Best: columns 3 or 5.");
    const slow = moveStory({
      ...base,
      grade: "inaccuracy",
      before: { kind: "win", discs: 9 },
      after: { kind: "win", discs: 12 },
    });
    expect(storyText(slow, names)).toBe("Still winning, but 3 discs slower: #12 instead of #9.");
    const nearly = moveStory({
      ...base,
      grade: "good",
      before: { kind: "win", discs: 9 },
      after: { kind: "win", discs: 10 },
    });
    expect(storyText(nearly, names)).toBe(
      "Good — keeps the win (#10), a disc off the fastest (#9).",
    );
    const holding = moveStory({
      ...base,
      grade: "good",
      before: { kind: "loss", discs: 6 },
      after: { kind: "loss", discs: 5 },
    });
    expect(storyText(holding, names)).toBe(
      "Good — holds out (#5), a disc short of the longest defence (#6).",
    );
    const blunder = moveStory({
      ...base,
      grade: "blunder",
      before: { kind: "win", discs: 9 },
      after: { kind: "loss", discs: 4 },
    });
    expect(storyText(blunder, names)).toBe(
      "Turns a win into a loss: Perfect wins with their 4th disc from here.",
    );
  });

  it("says why there is no verdict, honestly", () => {
    expect(unsolvedText("too-early", { cols: 8, rows: 7 }, 14)).toBe(
      "8×7 is too big to solve this early — exact from disc 14",
    );
    expect(unsolvedText("popout", { cols: 7, rows: 6 }, 8)).toMatch(/PopOut/);
    expect(columnsText([2, 4])).toBe("3 or 5");
    expect(columnsText([1, 2, 4])).toBe("2, 3 or 5");
  });

  it("sets and marks a practice task", () => {
    const names = ["You", "Perfect"];
    const story = moveStory({
      index: 6,
      player: 0,
      column: 1,
      grade: "mistake",
      before: { kind: "win", discs: 9 },
      after: { kind: "draw" },
      bestColumns: [2, 4],
    });
    expect(practicePrompt(story, names)).toBe(
      "Move 7: You played column 2 — win → draw. Find a move that keeps the win.",
    );
    expect(practiceFeedback("misses", 0, { kind: "win", winner: 1, discs: 4 }, [2, 4], names)).toBe(
      "Column 1 → Perfect wins with their 4th disc from here. Try again.",
    );
    expect(practiceFeedback("keeps", 3, { kind: "win", winner: 0, discs: 11 }, [2, 4], names)).toBe(
      "Column 4 keeps the result, but columns 3 or 5 are faster.",
    );
    expect(practiceFeedback("best", 2, { kind: "win", winner: 0, discs: 9 }, [2, 4], names)).toBe(
      "Column 3 — the best move.",
    );
  });

  it("calls the winning drop what it is", () => {
    const story = moveStory({
      index: 36,
      player: 1,
      column: 4,
      grade: "best",
      before: { kind: "win", discs: 1 },
      after: { kind: "win", discs: 1 },
      bestColumns: [4],
    });
    expect(storyText(story, ["You", "Perfect"])).toBe("Connects four — the game is won.");
  });
});
