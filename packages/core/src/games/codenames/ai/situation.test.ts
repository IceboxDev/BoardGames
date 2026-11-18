import { describe, expect, it } from "vitest";
import type { ClueInput, GuessInput } from "./agent";
import {
  closesTheBoard,
  clueSituation,
  clueUrgency,
  guessSituation,
  pendingTargets,
  readScore,
  urgencyOf,
} from "./situation";

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
    ).toMatch(/EVERYTHING left is covered/);
  });

  it("∞ tells the guessers how many are left and how many the clue itself holds", () => {
    const text = guessSituation(
      guessInput({
        clue: { word: "rail", count: "unlimited" },
        agentsLeft: 3,
        history: [
          {
            by: "us",
            clue: { word: "vehicle", count: 2 },
            guesses: [{ word: "car", result: "own" }],
          },
        ],
      }),
    ).lines.join("\n");
    expect(text).toMatch(/VEHICLE: 1\) are ALL 3/);
    expect(text).toMatch(/RAIL itself points to about 2/);
  });

  it("the ∞ agreement: ∞ exactly when the clue and the owed words cover every agent left", () => {
    // BUS is owed from VEHICLE 2; TRAIN is the only other agent.
    expect(closesTheBoard(clueInput(), [2])).toBe(true);
    expect(closesTheBoard(clueInput(), [1, 2])).toBe(true);
    expect(closesTheBoard(clueInput(), [])).toBe(false);
    // With nothing owed, a clue for one of the two leaves one undescribed.
    expect(closesTheBoard(clueInput({ history: [] }), [2])).toBe(false);
    expect(closesTheBoard(clueInput({ history: [] }), [1, 2])).toBe(true);
    // Duet keeps the same agreement.
    expect(closesTheBoard(clueInput({ mode: "duet" }), [2])).toBe(true);
  });

  it("tells the spymaster which clue becomes ∞", () => {
    expect(clueSituation(clueInput()).join("\n")).toMatch(
      /links the other 1 agent covers everything/,
    );
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

describe("the race shifts a clue's risks", () => {
  const kinds = ["own", "own", "own", "bystander", "opponent", "assassin"] as const;
  const kindOf = (c: number) => kinds[c];
  // A 3 that reads 2-for-3 against a clean 2.
  const bigRead = [
    { card: 0, confidence: 0.9 },
    { card: 1, confidence: 0.8 },
    { card: 3, confidence: 0.4 },
  ];
  const big = (u: Parameters<typeof readScore>[4]) => readScore(bigRead, kindOf, 3, [0, 1, 2], u);
  const two = (u: Parameters<typeof readScore>[4]) =>
    readScore(
      [0, 1].map((card) => ({ card, confidence: 0.9 })),
      kindOf,
      2,
      [0, 1],
      u,
    );

  it("behind, a 3 that lands 2 costs next to nothing over a clean 2; ahead, it costs more", () => {
    expect(big("behind")).toBeGreaterThan(two("behind") - 0.15);
    expect(big("desperate")).toBeGreaterThan(two("desperate") - 0.06);
    expect(two("ahead") - big("ahead")).toBeGreaterThan(two("even") - big("even"));
    expect(two("even") - big("even")).toBeGreaterThan(two("behind") - big("behind"));
  });

  it("a miss costs more ahead than behind; the assassin is fatal whatever the score", () => {
    const miss = (u: Parameters<typeof readScore>[4]) =>
      readScore([{ card: 4, confidence: 0.9 }], kindOf, 1, [], u);
    expect(miss("ahead")).toBeLessThan(miss("even"));
    expect(miss("behind")).toBeGreaterThan(miss("even"));
    for (const u of ["desperate", "behind", "even", "ahead"] as const) {
      expect(readScore([{ card: 5, confidence: 0.9 }], kindOf, 1, [], u)).toBe(-6);
    }
  });

  it("reads a Duet race off the timer", () => {
    const duet = (agentsLeft: number, turnsLeft: number) =>
      clueUrgency({
        model: "codenames-expert",
        mode: "duet",
        language: "en",
        cards: [],
        history: [],
        agentsLeft,
        turnsLeft,
      });
    expect(duet(5, 1)).toBe("desperate");
    expect(duet(9, 4)).toBe("behind");
    expect(duet(3, 5)).toBe("ahead");
    expect(duet(6, 4)).toBe("even");
  });
});
