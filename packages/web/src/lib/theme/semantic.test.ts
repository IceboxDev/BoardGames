import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { hexToRgb, rgbToHsl } from "./ramp";
import {
  deriveSemanticTokens,
  inkForAccent,
  relativeLuminance,
  SEMANTIC_TOKENS,
  SEMANTIC_VAR_NAMES,
} from "./semantic";

const REFERENCE_ACCENT = "#6366f1";
const REFERENCE_NEON_PURPLE = "#a855f7";

function hueOf(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHsl(r, g, b).h;
}

/** Shortest distance between two hues, 0..180. */
function hueGap(a: string, b: string): number {
  const d = Math.abs(hueOf(a) - hueOf(b)) % 360;
  return d > 180 ? 360 - d : d;
}

// vitest runs with cwd = packages/web (same assumption as
// pages/theme-preview-fixtures.test.ts).
function readIndexCss(): string {
  return readFileSync(join(process.cwd(), "src", "index.css"), "utf8");
}

describe("semantic token derivation", () => {
  // THE load-bearing property. Every token shifts by the accent's DISTANCE
  // from the reference indigo, so the reference accent must be a fixed point
  // — otherwise shipping this module would have recolored Classic.
  it("returns the stock values untouched for the reference accent", () => {
    const derived = deriveSemanticTokens(REFERENCE_ACCENT);
    for (const [name, spec] of Object.entries(SEMANTIC_TOKENS)) {
      expect(derived[name], name).toBe(spec.stock);
    }
  });

  // The stock values only ARE the shipped look while index.css agrees with
  // them; a token edited in one file and not the other would make Classic
  // jump the moment any other theme was applied and then cleared.
  it("pins every stock value to the declaration in index.css", () => {
    const css = readIndexCss();
    let checked = 0;
    for (const [name, spec] of Object.entries(SEMANTIC_TOKENS)) {
      const declared = css.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1]?.trim();
      expect(declared, `${name} should be declared in index.css`).toBe(spec.stock);
      checked += 1;
    }
    // Guard the guard: a broken regex must not silently check nothing.
    expect(checked).toBe(SEMANTIC_VAR_NAMES.length);
    expect(checked).toBeGreaterThan(10);
  });

  it("moves every token once the accent moves", () => {
    const derived = deriveSemanticTokens("#e91e7a"); // sakura pink
    for (const [name, spec] of Object.entries(SEMANTIC_TOKENS)) {
      expect(derived[name], name).not.toBe(spec.stock);
    }
  });

  it("emits a valid hex for every token across wildly different accents", () => {
    for (const accent of ["#00ff88", "#e91e7a", "#f59e0b", "#5b8fd6", "#000000", "#ffffff"]) {
      const derived = deriveSemanticTokens(accent);
      for (const name of SEMANTIC_VAR_NAMES) {
        expect(derived[name], `${accent} ${name}`).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });

  // The admin coverage pie paints "can" (accent-400) and "maybe"
  // (--color-warn) as touching slices of one 14px disc. On an amber accent
  // those used to be the same yellow and the pie read as a solid blob.
  it("keeps the warn family clear of the accent hue on a warm accent", () => {
    for (const accent of ["#f59e0b", "#fbbf24", "#eab308", "#facc15"]) {
      const { "--color-warn": warn } = deriveSemanticTokens(accent);
      expect(hueGap(warn, accent), `warn vs ${accent}`).toBeGreaterThanOrEqual(29);
    }
  });

  it("keeps the ok family clear of the accent hue on a green accent", () => {
    for (const accent of ["#00ff88", "#10b981", "#34d399"]) {
      const { "--color-ok": ok } = deriveSemanticTokens(accent);
      expect(hueGap(ok, accent), `ok vs ${accent}`).toBeGreaterThanOrEqual(29);
    }
  });

  // A group rotates as one unit, so the nudge above can't split a family
  // across the wheel — "maybe" and its gold partner must stay neighbours.
  it("rotates a nudged group as a unit", () => {
    const stockGap = hueGap(
      SEMANTIC_TOKENS["--color-warn"].stock,
      SEMANTIC_TOKENS["--color-warn-gold"].stock,
    );
    const d = deriveSemanticTokens("#fbbf24");
    // Tolerance is 8-bit rounding, not slack: hue read back off a quantized
    // hex drifts a few tenths of a degree. A group that failed to rotate
    // together would be tens of degrees out.
    expect(hueGap(d["--color-warn"], d["--color-warn-gold"])).toBeCloseTo(stockGap, 0);
  });

  // Sealed nights ARE the accent family in Classic (indigo/violet), so they
  // track it 1:1 — a Sakura calendar must not keep an indigo locked cell.
  it("tracks the accent 1:1 for the sealed-night family", () => {
    const accent = "#e91e7a";
    const rotation = hueOf(accent) - hueOf(REFERENCE_ACCENT);
    const derived = deriveSemanticTokens(accent);
    const moved =
      hueOf(derived["--color-sealed-mid"]) - hueOf(SEMANTIC_TOKENS["--color-sealed-mid"].stock);
    expect(moved).toBeCloseTo(rotation, 0);
  });
});

describe("ink on an accent fill", () => {
  it("keeps white on the stock indigo", () => {
    expect(inkForAccent(REFERENCE_ACCENT, REFERENCE_NEON_PURPLE)).toBe("#ffffff");
  });

  // The reported case: Terminal's neon mint made white button text vanish.
  it("flips to dark ink on a bright accent", () => {
    expect(inkForAccent("#00ff88", "#00ff88")).toBe("#0b0d12");
    expect(inkForAccent("#facc15", "#fde047")).toBe("#0b0d12");
  });

  it("orders luminance the way the eye does", () => {
    expect(relativeLuminance("#ffffff")).toBeCloseTo(1, 5);
    expect(relativeLuminance("#000000")).toBeCloseTo(0, 5);
    expect(relativeLuminance("#00ff88")).toBeGreaterThan(relativeLuminance("#6366f1"));
  });
});
