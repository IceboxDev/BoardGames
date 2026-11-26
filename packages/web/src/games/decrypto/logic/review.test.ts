import type { GuessNote } from "@boardgames/core/games/decrypto/notes";
import type { DecryptoPlayerView } from "@boardgames/core/games/decrypto/types";
import { describe, expect, it } from "vitest";
import { reviewRounds, tierLines } from "./review";

const interceptNote: GuessNote = {
  purpose: "intercept",
  picks: [
    { digit: 1, why: "sea", chances: [0.7, 0.1, 0.1, 0.1] },
    { digit: 2, why: "rails", chances: null },
    { digit: 4, why: "stripes", chances: null },
  ],
  columns: ["water things", null, "light", "cats"],
  candidates: [],
  verdict: null,
  standIn: false,
  cost: null,
  traceIds: [],
};

const view = {
  variant: "standard",
  team: 0,
  seat: 0,
  seats: [
    { seat: 0, team: 0, isAi: false, model: null, isEncryptor: false },
    { seat: 1, team: 0, isAi: true, model: "decrypto-hard", isEncryptor: false },
    { seat: 2, team: 1, isAi: true, model: "decrypto-expert", isEncryptor: false },
    { seat: 3, team: 1, isAi: true, model: "decrypto-expert", isEncryptor: false },
  ],
  result: {
    winner: 1,
    reason: "interceptions",
    points: [0, 2],
    rounds: 2,
    keywords: [
      ["OCEAN", "TRAIN", "CANDLE", "TIGER"],
      ["MOON", "BREAD", "KING", "RIVER"],
    ],
  },
  roundSummaries: [
    {
      round: 2,
      transmissions: [
        {
          team: 1,
          encryptor: 2,
          clues: ["tide", "crust", "crown"],
          skipped: false,
          skipReason: null,
          code: [1, 2, 3],
          decodeGuess: [1, 2, 3],
          interceptGuess: null,
          intercepted: false,
          miscommunicated: false,
          encryptNote: null,
          decodeNote: null,
          interceptNote: null,
        },
        {
          team: 0,
          encryptor: 1,
          clues: ["salt", "rails", "stripes"],
          skipped: false,
          skipReason: null,
          code: [1, 2, 4],
          decodeGuess: [1, 2, 4],
          interceptGuess: [1, 2, 4],
          intercepted: true,
          miscommunicated: false,
          encryptNote: {
            clues: [
              { link: "ocean → sea salt", cover: null },
              { link: null, cover: null },
              { link: null, cover: null },
            ],
            tableRead: null,
            search: null,
            standIn: false,
            cost: null,
            traceIds: [],
          },
          decodeNote: null,
          interceptNote,
        },
      ],
    },
  ],
} as unknown as DecryptoPlayerView;

describe("the debrief's review model", () => {
  it("orders White first and names who played each role", () => {
    const [round] = reviewRounds(view);
    const [white, black] = round?.transmissions ?? [];
    expect(white?.team).toBe(0);
    expect(black?.team).toBe(1);
    expect(white?.encryptor).toEqual({ name: "Analyst", tier: "decrypto-hard" });
    // The person on White decoded, so that read has no tier.
    expect(white?.decode.actor.tier).toBeNull();
    expect(white?.intercept?.actor.name).toBe("Mastermind");
    expect(black?.intercept).toBeNull();
  });

  it("pairs every clue with its keyword, link and both reads", () => {
    const white = reviewRounds(view)[0]?.transmissions[0];
    expect(white?.rows[0]).toMatchObject({
      clue: "salt",
      digit: 1,
      keyword: "OCEAN",
      link: "ocean → sea salt",
      interceptedAs: 1,
    });
    expect(white?.rows[2]?.keyword).toBe("TIGER");
    expect(white?.intercept?.exact).toBe(true);
    expect(white?.intercept?.columns).toEqual([
      { digit: 1, guess: "water things", keyword: "OCEAN" },
      { digit: 3, guess: "light", keyword: "CANDLE" },
      { digit: 4, guess: "cats", keyword: "TIGER" },
    ]);
  });

  it("totals each AI tier's game", () => {
    const lines = tierLines(reviewRounds(view), view);
    const master = lines.find((l) => l.tier === "decrypto-expert");
    const analyst = lines.find((l) => l.tier === "decrypto-hard");
    expect(master).toMatchObject({ sent: 1, decoded: 1, leaked: 0, tried: 1, broke: 1 });
    expect(analyst).toMatchObject({ sent: 1, decoded: 1, leaked: 1, tried: 0 });
  });
});
