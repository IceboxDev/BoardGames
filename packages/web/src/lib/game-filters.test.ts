import { describe, expect, it } from "vitest";
import type { GameDefinition } from "../games/types";
import {
  EMPTY_FILTERS,
  filterGames,
  type GameFilters,
  hasActiveFilters,
  timeBucket,
  weightBucket,
} from "./game-filters";

type BggOpts = {
  minPlayers?: number | null;
  maxPlayers?: number | "infinity" | null;
  averageWeight?: number | null;
  playingTime?: number | null;
  maxPlayTime?: number | null;
  minPlayTime?: number | null;
  designers?: string[];
  categories?: string[];
  mechanics?: string[];
};

// Minimal stand-in: filterGames only reads `title`, `kind`, + the bgg fields.
function game(
  title: string,
  bgg: BggOpts = {},
  kind: "catalog" | "playable" = "catalog",
): GameDefinition {
  return {
    slug: title.toLowerCase().replace(/\s+/g, "-"),
    title,
    kind,
    bgg: {
      minPlayers: bgg.minPlayers ?? null,
      maxPlayers: bgg.maxPlayers ?? null,
      averageWeight: bgg.averageWeight ?? null,
      playingTime: bgg.playingTime ?? null,
      maxPlayTime: bgg.maxPlayTime ?? null,
      minPlayTime: bgg.minPlayTime ?? null,
      designers: bgg.designers ?? [],
      categories: bgg.categories ?? [],
      mechanics: bgg.mechanics ?? [],
    },
  } as unknown as GameDefinition;
}

const titlesOf = (gs: GameDefinition[]) => gs.map((g) => g.title);

describe("hasActiveFilters", () => {
  it("is false for the empty filter set", () => {
    expect(hasActiveFilters(EMPTY_FILTERS)).toBe(false);
  });

  it("treats a whitespace-only query as inactive", () => {
    expect(hasActiveFilters({ ...EMPTY_FILTERS, query: "   " })).toBe(false);
  });

  it("is true once any axis is set", () => {
    expect(hasActiveFilters({ ...EMPTY_FILTERS, players: 4 })).toBe(true);
    expect(hasActiveFilters({ ...EMPTY_FILTERS, weight: "light" })).toBe(true);
    expect(hasActiveFilters({ ...EMPTY_FILTERS, time: "short" })).toBe(true);
    expect(hasActiveFilters({ ...EMPTY_FILTERS, query: "uno" })).toBe(true);
    expect(hasActiveFilters({ ...EMPTY_FILTERS, playableOnly: true })).toBe(true);
  });
});

describe("weightBucket", () => {
  it("buckets by conventional thresholds", () => {
    expect(weightBucket(1.4)).toBe("light");
    expect(weightBucket(2.4)).toBe("light");
    expect(weightBucket(2.5)).toBe("medium");
    expect(weightBucket(3.4)).toBe("medium");
    expect(weightBucket(3.5)).toBe("heavy");
    expect(weightBucket(4.7)).toBe("heavy");
  });

  it("returns null for unrated games", () => {
    expect(weightBucket(null)).toBeNull();
  });
});

describe("timeBucket", () => {
  it("buckets minutes into bands", () => {
    expect(timeBucket(20)).toBe("short");
    expect(timeBucket(30)).toBe("mid");
    expect(timeBucket(60)).toBe("mid");
    expect(timeBucket(90)).toBe("long");
    expect(timeBucket(120)).toBe("long");
    expect(timeBucket(180)).toBe("epic");
  });

  it("returns null for missing or zero playtime", () => {
    expect(timeBucket(null)).toBeNull();
    expect(timeBucket(0)).toBeNull();
  });
});

