import { describe, expect, it } from "vitest";
import { BggGameSchema, BggSnapshotSchema } from "./bgg.ts";

const sampleGame = {
  id: 13,
  type: "boardgame",
  name: "Catan",
  alternateNames: ["Catane", "Die Siedler von Catan"],
  description: "Settle Catan…",
  yearPublished: 1995,
  minPlayers: 3,
  maxPlayers: 4,
  bestPlayerCount: 4,
  recommendedPlayerCount: { min: 3, max: 4 },
  playingTime: 120,
  minPlayTime: 60,
  maxPlayTime: 120,
  minAge: 10,
  suggestedAge: 8,
  languageDependence: 2,
  categories: ["Economic", "Negotiation"],
  mechanics: ["Dice Rolling", "Trading"],
  families: ["Components: Hexagonal Tiles"],
  designers: ["Klaus Teuber"],
  artists: ["Volkan Baga"],
  publishers: ["KOSMOS"],
  expansions: [{ id: 926, name: "Catan: Seafarers" }],
  compilations: [],
  implementations: [],
  accessories: [],
  averageRating: 7.1,
  geekRating: 6.9,
  averageWeight: 2.32,
  numRatings: 115000,
  numComments: 23890,
  numWeights: 8559,
  stddev: 1.5,
  bggRank: 615,
  subdomainRanks: [
    { name: "strategygames", friendlyName: "Strategy Game Rank", rank: 580 },
    { name: "familygames", friendlyName: "Family Game Rank", rank: 209 },
  ],
  owned: 239832,
  trading: 2355,
  wanting: 522,
  wishing: 8190,
};

describe("BggGameSchema", () => {
  it("accepts a fully populated game", () => {
    expect(() => BggGameSchema.parse(sampleGame)).not.toThrow();
  });

  it("accepts the homebrew sentinel id 0", () => {
    expect(() => BggGameSchema.parse({ ...sampleGame, id: 0 })).not.toThrow();
  });

  it("accepts every nullable field as null", () => {
    expect(() =>
      BggGameSchema.parse({
        ...sampleGame,
        yearPublished: null,
        minPlayers: null,
        maxPlayers: null,
        bestPlayerCount: null,
        recommendedPlayerCount: null,
        playingTime: null,
        minPlayTime: null,
        maxPlayTime: null,
        minAge: null,
        suggestedAge: null,
        languageDependence: null,
        averageRating: null,
        geekRating: null,
        averageWeight: null,
        numRatings: null,
        numComments: null,
        numWeights: null,
        stddev: null,
        bggRank: null,
        owned: null,
        trading: null,
        wanting: null,
        wishing: null,
      }),
    ).not.toThrow();
  });

  it("rejects a missing name", () => {
    const { name: _name, ...rest } = sampleGame;
    expect(() => BggGameSchema.parse(rest)).toThrow();
  });

  it("rejects a non-array categories field", () => {
    expect(() => BggGameSchema.parse({ ...sampleGame, categories: "Economic" })).toThrow();
  });

  it("rejects a negative id", () => {
    expect(() => BggGameSchema.parse({ ...sampleGame, id: -1 })).toThrow();
  });

  it("rejects a languageDependence outside 1-5", () => {
    expect(() => BggGameSchema.parse({ ...sampleGame, languageDependence: 6 })).toThrow();
    expect(() => BggGameSchema.parse({ ...sampleGame, languageDependence: 0 })).toThrow();
  });

  it('accepts maxPlayers as the "infinity" literal', () => {
    expect(() => BggGameSchema.parse({ ...sampleGame, maxPlayers: "infinity" })).not.toThrow();
  });

  it("rejects an arbitrary string for maxPlayers", () => {
    expect(() => BggGameSchema.parse({ ...sampleGame, maxPlayers: "lots" })).toThrow();
  });

  it("rejects recommendedPlayerCount missing min/max", () => {
    expect(() =>
      BggGameSchema.parse({ ...sampleGame, recommendedPlayerCount: { min: 3 } }),
    ).toThrow();
  });
});

describe("BggSnapshotSchema", () => {
  it("accepts a slug-keyed map", () => {
    expect(() => BggSnapshotSchema.parse({ catan: sampleGame })).not.toThrow();
  });

  it("rejects a non-kebab-case slug", () => {
    expect(() => BggSnapshotSchema.parse({ "Bad Slug!": sampleGame })).toThrow();
  });
});
