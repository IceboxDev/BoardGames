import type { ClueInput, GuessInput } from "@boardgames/core/games/codenames/ai/agent";
import { describe, expect, it } from "vitest";
import { capPicks, ideaSizes, toCandidate } from "./codenames-agent";

// The SOFTWARE 4 turn from a real game: CAP was still owed from PROOFREADING.
const input: ClueInput = {
  model: "codenames-expert",
  mode: "classic",
  language: "en",
  cards: [
    { index: 0, word: "fox", kind: "own", revealed: false },
    { index: 1, word: "worm", kind: "own", revealed: false },
    { index: 2, word: "match", kind: "own", revealed: false },
    { index: 3, word: "cap", kind: "own", revealed: false },
    { index: 4, word: "spell", kind: "own", revealed: true },
    { index: 5, word: "pencil", kind: "own", revealed: true },
    { index: 6, word: "onion", kind: "bystander", revealed: false },
  ],
  history: [
    {
      by: "us",
      clue: { word: "proofreading", count: 3 },
      guesses: [
        { word: "pencil", result: "own" },
        { word: "spell", result: "own" },
      ],
      intended: ["cap", "spell", "pencil"],
    },
  ],
  agentsLeft: 4,
  opponentAgentsLeft: 3,
};

const raw = (targets: string[], leftovers: string[] = []) => ({
  clue: "software",
  unlimited: false,
  targets: targets.map((word) => ({ word, why: `${word} is software-ish` })),
  leftovers,
  risk: "onion",
  summary: "Things named in computing.",
});

describe("codenames agent — the leftover rule", () => {
  it("a leftover folded into a new clue goes to the +1 instead: SOFTWARE 3, not 4", () => {
    const c = toCandidate(raw(["fox", "worm", "match", "cap"]), input);
    expect(c?.clue).toEqual({ word: "software", count: 3 });
    expect(c?.targets).toEqual([0, 1, 2]);
    expect(c?.leftover).toEqual([3]);
    expect(c?.links.map((l) => l.card)).toEqual([0, 1, 2]);
  });

  it("two leftovers folded in → ∞, so the team can collect both", () => {
    const two: ClueInput = {
      ...input,
      history: [
        {
          by: "us",
          clue: { word: "proofreading", count: 3 },
          guesses: [{ word: "spell", result: "own" }],
          intended: ["cap", "match", "spell"],
        },
      ],
    };
    const c = toCandidate(raw(["fox", "worm", "match", "cap"]), two);
    expect(c?.clue.count).toBe("unlimited");
    expect(c?.targets).toEqual([0, 1]);
    expect(c?.leftover.sort()).toEqual([2, 3]);
  });

  it("keeps a clue that is only about leftovers as it is", () => {
    expect(toCandidate(raw(["cap"]), input)?.clue.count).toBe(1);
  });
});

describe("codenames agent — the extra guess", () => {
  const guessInput = (history: GuessInput["history"]): GuessInput => ({
    model: "codenames-expert",
    mode: "classic",
    language: "en",
    words: [],
    clue: { word: "dairy", count: 1 },
    guessesLeft: 2,
    agentsLeft: 4,
    opponentAgentsLeft: 4,
    history,
  });
  const pick = (word: string, forClue: string) => ({
    word,
    confidence: 0.9,
    why: "",
    for: forClue,
  });

  it("never spends the +1 on another word for the same clue (DAIRY 1 → CHEESE only)", () => {
    const kept = capPicks([pick("cheese", "dairy"), pick("butter", "dairy")], guessInput([]));
    expect(kept.map((p) => p.word)).toEqual(["cheese"]);
  });

  it("spends it on a word owed by an earlier clue", () => {
    const history: GuessInput["history"] = [
      { by: "us", clue: { word: "royalty", count: 2 }, guesses: [{ word: "king", result: "own" }] },
    ];
    const kept = capPicks(
      [pick("cheese", "dairy"), pick("butter", "dairy"), pick("court", "ROYALTY")],
      guessInput(history),
    );
    expect(kept.map((p) => p.word)).toEqual(["cheese", "court"]);
  });
});

describe("codenames agent — one idea per size", () => {
  it("asks for 4/3/2/1-word ideas, never more words than are left", () => {
    expect(ideaSizes(9)).toEqual([4, 3, 2, 1]);
    expect(ideaSizes(3)).toEqual([3, 2, 1]);
    expect(ideaSizes(1)).toEqual([1]);
  });
});
