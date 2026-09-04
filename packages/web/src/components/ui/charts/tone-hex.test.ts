import { afterEach, describe, expect, it } from "vitest";
import type { Tone } from "../tones";
import { chartHex, getThemeVersion, resolveChartColor } from "./tone-hex";

const root = document.documentElement;

/** The stock hexes — what every tone must resolve to when no theme is set. */
const STOCK: Record<Tone, string> = {
  accent: "#6366f1",
  amber: "#fbbf24",
  sky: "#38bdf8",
  emerald: "#10b981",
  rose: "#f43f5e",
  purple: "#a855f7",
  orange: "#f97316",
  cyan: "#22d3ee",
  neutral: "#6b7387",
};

function themechange(): void {
  window.dispatchEvent(new CustomEvent("themechange"));
}

afterEach(() => {
  // Strip every custom prop a test set on <html>, then flush the cache.
  for (const name of Array.from(root.style)) {
    if (name.startsWith("--")) root.style.removeProperty(name);
  }
  themechange();
});

describe("chartHex — fallback path (no CSS vars, as in jsdom)", () => {
  it("returns the stock hex for every tone", () => {
    for (const [tone, hex] of Object.entries(STOCK)) {
      expect(chartHex(tone as Tone)).toBe(hex);
    }
  });
});

describe("chartHex — live theme overrides", () => {
  it("picks up an inline --color-accent-500 override after themechange", () => {
    root.style.setProperty("--color-accent-500", "#ff0000");
    themechange();
    expect(chartHex("accent")).toBe("#ff0000");
  });

  it("caches until themechange: a var write alone does not recolor", () => {
    expect(chartHex("accent")).toBe(STOCK.accent); // prime the cache
    root.style.setProperty("--color-accent-500", "#00ff00");
    expect(chartHex("accent")).toBe(STOCK.accent); // still cached
    themechange();
    expect(chartHex("accent")).toBe("#00ff00");
  });

  it("palette tones follow their own var (amber → --color-amber-400)", () => {
    root.style.setProperty("--color-amber-400", "#123456");
    themechange();
    expect(chartHex("amber")).toBe("#123456");
    expect(chartHex("sky")).toBe(STOCK.sky); // untouched tones keep stock
  });

  it("neutral follows --color-fg-muted", () => {
    root.style.setProperty("--color-fg-muted", "#999999");
    themechange();
    expect(chartHex("neutral")).toBe("#999999");
  });

  it("reverts to the stock hex once the override is removed", () => {
    root.style.setProperty("--color-accent-500", "#ff2d95");
    themechange();
    expect(chartHex("accent")).toBe("#ff2d95");
    root.style.removeProperty("--color-accent-500");
    themechange();
    expect(chartHex("accent")).toBe(STOCK.accent);
  });
});

describe("resolveChartColor", () => {
  it("explicit color wins over tone", () => {
    expect(resolveChartColor("#abcdef", "rose")).toBe("#abcdef");
  });

  it("defaults to the accent tone when neither is given", () => {
    expect(resolveChartColor(undefined, undefined)).toBe(STOCK.accent);
  });

  it("resolves the tone when no explicit color is given", () => {
    expect(resolveChartColor(undefined, "emerald")).toBe(STOCK.emerald);
  });
});

describe("getThemeVersion", () => {
  it("bumps on every themechange", () => {
    const before = getThemeVersion();
    themechange();
    themechange();
    expect(getThemeVersion()).toBe(before + 2);
  });
});
