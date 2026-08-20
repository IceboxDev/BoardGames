import { describe, expect, it } from "vitest";
import {
  GreetingAckBodySchema,
  GreetingResponseSchema,
  PlayerSkillResponseSchema,
  SKILL_TRAIT_IDS,
  SKILL_TRAITS,
  SkillLeaderboardsResponseSchema,
  SkillWeightsSchema,
  SpotlightEventSchema,
  SpotlightPayloadSchema,
} from "./skills.ts";

describe("SkillWeightsSchema", () => {
  const weights = { int: 35, pln: 50, per: 15, soph: 0, soc: 0, dex: 0 };

  it("parses a happy-path weight vector", () => {
    expect(SkillWeightsSchema.parse(weights)).toEqual(weights);
  });

  it("rejects weights that do not sum to 100", () => {
    const r = SkillWeightsSchema.safeParse({ ...weights, per: 20 });
    expect(r.success).toBe(false);
  });

  it("rejects a negative weight", () => {
    const r = SkillWeightsSchema.safeParse({ ...weights, int: -5, per: 55 });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.path).toEqual(["int"]);
  });

  it("rejects a non-integer weight", () => {
    const r = SkillWeightsSchema.safeParse({ ...weights, int: 34.5, per: 15.5 });
    expect(r.success).toBe(false);
  });

  it("rejects a missing trait", () => {
    const { dex: _dex, ...partial } = weights;
    const r = SkillWeightsSchema.safeParse(partial);
    expect(r.success).toBe(false);
  });
});

describe("PlayerSkillResponseSchema", () => {
  const standing = (trait: string) => ({
    trait,
    percentile: 62.5,
    score: 81,
    winChance: 59,
    rank: 3,
    of: 12,
    provisional: false,
  });
  const base = {
    userId: "u1",
    eligibility: { eligible: true, ratedMatches: 14, distinctGames: 5, minMatches: 8, minGames: 3 },
    traits: ["int", "pln", "per", "soph", "soc", "dex"].map(standing),
    games: [{ slug: "codenames", rank: 1, of: 6, matches: 7 }],
    ratedSlugs: ["codenames", "durak"],
    highlights: [{ kind: "game-first", slug: "codenames", matches: 7 }],
  };

  it("parses a happy-path payload", () => {
    const parsed = PlayerSkillResponseSchema.parse(base);
    expect(parsed.traits).toHaveLength(6);
    expect(parsed.highlights[0]?.kind).toBe("game-first");
  });

  it("accepts the ineligible shape (null traits, empty highlights)", () => {
    const r = PlayerSkillResponseSchema.parse({
      ...base,
      eligibility: { ...base.eligibility, eligible: false, ratedMatches: 3 },
      traits: null,
      games: [],
      highlights: [],
    });
    expect(r.traits).toBeNull();
  });

  it("rejects a five-axis traits array", () => {
    const r = PlayerSkillResponseSchema.safeParse({ ...base, traits: base.traits.slice(0, 5) });
    expect(r.success).toBe(false);
  });

  it("rejects an unknown highlight kind", () => {
    const r = PlayerSkillResponseSchema.safeParse({
      ...base,
      highlights: [{ kind: "coolest-hat", trait: "int" }],
    });
    expect(r.success).toBe(false);
  });
});

describe("SkillLeaderboardsResponseSchema", () => {
  it("parses boards with a side-car player map", () => {
    const parsed = SkillLeaderboardsResponseSchema.parse({
      eligibleCount: 12,
      computedAt: "2026-08-19 21:04:11",
      traits: [{ trait: "soc", entries: [{ userId: "u1", rank: 1, percentile: 95.8, score: 78 }] }],
      games: [{ slug: "durak", entries: [{ userId: "u1", rank: 1, matches: 4 }] }],
      players: { u1: { name: "Ada", image: null } },
    });
    expect(parsed.traits[0]?.entries[0]?.rank).toBe(1);
  });

  it("rejects an empty board", () => {
    const r = SkillLeaderboardsResponseSchema.safeParse({
      eligibleCount: 0,
      computedAt: null,
      traits: [{ trait: "soc", entries: [] }],
      games: [],
      players: {},
    });
    expect(r.success).toBe(false);
  });
});

describe("GreetingResponseSchema", () => {
  const proof = {
    rows: [
      { userId: "u1", rank: 1, value: "78" },
      { userId: "u2", rank: 2, value: "71" },
    ],
  };

  it("parses the intro arm", () => {
    const parsed = GreetingResponseSchema.parse({
      greeting: { kind: "skill-intro", highlight: { kind: "trait-first", trait: "per" } },
      players: {},
    });
    expect(parsed.greeting?.kind).toBe("skill-intro");
  });

  it("parses a spotlight with runners-up and a proof board", () => {
    const parsed = GreetingResponseSchema.parse({
      greeting: {
        kind: "spotlight",
        id: 7,
        subjectUserId: "u1",
        payload: {
          event: { kind: "trait-climb", trait: "pln", from: 4, to: 1, fieldSize: 12 },
          runnersUp: [{ userId: "u2", event: { kind: "streak-lead", length: 4 } }],
          proof,
        },
      },
      players: { u1: { name: "Ada", image: null } },
    });
    expect(parsed.greeting).toMatchObject({ kind: "spotlight", id: 7 });
  });

  it("accepts an empty queue", () => {
    expect(GreetingResponseSchema.parse({ greeting: null, players: {} }).greeting).toBeNull();
  });

  it("rejects a third runner-up", () => {
    const runnerUp = { userId: "u2", event: { kind: "streak-lead", length: 4 } };
    const r = SpotlightPayloadSchema.safeParse({
      event: { kind: "profile-unlocked", ratedMatches: 9, distinctGames: 3 },
      runnersUp: [runnerUp, runnerUp, runnerUp],
      proof: null,
    });
    expect(r.success).toBe(false);
  });

  it("rejects an unknown spotlight event kind", () => {
    const r = SpotlightEventSchema.safeParse({ kind: "vibes", trait: "int" });
    expect(r.success).toBe(false);
  });

  it("rejects a rank of zero", () => {
    const r = SpotlightEventSchema.safeParse({
      kind: "game-climb",
      slug: "durak",
      from: null,
      to: 0,
      fieldSize: 5,
    });
    expect(r.success).toBe(false);
  });
});

describe("GreetingAckBodySchema", () => {
  it("requires an id for a spotlight ack but not for the intro", () => {
    expect(GreetingAckBodySchema.parse({ kind: "skill-intro" }).kind).toBe("skill-intro");
    expect(GreetingAckBodySchema.safeParse({ kind: "spotlight" }).success).toBe(false);
    expect(GreetingAckBodySchema.safeParse({ kind: "spotlight", id: 3 }).success).toBe(true);
  });
});

describe("SKILL_TRAITS", () => {
  it("has six traits in canonical order with ids matching SKILL_TRAIT_IDS", () => {
    expect(SKILL_TRAITS).toHaveLength(6);
    expect(SKILL_TRAIT_IDS).toEqual(["int", "pln", "per", "soph", "soc", "dex"]);
  });

  it("keeps every label within the 24-char SkillAxis limit", () => {
    for (const trait of SKILL_TRAITS) {
      expect(trait.label.length).toBeLessThanOrEqual(24);
    }
  });
});
