import type { BggGame } from "@boardgames/core/bgg";
import { describe, expect, it } from "vitest";
import { weightStats } from "../games/registry";
import {
  compactSummary,
  compareForHeadcount,
  coversWindow,
  fitsLabel,
  fitsRange,
  formatCount,
  normalizeWeight,
  playerRange,
  playTime,
  stripBggHtml,
  weightBarWidth,
  weightColor,
  weightLabel,
} from "./bgg-format";

function bgg(overrides: Partial<BggGame> = {}): BggGame {
  return {
    name: "Test",
    description: "",
    yearPublished: null,
    minPlayers: null,
    maxPlayers: null,
    bestPlayerCount: null,
    minPlayTime: null,
    maxPlayTime: null,
    playingTime: null,
    suggestedAge: null,
    averageWeight: null,
    averageRating: null,
    usersRated: null,
    categories: [],
    mechanics: [],
    designers: [],
    artists: [],
    publishers: [],
    families: [],
    expansions: [],
    integrations: [],
    image: null,
    thumbnail: null,
    ...overrides,
  } as BggGame;
}

describe("compactSummary", () => {
  it("joins year, players, and playtime with dot separator", () => {
    expect(
      compactSummary(bgg({ yearPublished: 2008, minPlayers: 1, maxPlayers: 4, playingTime: 60 })),
    ).toBe("2008 · 1–4 players · 60 min");
  });

  it("drops the players segment when min/max are missing (hideUnknown)", () => {
    expect(compactSummary(bgg({ yearPublished: 2020, playingTime: 30 }))).toBe("2020 · 30 min");
  });

  it("returns empty string when every segment is missing", () => {
    expect(compactSummary(bgg())).toBe("");
  });
});

describe("playerRange", () => {
  it("renders a single fixed count without dash", () => {
    expect(playerRange(bgg({ minPlayers: 4, maxPlayers: 4 }))).toBe("4 players");
    expect(playerRange(bgg({ minPlayers: 1, maxPlayers: 1 }))).toBe("1 player");
  });

  it("renders a min–max range", () => {
    expect(playerRange(bgg({ minPlayers: 2, maxPlayers: 5 }))).toBe("2–5 players");
  });

  it('renders "infinity" max as "∞"', () => {
    expect(playerRange(bgg({ minPlayers: 1, maxPlayers: "infinity" }))).toBe("1–∞ players");
  });

  it("falls back to verbose placeholder when both ends are null (hideUnknown=false)", () => {
    expect(playerRange(bgg())).toBe("— players");
  });

  it("hides one-sided unknown when hideUnknown is set", () => {
    expect(playerRange(bgg({ minPlayers: 2 }), { hideUnknown: true })).toBe("");
    expect(playerRange(bgg(), { hideUnknown: true })).toBe("");
  });
});

describe("playTime", () => {
  it("returns a range when min and max differ", () => {
    expect(playTime(bgg({ minPlayTime: 30, maxPlayTime: 60 }))).toBe("30–60 min");
  });

  it("collapses to a single value when min and max are equal", () => {
    expect(playTime(bgg({ minPlayTime: 45, maxPlayTime: 45 }))).toBe("45 min");
  });

  it("falls back through playingTime → minPlayTime → maxPlayTime", () => {
    expect(playTime(bgg({ playingTime: 50 }))).toBe("50 min");
    expect(playTime(bgg({ minPlayTime: 25 }))).toBe("25 min");
    expect(playTime(bgg({ maxPlayTime: 25 }))).toBe("25 min");
  });

  it("returns placeholder when no playtime data is available", () => {
    expect(playTime(bgg())).toBe("— min");
  });
});

describe("fitsRange / coversWindow", () => {
  const g = {
    bgg: bgg({ minPlayers: 2, maxPlayers: 5 }),
  } as Parameters<typeof fitsRange>[0];

  it("fitsRange is true when SOME headcount in the window works", () => {
    expect(fitsRange(g, 1, 3)).toBe(true); // game wants 2-5, window 1-3 → overlap at 2,3
    expect(fitsRange(g, 6, 8)).toBe(false); // no overlap
  });

  it("coversWindow requires EVERY headcount in the window to work", () => {
    expect(coversWindow(g, 2, 5)).toBe(true);
    expect(coversWindow(g, 3, 4)).toBe(true);
    expect(coversWindow(g, 1, 5)).toBe(false); // game can't seat 1
    expect(coversWindow(g, 2, 6)).toBe(false); // game can't seat 6
  });

  it('treats "infinity" max as effectively unbounded', () => {
    const open = {
      bgg: bgg({ minPlayers: 1, maxPlayers: "infinity" }),
    } as Parameters<typeof fitsRange>[0];
    expect(coversWindow(open, 1, 999)).toBe(true);
  });
});

describe("fitsLabel", () => {
  it("renders a single number when lo === hi", () => {
    expect(fitsLabel(4, 4)).toBe("4");
  });

  it("renders a range when lo !== hi", () => {
    expect(fitsLabel(3, 5)).toBe("3–5");
  });
});

