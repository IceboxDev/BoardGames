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

/** An `#rrggbb` at a given hue, for sweeping the wheel. */
function hslHex(h: number, sat: number, light: number): string {
  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = light - c / 2;
  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  const to2 = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${to2(r)}${to2(g)}${to2(b)}`;
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

  // ── The warm band ─────────────────────────────────────────────────────
  // An amber accent (hue 38) used to rotate the flame +56° into chartreuse
  // and paint the calendar vomit-green. Fire is physical: it may take the
  // theme's cast but never leaves red→orange→gold.
  const HEAT_TOKENS = Object.keys(SEMANTIC_TOKENS).filter((n) => n.startsWith("--color-heat"));

  function isWarm(hex: string): boolean {
    const h = hueOf(hex);
    // The heat band, 352°→54°, wrapping through 0.
    return h >= 351 || h <= 55;
  }

  const WARN_TOKENS = Object.keys(SEMANTIC_TOKENS).filter((n) => n.startsWith("--color-warn"));

  function isCaution(hex: string): boolean {
    const h = hueOf(hex);
    // The warn band, 8°→70°.
    return h >= 7 && h <= 71;
  }

  it("keeps every warn token in the caution band for every accent", () => {
    for (let hue = 0; hue < 360; hue += 5) {
      const accent = hslHex(hue, 0.8, 0.55);
      const derived = deriveSemanticTokens(accent);
      for (const name of WARN_TOKENS) {
        expect(isCaution(derived[name]), `${name} at accent hue ${hue} = ${derived[name]}`).toBe(
          true,
        );
      }
    }
  });

  it("never lets the caution mark collapse onto the accent", () => {
    for (let hue = 0; hue < 360; hue += 5) {
      const accent = hslHex(hue, 0.8, 0.55);
      const { "--color-warn": warn } = deriveSemanticTokens(accent);
      expect(hueGap(warn, accent), `warn vs accent hue ${hue}`).toBeGreaterThanOrEqual(25);
    }
  });

  it("keeps every heat token warm for every accent on the wheel", () => {
    for (let hue = 0; hue < 360; hue += 5) {
      const accent = hslHex(hue, 0.8, 0.55);
      const derived = deriveSemanticTokens(accent);
      for (const name of HEAT_TOKENS) {
        expect(isWarm(derived[name]), `${name} at accent hue ${hue} = ${derived[name]}`).toBe(true);
      }
    }
  });

  it("never lets the flame collapse onto the accent", () => {
    for (let hue = 0; hue < 360; hue += 5) {
      const accent = hslHex(hue, 0.8, 0.55);
      const { "--color-heat": heat } = deriveSemanticTokens(accent);
      expect(hueGap(heat, accent), `heat vs accent hue ${hue}`).toBeGreaterThanOrEqual(25);
    }
  });

  // The reported bug: `sealed` tracks the accent 1:1, so a WARM accent made
  // the locked-in night warm too — and the flame beside it was the same
  // yellow-green. The two states must stay tellable apart at every accent.
  it("keeps fire and sealed nights distinguishable at every accent", () => {
    for (let hue = 0; hue < 360; hue += 5) {
      const accent = hslHex(hue, 0.8, 0.55);
      const d = deriveSemanticTokens(accent);
      expect(
        hueGap(d["--color-heat"], d["--color-sealed-base"]),
        `heat vs sealed at accent hue ${hue}`,
      ).toBeGreaterThanOrEqual(25);
    }
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
