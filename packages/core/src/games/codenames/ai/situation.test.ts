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
    const sure = (...cards: number[]) => cards.map((card) => ({ card, confidence: 0.9 }));
    expect(readScore(sure(0, 1), kindOf, 2, [0, 1])).toBe(2);
    expect(readScore(sure(0, 3), kindOf, 2, [0, 1])).toBe(-5);
    expect(readScore(sure(2, 0), kindOf, 2, [0])).toBeCloseTo(-0.65); // first-touch miss, target unread
    expect(readScore(sure(2), kindOf, 1, [])).toBeCloseTo(-0.4);
  });

  it("stops where an operative would stop: a long shot earns nothing", () => {
    // CYCLONE 3 (traced): HURRICANE and TORNADO sure, then ICE at 25 % — ours by luck.
    const kinds = ["own", "own", "own", "own"] as const;
    const kindOf = (c: number) => kinds[c];
    const read = [
      { card: 0, confidence: 0.93 },
      { card: 1, confidence: 0.9 },
      { card: 2, confidence: 0.25 },
    ];
    expect(readScore(read, kindOf, 3, [0, 1])).toBe(2);
    // The first touch is always taken, however unsure.
    expect(readScore([{ card: 3, confidence: 0.2 }], kindOf, 1, [3])).toBe(1);
  });

  it("a stretch that lands one loses to the clean clue; a big clue that reads cleanly wins", () => {
    const kinds = ["own", "own", "own", "own", "bystander", "opponent"] as const;
    const kindOf = (c: number) => kinds[c];
    // ODOR 4 (traced): SOCK sure, then BONE at 35 % — three targets never read.
    const stretch = readScore(
      [
        { card: 0, confidence: 0.82 },
        { card: 1, confidence: 0.35 },
        { card: 2, confidence: 0.33 },
      ],
      kindOf,
      4,
      [0, 1, 2, 3],
    );
    const single = readScore([{ card: 0, confidence: 0.95 }], kindOf, 1, [0]);
    expect(stretch).toBeLessThan(single);
    const clean = readScore(
      [0, 1, 2].map((card) => ({ card, confidence: 0.8 })),
      kindOf,
      3,
      [0, 1, 2],
    );
    expect(clean).toBeGreaterThan(single);
    // Handing the other team a point is never worth it.
    const handsOver = readScore(
      [0, 5, 1].map((card) => ({ card, confidence: 0.8 })),
      kindOf,
      3,
      [0, 1],
    );
    expect(handsOver).toBeLessThan(single);
  });
});