describe("filterGames", () => {
  const catalog = [
    game("Azul", {
      minPlayers: 2,
      maxPlayers: 4,
      averageWeight: 1.8,
      playingTime: 40,
      categories: ["Abstract Strategy"],
      designers: ["Michael Kiesling"],
    }),
    game("Gloomhaven", {
      minPlayers: 1,
      maxPlayers: 4,
      averageWeight: 3.9,
      playingTime: 120,
      mechanics: ["Deck Building"],
    }),
    game("Codenames", {
      minPlayers: 2,
      maxPlayers: "infinity",
      averageWeight: 1.3,
      playingTime: 15,
    }),
    game("Mysterium", { minPlayers: 2, maxPlayers: 7, averageWeight: 1.9, playingTime: 45 }),
  ];

  it("returns everything for the empty filter set", () => {
    expect(filterGames(catalog, EMPTY_FILTERS)).toHaveLength(4);
  });

  it("matches the query against title, designers, and mechanics", () => {
    expect(titlesOf(filterGames(catalog, { ...EMPTY_FILTERS, query: "azul" }))).toEqual(["Azul"]);
    expect(titlesOf(filterGames(catalog, { ...EMPTY_FILTERS, query: "kiesling" }))).toEqual([
      "Azul",
    ]);
    expect(titlesOf(filterGames(catalog, { ...EMPTY_FILTERS, query: "deck building" }))).toEqual([
      "Gloomhaven",
    ]);
  });

  it("filters by exact supported player count", () => {
    // 5 players: only the infinity-capped and the 7-max games qualify.
    expect(titlesOf(filterGames(catalog, { ...EMPTY_FILTERS, players: 5 }))).toEqual([
      "Codenames",
      "Mysterium",
    ]);
    // 1 player: only Gloomhaven supports solo.
    expect(titlesOf(filterGames(catalog, { ...EMPTY_FILTERS, players: 1 }))).toEqual([
      "Gloomhaven",
    ]);
  });

  it("treats the 6+ chip as 'max reaches at least 6'", () => {
    // PLAYERS_MAX_PLUS === 6: infinity-capped + 7-max qualify; 4-max games don't.
    expect(titlesOf(filterGames(catalog, { ...EMPTY_FILTERS, players: 6 }))).toEqual([
      "Codenames",
      "Mysterium",
    ]);
  });

  it("filters by complexity bucket", () => {
    expect(titlesOf(filterGames(catalog, { ...EMPTY_FILTERS, weight: "light" }))).toEqual([
      "Azul",
      "Codenames",
      "Mysterium",
    ]);
    expect(titlesOf(filterGames(catalog, { ...EMPTY_FILTERS, weight: "heavy" }))).toEqual([
      "Gloomhaven",
    ]);
  });

  it("filters by playtime bucket", () => {
    expect(titlesOf(filterGames(catalog, { ...EMPTY_FILTERS, time: "short" }))).toEqual([
      "Codenames",
    ]);
    expect(titlesOf(filterGames(catalog, { ...EMPTY_FILTERS, time: "long" }))).toEqual([
      "Gloomhaven",
    ]);
  });

  it("AND-combines multiple axes", () => {
    const filters: GameFilters = { ...EMPTY_FILTERS, players: 4, weight: "light", time: "mid" };
    expect(titlesOf(filterGames(catalog, filters))).toEqual(["Azul", "Mysterium"]);
  });

  it("excludes unrated games from a weight-filtered view", () => {
    const withUnrated = [...catalog, game("Homebrew", { minPlayers: 2, maxPlayers: 4 })];
    const result = filterGames(withUnrated, { ...EMPTY_FILTERS, weight: "light" });
    expect(titlesOf(result)).not.toContain("Homebrew");
  });

  it("playableOnly drops catalog-only (coming-soon) entries", () => {
    const mixed = [
      game("Built", { minPlayers: 2, maxPlayers: 4 }, "playable"),
      game("Coming Soon", { minPlayers: 2, maxPlayers: 4 }, "catalog"),
    ];
    expect(titlesOf(filterGames(mixed, { ...EMPTY_FILTERS, playableOnly: true }))).toEqual([
      "Built",
    ]);
    expect(filterGames(mixed, EMPTY_FILTERS)).toHaveLength(2);
  });
});
