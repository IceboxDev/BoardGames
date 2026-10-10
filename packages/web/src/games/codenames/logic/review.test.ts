import type { KeyEntry, TurnRecord } from "@boardgames/core/games/codenames/types";
import { describe, expect, it } from "vitest";
import { buildClassicReview } from "./review";

// Cards 0–2 Red, 3–4 Blue, 5 bystander, 6 assassin; the rest bystanders.
const key: KeyEntry[] = [0, 0, 0, 1, 1, "bystander", "assassin"];
while (key.length < 25) key.push("bystander");
const words = Array.from({ length: 25 }, (_, i) => `w${i}`);

const turns: TurnRecord[] = [
  {
    team: 0,
    clue: { word: "pair", count: 2 },
    guesses: [
      { card: 0, by: 2, result: 0 },
      { card: 5, by: 2, result: "bystander" },
    ],
    end: "miss",
    note: {
      targets: [0, 1],
      links: [{ card: 0, why: "a pair of socks" }],
      leftover: [2],
      reasoning: "Both are pairs.",
      considered: [{ word: "duo", count: 2, targets: [0, 1] }],
      testRead: [0, 1, 5],
      standIn: false,
      cost: { calls: 1, usd: 0.01 },
      traceIds: ["ai_x"],
    },
    guessNotes: [
      {
        picks: [
          { card: 0, confidence: 0.9, why: "obvious" },
          { card: 5, confidence: 0.6, why: "maybe" },
          { card: 9, confidence: 0.4, why: "long shot" },
        ],
        reasoning: "Pairs.",
        standIn: false,
        cost: null,
        traceIds: [],
      },
    ],
  },
  {
    team: 1,
    clue: { word: "blue", count: 1 },
    guesses: [{ card: 1, by: 3, result: 0 }],
    end: "miss",
  },
];

const model = buildClassicReview({
  words,
  key,
  startingTeam: 0,
  turns,
  ai: [null, "codenames-expert", "codenames-hard", null],
  names: [null, null, null, null],
});

describe("codenames review model", () => {
  it("tells what each target became", () => {
    const fates = model.turns[0]?.targets?.map((t) => [t.word, t.fate]);
    // W1 was uncovered by Blue on the next turn: the other side found it.
    expect(fates).toEqual([
      ["W0", "now"],
      ["W1", "them"],
    ]);
    expect(model.turns[0]?.targets?.map((t) => t.why)).toEqual(["a pair of socks", null]);
    expect(model.turns[0]?.leftover.map((t) => [t.word, t.fate])).toEqual([["W2", "never"]]);
    expect(model.turns[1]?.targets).toBeNull();
  });

  it("keeps the AI's reasons, confidence and the picks it never reached", () => {
    const turn = model.turns[0];
    expect(turn?.reasoning).toBe("Both are pairs.");
    expect(turn?.giverAi).toBeNull();
    expect(turn?.guesserAi).toBe("Analyst");
    expect(turn?.guesses.map((g) => [g.word, g.verdict, g.confidence])).toEqual([
      ["W0", "hit", 0.9],
      ["W5", "bystander", 0.6],
    ]);
    expect(turn?.unplayed.map((u) => u.word)).toEqual(["W9"]);
  });

  it("charts agents still to find — Red starts a card behind — and the board as it stood", () => {
    expect(model.series.map((s) => s.points)).toEqual([
      [9, 8, 7],
      [8, 8, 8],
    ]);
    const second = model.boardAt(1);
    expect(second[0]?.cover).toBe("red"); // covered on turn 1
    expect(second[1]).toMatchObject({ cover: "red", touch: 1, emphasis: "focus" });
    expect(second[3]).toMatchObject({ cover: null, keyTone: "blue", emphasis: "fade" });
    const first = model.boardAt(0);
    expect(first[1]).toMatchObject({ target: true, cover: null });
    expect(model.boardAt(null)[5]?.cover).toBe("tan");
  });

  it("names the best clue and the costliest touch", () => {
    expect(model.highlights.map((h) => h.label)).toContain("Best clue");
    expect(model.highlights.find((h) => h.label === "Costliest touch")?.value).toBe("W1");
  });
});
