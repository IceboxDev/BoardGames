// ── Accent ramp derivation ───────────────────────────────────────────────
//
// The app's accent utilities span five shades (accent-100..500) but the theme
// stores ONE hex. This module rebuilds the ladder from that anchor using the
// RELATIONSHIPS of today's indigo ramp: for each lighter step we measure, on
// the reference ramp, how the hue drifts (additive), how saturation scales
// (ratio) and how much of the remaining distance to white the lightness
// covers (factor), then replay those transforms on any accent. Because the
// transforms are derived from the reference values themselves, feeding the
// reference anchor (#6366f1) back in reproduces the other four reference
// hexes exactly — unit-tested in ramp.test.ts.

export type AccentStep = "100" | "200" | "300" | "400" | "500";
export type AccentRamp = Record<AccentStep, string>;

/** Today's indigo ramp — must match the `@theme` fallbacks in index.css. */
const REFERENCE_RAMP: AccentRamp = {
  "500": "#6366f1",
  "400": "#818cf8",
  "300": "#a5b4fc",
  "200": "#c7d2fe",
  "100": "#e0e7ff",
};

export interface Hsl {
  h: number; // 0..360
  s: number; // 0..1
  l: number; // 0..1
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return { r: 0, g: 0, b: 0 };
  const n = Number.parseInt(m[1], 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

export function rgbToHex(r: number, g: number, b: number): string {
  const to2 = (v: number) => v.toString(16).padStart(2, "0");
  return `#${to2(r)}${to2(g)}${to2(b)}`;
}

export function rgbToHsl(r: number, g: number, b: number): Hsl {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  const l = (max + min) / 2;
  if (delta === 0) return { h: 0, s: 0, l };
  const s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let h: number;
  if (max === rn) h = ((gn - bn) / delta) % 6;
  else if (max === gn) h = (bn - rn) / delta + 2;
  else h = (rn - gn) / delta + 4;
  h *= 60;
  if (h < 0) h += 360;
  return { h, s, l };
}

export function hslToRgb({ h, s, l }: Hsl): { r: number; g: number; b: number } {
  const hue = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - c / 2;
  let rn = 0;
  let gn = 0;
  let bn = 0;
  if (hue < 60) [rn, gn, bn] = [c, x, 0];
  else if (hue < 120) [rn, gn, bn] = [x, c, 0];
  else if (hue < 180) [rn, gn, bn] = [0, c, x];
  else if (hue < 240) [rn, gn, bn] = [0, x, c];
  else if (hue < 300) [rn, gn, bn] = [x, 0, c];
  else [rn, gn, bn] = [c, 0, x];
  return {
    r: Math.round((rn + m) * 255),
    g: Math.round((gn + m) * 255),
    b: Math.round((bn + m) * 255),
  };
}

export function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/** Per-step transform relative to the 500 anchor, measured on the reference ramp. */
interface StepTransform {
  hueDelta: number;
  satRatio: number;
  /** Fraction of the anchor's remaining distance to white this step keeps. */
  whiteGapFactor: number;
}

const ANCHOR_HSL = (() => {
  const { r, g, b } = hexToRgb(REFERENCE_RAMP["500"]);
  return rgbToHsl(r, g, b);
})();

const STEP_TRANSFORMS: Record<AccentStep, StepTransform> = (() => {
  const out = {} as Record<AccentStep, StepTransform>;
  for (const step of ["100", "200", "300", "400", "500"] as const) {
    const { r, g, b } = hexToRgb(REFERENCE_RAMP[step]);
    const hsl = rgbToHsl(r, g, b);
    out[step] = {
      hueDelta: hsl.h - ANCHOR_HSL.h,
      satRatio: ANCHOR_HSL.s === 0 ? 1 : hsl.s / ANCHOR_HSL.s,
      whiteGapFactor: ANCHOR_HSL.l >= 1 ? 0 : (1 - hsl.l) / (1 - ANCHOR_HSL.l),
    };
  }
  return out;
})();

/** Derive the five accent shades from a single `#rrggbb` anchor. */
export function deriveAccentRamp(accentHex: string): AccentRamp {
  const { r, g, b } = hexToRgb(accentHex);
  const base = rgbToHsl(r, g, b);
  const ramp = {} as AccentRamp;
  for (const step of ["100", "200", "300", "400", "500"] as const) {
    const t = STEP_TRANSFORMS[step];
    const shade = hslToRgb({
      h: base.h + t.hueDelta,
      s: clamp01(base.s * t.satRatio),
      l: clamp01(1 - (1 - base.l) * t.whiteGapFactor),
    });
    ramp[step] = rgbToHex(shade.r, shade.g, shade.b);
  }
  return ramp;
}
