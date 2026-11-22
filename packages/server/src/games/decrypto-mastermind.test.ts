import type { EncryptInput } from "@boardgames/core/games/decrypto/ai/agent";
import { describe, expect, it } from "vitest";
import {
  type Candidate,
  codeChance,
  legalCandidate,
  likeliestCode,
  meanRow,
  nameability,
  normalizeRow,
  poolCandidates,
  rankTriples,
  readersFor,
  tokenCosts,
  tripleValue,
} from "./decrypto-mastermind";

const INPUT: EncryptInput = {
  model: "decrypto-expert",
  keywords: ["OCEAN", "TRAIN", "CANDLE", "TIGER"],
  code: [3, 1, 4],
  round: 2,
  ownRevealedClues: [],
  oppRevealedClues: [],
  forbiddenClues: ["salt"],
  ownDecodeMistakes: [],
  tokens: {
    own: { interceptions: 0, miscommunications: 0 },
    opp: { interceptions: 0, miscommunications: 0 },
  },
  variant: "standard",
  decoder: "decrypto-hard",
  interceptor: null,
};

const sure = (digit: number) => normalizeRow([1, 2, 3, 4].map((d) => (d === digit ? 97 : 1)));
const flat = normalizeRow([25, 25, 25, 25]);

describe("probability tables", () => {
  it("normalizes and floors a row", () => {
    const row = normalizeRow([100, 0, 0, 0]);
    expect(row.reduce((a, b) => a + b, 0)).toBeCloseTo(1);
    expect(Math.min(...row)).toBeGreaterThan(0);
    expect(normalizeRow([0, 0, 0, 0])).toEqual(flat);
    expect(meanRow([sure(1), sure(2)])[0]).toBeCloseTo(meanRow([sure(1), sure(2)])[1]);
  });

  it("gives the code chances over the 24 legal codes", () => {
    expect(codeChance([flat, flat, flat], [1, 2, 3])).toBeCloseTo(1 / 24);
    expect(codeChance([sure(3), sure(1), sure(4)], [3, 1, 4])).toBeGreaterThan(0.85);
    expect(likeliestCode([sure(3), sure(1), sure(4)])).toEqual([3, 1, 4]);
    // Elimination: two sure rows decide the third among the remaining digits.
    expect(likeliestCode([sure(2), sure(4), normalizeRow([30, 25, 25, 20])])).toEqual([2, 4, 1]);
  });
});

describe("token costs", () => {
  it("prices a game-losing token higher and ignores interception in round 1", () => {
    expect(tokenCosts(INPUT)).toMatchObject({ miscommunication: 1, interception: 1 });
    expect(tokenCosts({ ...INPUT, round: 1 }).interception).toBe(0);
    const late = {
      ...INPUT,
      tokens: {
        own: { interceptions: 0, miscommunications: 1 },
        opp: { interceptions: 1, miscommunications: 0 },
      },
    };
    expect(tokenCosts(late)).toMatchObject({ miscommunication: 4, interception: 4 });
    // Variant: a miscommunication also feeds the interceptor's pool.
    expect(tokenCosts({ ...INPUT, variant: "interceptor" }).miscommunication).toBe(2);
  });

  it("values a sure decode that leaks less than a sure decode that doesn't", () => {
    const costs = { miscommunication: 1, interception: 1, exposure: 1.2 };
    expect(tripleValue(1, 0, costs)).toBeGreaterThan(tripleValue(1, 0.5, costs));
    expect(tripleValue(0.9, 0, costs)).toBeGreaterThan(tripleValue(0.6, 0, costs));
  });
});

describe("choosing the triple", () => {
  it("prefers clues the decoder reads and the interceptor doesn't", () => {
    const c = (clue: string, decode: Candidate["decode"], intercept: Candidate["intercept"]) => ({
      clue,
      decode,
      intercept,
      exposure: 0,
    });
    const pools: [Candidate[], Candidate[], Candidate[]] = [
      [c("wax", sure(3), sure(3)), c("vigil", sure(3), flat)],
      [c("ocean", sure(1), flat), c("vague", flat, flat)],
      [c("stripes", sure(4), flat)],
    ];
    const ranked = rankTriples(pools, [3, 1, 4], {
      miscommunication: 1,
      interception: 1,
      exposure: 0.6,
    });
    expect(ranked[0]?.clues).toEqual(["vigil", "ocean", "stripes"]);
    expect(ranked).toHaveLength(4);
  });

  it("charges a clue that gives its keyword away", () => {
    const costs = { miscommunication: 1, interception: 1, exposure: 1.2 };
    expect(tripleValue(1, 0, costs, 0)).toBeGreaterThan(tripleValue(1, 0, costs, 1));
    expect(nameability(["cage", "prison", "bird"], "cage")).toBe(1);
    expect(nameability(["prison", "Cages", "bird"], "cage")).toBe(0.6);
    expect(nameability(["prison", "zoo", "bird"], "cage")).toBe(0);
  });

  it("keeps only legal, distinct candidates per position", () => {
    expect(legalCandidate("Tigers", INPUT)).toBe(false);
    expect(legalCandidate("salt", INPUT)).toBe(false);
    expect(legalCandidate("  ", INPUT)).toBe(false);
    expect(legalCandidate("x".repeat(41), INPUT)).toBe(false);
    expect(legalCandidate("stripes", INPUT)).toBe(true);
    const pools = poolCandidates(INPUT, [
      [["wax", "Wax"], ["rails"], ["stripes", "tiger"]],
      [["wick"], ["Rails", "salt"], ["jungle"]],
    ]);
    expect(pools).toEqual([["wax", "wick"], ["rails"], ["stripes", "jungle"]]);
  });

  it("stands in three people for a human decoder and none for a round-1 interceptor", () => {
    const tierModel = (tier: string) => `model:${tier}`;
    expect(readersFor(INPUT, tierModel).decode).toEqual(["model:decrypto-hard"]);
    expect(readersFor(INPUT, tierModel).intercept).toHaveLength(2);
    expect(readersFor({ ...INPUT, decoder: null }, tierModel).decode).toHaveLength(3);
    expect(readersFor({ ...INPUT, round: 1 }, tierModel).intercept).toEqual([]);
  });
});
