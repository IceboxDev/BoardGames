// The Mastermind's clue step with a canned model: size slots, the second
// brainstorm, readers matched to who will guess.
// No network — `setAiTransportsForTests` answers every call by its label.

import type { ClueInput } from "@boardgames/core/games/codenames/ai/agent";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setAiTransportsForTests } from "../lib/ai/generate";
import type { AiTransportRequest } from "../lib/ai/transports/types";
import { llmCodenamesAgent, playOut, simulatedGuessers, slotsToClue } from "./codenames-agent";

const BOARD: ClueInput = {
  model: "codenames-hard",
  mode: "classic",
  language: "en",
  cards: [
    { index: 0, word: "fox", kind: "own", revealed: false },
    { index: 1, word: "worm", kind: "own", revealed: false },
    { index: 2, word: "match", kind: "own", revealed: false },
    { index: 3, word: "onion", kind: "bystander", revealed: false },
    { index: 4, word: "lion", kind: "opponent", revealed: false },
    { index: 5, word: "knife", kind: "assassin", revealed: false },
  ],
  history: [],
  agentsLeft: 3,
  opponentAgentsLeft: 5,
};

const idea = (clue: string, words: string[], none = "") => ({
  clue,
  targets: words.map((word) => ({ word, why: `${word} fits`, strength: "obvious" })),
  leftovers: [],
  risk: "onion",
  summary: `${clue} links them.`,
  none,
});
const empty = (why: string) => ({ ...idea("", []), none: why });

/** A reader's answer: these words in order, all sure. */
const read = (...words: string[]) => ({
  reasoning: "read",
  picks: words.map((word) => ({ word, confidence: 0.9, why: "fits", for: "clue" })),
});

const clueOf = (req: AiTransportRequest) =>
  /CLUE: (\w+)/.exec(typeof req.user === "string" ? req.user : "")?.[1] ?? "";

function stub(answer: (req: AiTransportRequest) => unknown | Promise<unknown>) {
  vi.stubEnv("AI_SUSPENDED", "");
  vi.stubEnv("AI_PROFILE", "");
  vi.stubEnv("AI_MODEL", "");
  vi.stubEnv("AI_GATEWAY_API_KEY", "test-key");
  vi.stubEnv("AI_TRANSPORT", "sync");
  for (const tier of ["MEDIUM", "HARD", "EXPERT"]) vi.stubEnv(`CODENAMES_MODEL_${tier}`, "");
  const seen: AiTransportRequest[] = [];
  setAiTransportsForTests({
    sync: async (req) => {
      seen.push(req);
      return answer(req);
    },
  });
  return seen;
}

