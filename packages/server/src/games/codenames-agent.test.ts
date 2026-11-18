import type { ClueInput, GuessInput } from "@boardgames/core/games/codenames/ai/agent";
import { describe, expect, it } from "vitest";
import { capPicks, clueWordOf, ideaSizes, toCandidate } from "./codenames-agent";

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
  targets: targets.map((word) => ({ word, why: `${word} is software-ish` })),
  leftovers,
  risk: "onion",
  summary: "Things named in computing.",
});

describe("codenames agent — the leftover rule", () => {
  it("a leftover folded into a new clue is not counted: 3 new + CAP owed = all 4 left → SOFTWARE ∞", () => {
    const c = toCandidate(raw(["fox", "worm", "match", "cap"]), input);
    expect(c?.clue).toEqual({ word: "software", count: "unlimited" });
    expect(c?.targets).toEqual([0, 1, 2]);
    expect(c?.leftover).toEqual([3]);
    expect(c?.links.map((l) => l.card)).toEqual([0, 1, 2]);
  });

  it("short of every agent left, the number stays: SOFTWARE 2 with CAP owed of four", () => {
    expect(toCandidate(raw(["fox", "worm"]), input)?.clue).toEqual({
      word: "software",
      count: 2,
    });
  });

  it("two owed + two new = all four → ∞", () => {
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

describe("codenames agent — what a clue can mean", () => {
  const fresh: ClueInput = { ...input, history: [] };

  it("drops a target that isn't ours: CYCLONE 3 with KITE (a bystander) is CYCLONE 2", () => {
    const c = toCandidate(raw(["fox", "worm", "onion"]), fresh);
    expect(c?.clue.count).toBe(2);
    expect(c?.targets).toEqual([0, 1]);
    expect(c?.links.map((l) => l.card)).toEqual([0, 1]);
  });

  it("drops a target the spymaster itself rated a stretch", () => {
    const c = toCandidate(
      {
        ...raw([]),
        targets: [
          { word: "fox", why: "obvious", strength: "obvious" },
          { word: "worm", why: "fair", strength: "fair" },
          { word: "match", why: "water-flute idea", strength: "stretch" },
        ],
      },
      fresh,
    );
    expect(c?.clue.count).toBe(2);
    expect(c?.targets).toEqual([0, 1]);
  });

  it("a candidate that names only cards it can't mean is no clue — not a 0", () => {
    expect(toCandidate(raw(["onion"]), fresh)).toBeNull();
    expect(toCandidate(raw(["nonsense"]), fresh)).toBeNull();
    // A deliberate 0 (no targets named) stays a 0.
    expect(toCandidate(raw([]), fresh)?.clue.count).toBe(0);
  });
});

describe("codenames agent — a leftover named with its number", () => {
  it("reads the clue a pick is for from the label's first word", () => {
    expect(clueWordOf("ELECTRIC 3")).toBe("electric");
    expect(clueWordOf("electric (earlier clue)")).toBe("electric");
    expect(clueWordOf("Mäuse 2")).toBe("maeuse");
  });

  it("spends the +1 on a leftover labelled 'ELECTRIC 3' (it used to be dropped)", () => {
    const guess: GuessInput = {
      model: "codenames-expert",
      mode: "classic",
      language: "en",
      words: [
        { index: 0, word: "lamp" },
        { index: 1, word: "wire" },
        { index: 2, word: "gold" },
      ],
      clue: { word: "metal", count: 1 },
      guessesLeft: 2,
      agentsLeft: 5,
      opponentAgentsLeft: 5,
      history: [
        {
          by: "us",
          clue: { word: "electric", count: 3 },
          guesses: [{ word: "plug", result: "own" }],
        },
      ],
    };
    const pick = (word: string, f: string) => ({ word, confidence: 0.8, why: "", for: f });
    for (const label of ["ELECTRIC", "ELECTRIC 3", "electric (earlier clue)"]) {
      expect(
        capPicks([pick("gold", "METAL"), pick("wire", label)], guess).map((p) => p.word),
      ).toEqual(["gold", "wire"]);
    }
  });
});