describe("weightLabel", () => {
  it("buckets weights into the expected band labels", () => {
    expect(weightLabel(1.0)).toBe("Light");
    expect(weightLabel(1.99)).toBe("Light");
    expect(weightLabel(2.0)).toBe("Medium-light");
    expect(weightLabel(2.99)).toBe("Medium-light");
    expect(weightLabel(3.0)).toBe("Medium");
    expect(weightLabel(3.49)).toBe("Medium");
    expect(weightLabel(3.5)).toBe("Medium-heavy");
    expect(weightLabel(3.99)).toBe("Medium-heavy");
    expect(weightLabel(4.0)).toBe("Heavy");
    expect(weightLabel(5.0)).toBe("Heavy");
  });
});

describe("weightBarWidth", () => {
  it("keeps a visible nub for the catalog's lightest game", () => {
    expect(normalizeWeight(weightStats.min)).toBe(0);
    expect(weightBarWidth(weightStats.min)).toBe(8);
  });

  it("fills the bar at the catalog's heaviest game", () => {
    expect(weightBarWidth(weightStats.max)).toBe(100);
  });

  it("lands mid-weights strictly between the nub and full", () => {
    const mid = weightBarWidth((weightStats.min + weightStats.max) / 2);
    expect(mid).toBeGreaterThan(8);
    expect(mid).toBeLessThan(100);
  });
});

describe("weightColor", () => {
  const hueOf = (color: string) => Number(color.match(/hsl\((\d+),/)?.[1]);

  it("maps the catalog's lightest game to pure green and heaviest to pure red", () => {
    expect(hueOf(weightColor(weightStats.min))).toBe(120);
    expect(hueOf(weightColor(weightStats.max))).toBe(0);
  });

  it("descends monotonically from green toward red as weight rises", () => {
    const mid = (weightStats.min + weightStats.max) / 2;
    const hues = [weightStats.min, mid, weightStats.max].map((w) => hueOf(weightColor(w)));
    expect(hues[0]).toBeGreaterThan(hues[1] ?? 0);
    expect(hues[1]).toBeGreaterThan(hues[2] ?? 0);
  });

  it("clamps weights outside the catalog interval", () => {
    expect(hueOf(weightColor(0))).toBe(120);
    expect(hueOf(weightColor(5))).toBe(0);
  });
});

describe("formatCount", () => {
  it("renders sub-1000 counts as plain integers", () => {
    expect(formatCount(0)).toBe("0");
    expect(formatCount(850)).toBe("850");
    expect(formatCount(999)).toBe("999");
  });

  it('renders 1k-9.9k with one decimal and "k" suffix', () => {
    expect(formatCount(1000)).toBe("1.0k");
    expect(formatCount(1234)).toBe("1.2k");
    expect(formatCount(9999)).toBe("10.0k");
  });

  it("drops the decimal at 10k and above", () => {
    expect(formatCount(10000)).toBe("10k");
    expect(formatCount(54321)).toBe("54k");
  });
});

describe("stripBggHtml", () => {
  it("removes simple tags", () => {
    expect(stripBggHtml("<p>Hello <b>world</b></p>")).toBe("Hello world");
  });

  it("expands the entity set BGG actually emits", () => {
    expect(stripBggHtml("Line one&#10;Line two")).toBe("Line one Line two");
    expect(stripBggHtml("Em&mdash;dash, en&ndash;dash")).toBe("Em—dash, en–dash");
    expect(stripBggHtml("&quot;Quoted&quot;")).toBe('"Quoted"');
    expect(stripBggHtml("AT&amp;T")).toBe("AT&T");
    expect(stripBggHtml("That&#39;s nice")).toBe("That's nice");
    expect(stripBggHtml("Don&rsquo;t &lsquo;quote&rsquo;")).toBe("Don't 'quote'");
  });

  it("collapses runs of whitespace and trims edges", () => {
    expect(stripBggHtml("  hello   <br/>   world  ")).toBe("hello world");
  });
});

describe("compareForHeadcount", () => {
  // Minimal GameDefinition-shaped stubs — the comparator only reads
  // `isNew`, `bgg.bestPlayerCount`, `bgg.averageRating` and `title`.
  const game = (title: string, over: { isNew?: boolean; best?: number; rating?: number } = {}) =>
    ({
      slug: title.toLowerCase(),
      title,
      ...(over.isNew ? { isNew: true } : {}),
      bgg: bgg({ bestPlayerCount: over.best ?? null, averageRating: over.rating ?? 7 }),
    }) as unknown as Parameters<typeof compareForHeadcount>[0];

  it("ranks a New game above one that is a better fit for the headcount", () => {
    const fresh = game("Fresh", { isNew: true });
    const bestAtTwo = game("BestAtTwo", { best: 2, rating: 9 });
    expect(compareForHeadcount(fresh, bestAtTwo, 2)).toBeLessThan(0);
    expect(compareForHeadcount(bestAtTwo, fresh, 2)).toBeGreaterThan(0);
  });

  it("falls through to best-at-N when neither game is New", () => {
    const bestAtTwo = game("BestAtTwo", { best: 2 });
    const other = game("Other", { best: 5, rating: 9 });
    expect(compareForHeadcount(bestAtTwo, other, 2)).toBeLessThan(0);
  });

  it("falls through to rating when both are New", () => {
    const strong = game("Strong", { isNew: true, rating: 8 });
    const weak = game("Weak", { isNew: true, rating: 6 });
    expect(compareForHeadcount(strong, weak, 3)).toBeLessThan(0);
  });

  it("breaks exact ties alphabetically", () => {
    expect(compareForHeadcount(game("Alpha"), game("Beta"), 3)).toBeLessThan(0);
  });
});