afterEach(() => {
  setAiTransportsForTests(null);
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("slotsToClue", () => {
  it("lists the filled slots largest first and finds the chosen one", () => {
    const clue = slotsToClue({
      groups: [],
      ideas: {
        one: idea("fire", ["match"]),
        three: empty("no theme"),
        two: idea("den", ["fox", "worm"]),
      },
      choice: "one",
    });
    expect(clue.candidates.map((c) => c.clue)).toEqual(["den", "fire"]);
    expect(clue.choice).toBe(1);
  });

  it("an answer that fills no slot is no answer", () => {
    expect(() =>
      slotsToClue({ groups: [], ideas: { one: empty("nothing") }, choice: "one" }),
    ).toThrow();
  });
});

describe("the Analyst's clue step (the former Mastermind)", () => {
  // The main call's choice is the safe 2; the second brainstorm finds a clean 3.
  const answers = (req: AiTransportRequest) => {
    if (req.label === "codenames-clue")
      return {
        groups: [{ theme: "animals", words: ["fox", "worm"], danger: "lion" }],
        ideas: {
          three: empty("no clean 3"),
          two: idea("den", ["fox", "worm"]),
          one: idea("fire", ["match"]),
        },
        choice: "two",
      };
    if (req.label === "codenames-clue-bold")
      return {
        groups: [],
        ideas: {
          three: idea("garden", ["fox", "worm", "match"]),
          two: idea("den", ["fox", "worm"]),
          one: empty("covered"),
        },
        choice: "three",
      };
    const clue = clueOf(req);
    if (clue === "GARDEN") return read("worm", "fox", "match");
    if (clue === "DEN") return read("fox", "worm");
    return read("match");
  };

  it("asks in size slots, pools the second brainstorm and gives the 3 that reads cleanly", async () => {
    const seen = stub(answers);
    const out = await llmCodenamesAgent.giveClue({ ...BOARD, operatives: [null] });
    // GARDEN covers all three agents left, nothing owed: a number, never ∞.
    expect(out).toMatchObject({ word: "garden", count: 3 });
    const main = seen.find((r) => r.label === "codenames-clue");
    expect(JSON.stringify(main?.jsonSchema)).toContain('"ideas"');
    expect(seen.filter((r) => r.label === "codenames-clue-bold")).toHaveLength(1);
    // A person guesses: every idea is read by two different readers.
    const reads = seen.filter((r) => r.label === "codenames-read");
    expect(new Set(reads.map((r) => r.modelRef.id)).size).toBe(2);
    expect(reads).toHaveLength(3 * 2);
    expect(out.considered?.map((c) => c.word)).toEqual(["den", "fire"]);
  });

  it("reads with the AI operatives' own tier when an AI will guess", async () => {
    const seen = stub(answers);
    await llmCodenamesAgent.giveClue({ ...BOARD, operatives: ["codenames-medium"] });
    const reads = seen.filter((r) => r.label === "codenames-read");
    expect(reads).toHaveLength(3);
    expect(new Set(reads.map((r) => r.modelRef.id)).size).toBe(1);
  });

  it("never waits long for a slow second brainstorm", async () => {
    vi.useFakeTimers();
    stub((req) => (req.label === "codenames-clue-bold" ? new Promise(() => {}) : answers(req)));
    const out = llmCodenamesAgent.giveClue({ ...BOARD, operatives: [null] });
    await vi.advanceTimersByTimeAsync(5_000);
    await expect(out).resolves.toMatchObject({ word: "den", count: 2 });
  });

  it("each part can be switched off for the bench", async () => {
    vi.stubEnv("CODENAMES_MASTER_SLOTS", "0");
    vi.stubEnv("CODENAMES_MASTER_SECOND_CALL", "0");
    const seen = stub((req) =>
      req.label === "codenames-clue"
        ? { candidates: [idea("den", ["fox", "worm"])], choice: 0 }
        : read("fox", "worm"),
    );
    const out = await llmCodenamesAgent.giveClue({ ...BOARD, operatives: [null] });
    expect(out).toMatchObject({ word: "den", count: 2 });
    expect(JSON.stringify(seen[0]?.jsonSchema)).toContain('"candidates"');
    expect(seen.some((r) => r.label === "codenames-clue-bold")).toBe(false);
  });
});

describe("the Mastermind plays its ideas out", () => {
  const kinds = ["own", "own", "own", "bystander", "opponent", "assassin"] as const;
  const kindOf = (card: number) => kinds[card];

  it("scores a turn by what it touches: own agents until the first miss, priced by what it hits", () => {
    expect(playOut([0, 1, 2], kindOf)).toBe(3);
    expect(playOut([0, 3, 1], kindOf)).toBe(1);
    expect(playOut([0, 4], kindOf)).toBe(0);
    expect(playOut([5], kindOf)).toBe(-9);
  });

  it("pictures a person as three guessers of different strength, an AI as itself twice", () => {
    stub(() => ({}));
    expect(simulatedGuessers({ ...BOARD, operatives: [null] }).map((g) => g.floor)).toEqual([
      0.7, 0.6, 0.5,
    ]);
    const ai = simulatedGuessers({ ...BOARD, operatives: ["codenames-medium"] });
    expect(ai).toHaveLength(2);
    expect(ai[0]?.floor).toBe(0.7);
  });

  it("gives the idea its guessers actually find most — never one that walked into the assassin", async () => {
    vi.stubEnv("CODENAMES_MASTER_TARGETED", "0");
    vi.stubEnv("CODENAMES_MASTER_RAISE", "0");
    const seen = stub((req) => {
      if (req.label === "codenames-clue")
        return {
          groups: [],
          ideas: {
            three: idea("blade", ["fox", "worm", "match"]),
            two: idea("den", ["fox", "worm"]),
            one: idea("fire", ["match"]),
          },
          choice: "three",
        };
      if (req.label.startsWith("codenames-clue-"))
        return { candidates: [idea("den", ["fox", "worm"])], choice: 0 };
      const clue = clueOf(req);
      // BLADE reads all three — and walks one guesser into KNIFE, the assassin.
      if (clue === "BLADE") return read("fox", "worm", "knife");
      if (clue === "DEN") return read("fox", "worm");
      return read("match");
    });
    const out = await llmCodenamesAgent.giveClue({
      ...BOARD,
      model: "codenames-expert",
      operatives: [null],
    });
    expect(out).toMatchObject({ word: "den", count: 2 });
    // Three wide brainstorms beside the main call, and each idea played out by three guessers.
    expect(
      seen
        .filter((r) => r.label.startsWith("codenames-clue-"))
        .map((r) => r.label)
        .sort(),
    ).toEqual([
      "codenames-clue-big",
      "codenames-clue-bold",
      "codenames-clue-category",
      "codenames-clue-fresh",
      "codenames-clue-phrase",
    ]);
    expect(seen.filter((r) => r.label === "codenames-guess").length).toBeGreaterThanOrEqual(9);
  });
});

describe("the ∞ agreement in the Mastermind", () => {
  // MATCH is still owed from FLAME 1; DEN for FOX and WORM covers everything left.
  const owed: ClueInput = {
    ...BOARD,
    model: "codenames-expert",
    history: [{ by: "us", clue: { word: "flame", count: 1 }, guesses: [], intended: ["match"] }],
  };
  const answers = (req: AiTransportRequest) => {
    if (req.label === "codenames-clue")
      return {
        groups: [],
        ideas: { three: empty("none"), two: idea("den", ["fox", "worm"]), one: empty("none") },
        choice: "two",
      };
    if (req.label.startsWith("codenames-clue-"))
      return { candidates: [idea("den", ["fox", "worm"])], choice: 0 };
    return read("fox", "worm", "match");
  };

  it("gives ∞ when the clue and the owed words cover every agent left — a person guessing too", async () => {
    vi.stubEnv("CODENAMES_MASTER_TARGETED", "0");
    const seen = stub(answers);
    const out = await llmCodenamesAgent.giveClue({ ...owed, operatives: [null] });
    expect(out).toMatchObject({ word: "den", count: "unlimited" });
    const users = seen.filter((r) => r.label === "codenames-guess").map((r) => String(r.user));
    expect(users.some((u) => /CLUE: DEN ∞/.test(u))).toBe(true);
    expect(users.some((u) => /CLUE: DEN 3/.test(u))).toBe(false);
  });

  it("with nothing owed it is never ∞, even for every agent left", async () => {
    vi.stubEnv("CODENAMES_MASTER_TARGETED", "0");
    stub(answers);
    const out = await llmCodenamesAgent.giveClue({
      ...owed,
      history: [],
      operatives: ["codenames-expert"],
    });
    expect(out.word).toBe("den");
    expect(typeof out.count).toBe("number");
  });
});
