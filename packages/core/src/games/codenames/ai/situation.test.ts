import { describe, expect, it } from "vitest";
import type { ClueInput, GuessInput } from "./agent";
import { clueSituation, guessSituation, pendingTargets, readScore, urgencyOf } from "./situation";

function clueInput(over: Partial<ClueInput> = {}): ClueInput {
  return {
    model: "codenames-expert",
    mode: "classic",
    language: "en",
    cards: [
      { index: 0, word: "car", kind: "own", revealed: true },
      { index: 1, word: "bus", kind: "own", revealed: false },
      { index: 2, word: "train", kind: "own", revealed: false },
      { index: 3, word: "piano", kind: "opponent", revealed: false },
      { index: 4, word: "ghost", kind: "assassin", revealed: false },
    ],
    history: [
      {
        by: "us",
        clue: { word: "vehicle", count: 2 },
        guesses: [{ word: "car", result: "own" }],
        intended: ["car", "bus"],
      },
    ],
    agentsLeft: 2,
    opponentAgentsLeft: 5,
    ...over,
  };
}

function guessInput(over: Partial<GuessInput> = {}): GuessInput {
  return {
    model: "codenames-expert",
    mode: "classic",
    language: "en",
    words: [{ index: 1, word: "bus" }],
    clue: { word: "rail", count: 1 },
    guessesLeft: 2,
    agentsLeft: 4,
    opponentAgentsLeft: 4,
    history: [],
    ...over,
  };
}

describe("codenames AI situation", () => {
  it("finds the spymaster's own leftovers", () => {
    expect(pendingTargets(clueInput())).toEqual([{ clue: "VEHICLE 2", words: ["bus"] }]);
  });

  it("one leftover: don't re-clue it, the +1 covers it", () => {
    const text = clueSituation(clueInput()).join("\n");
    expect(text).toMatch(/Exactly one leftover/);
    expect(text).toMatch(/VEHICLE 2 → BUS/);
  });

  it("goes for everything when the other team is one away", () => {
    expect(urgencyOf(4, 1)).toBe("desperate");
    expect(clueSituation(clueInput({ opponentAgentsLeft: 1 })).join("\n")).toMatch(/URGENT/);
    expect(guessSituation(guessInput({ opponentAgentsLeft: 1 })).urgency).toBe("desperate");
  });

  it("reads the other team's unfinished clue as a warning", () => {
    const text = guessSituation(
      guessInput({
        history: [
          {
            by: "them",
            clue: { word: "animal", count: 3 },
            guesses: [{ word: "owl", result: "opponent" }],
          },
        ],
      }),
    ).lines.join("\n");
    expect(text).toMatch(/ANIMAL 3 found only 1/);
  });

  it("explains 0 and ∞ clues", () => {
    expect(guessSituation(guessInput({ clue: { word: "x", count: 0 } })).lines.join()).toMatch(
      /NONE of your agents/,
    );
    expect(
      guessSituation(guessInput({ clue: { word: "x", count: "unlimited" } })).lines.join(),
    ).toMatch(/collect the leftovers/);
  });

  it("scores a reader's ranking: hits in order, then the price of the miss", () => {
    const kinds = ["own", "own", "bystander", "assassin"] as const;
    const kindOf = (c: number) => kinds[c];
    expect(readScore([0, 1], kindOf, 2)).toBe(2);
    expect(readScore([0, 3], kindOf, 2)).toBe(-5);
    expect(readScore([2, 0], kindOf, 2)).toBeCloseTo(-0.1); // first-touch miss, one lead left
    expect(readScore([2], kindOf, 1)).toBeCloseTo(-0.4);
  });

  it("an ambitious clue that lands two beats a safe single", () => {
    const kinds = ["own", "own", "bystander", "own", "opponent"] as const;
    const kindOf = (c: number) => kinds[c];
    const safeSingle = readScore([0], kindOf, 1);
    const ambitious = readScore([0, 2, 1], kindOf, 3); // one, a bystander, one more in reach
    expect(ambitious).toBeGreaterThan(safeSingle);
    expect(readScore([0, 1, 2, 3], kindOf, 4)).toBeGreaterThan(readScore([0, 1], kindOf, 2) - 0.2);
    // Handing the other team a point is never worth it.
    expect(readScore([0, 4, 1], kindOf, 3)).toBeLessThan(safeSingle);
  });
});
