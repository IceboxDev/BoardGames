import { clamp01, type Hsl, hexToRgb, hslToRgb, rgbToHex, rgbToHsl } from "./ramp.ts";

// ── Semantic + art color derivation ──────────────────────────────────────
//
// The accent ramp (ramp.ts) rethemes everything drawn in the ACCENT family.
// This module covers the colors that carry a MEANING rather than an identity:
// the "connected" green, the "maybe" yellow, the calendar's fire and its
// sealed-night indigo, and the ink that has to stay readable on an accent
// fill. Before this existed they were hardcoded, so a Sakura or Terminal
// theme repainted the whole app and left an orange bonfire and a neon-green
// success line sitting in the middle of it.
//
// THE RULE: every channel moves by how far the ACCENT moved off the stock
// indigo — never toward an absolute target.
//
//     h' = stockH + (accentH - refH) * followHue
//     s' = stockS + (accentS - refS) * followSat
//     l' = stockL + (accentL - refL) * followLight
//
// The consequence that makes this safe: feed the reference accent back in and
// every delta is zero, so Classic reproduces the stock hexes EXACTLY (pinned
// in semantic.test.ts). A blend toward the accent — the obvious alternative —
// has no such fixed point and would recolor the shipped look on day one.
//
// `followHue` is per-group editorial. Sealed nights track the accent 1:1
// (in Classic they ARE the indigo/violet family); fire and the status tones
// follow partway, so a rotated palette tints them without a green flame.
//
// Game boards are deliberately NOT in scope: a red Pandemic cube stays red,
// so these are their own tokens rather than overrides of `--color-red-*`.

/** The accent every stock value below was picked against (index.css). */
const REFERENCE_ACCENT = "#6366f1";

interface Follow {
  hue: number;
  sat: number;
  light: number;
}

// Status tones read as text/dots on a panel: follow the palette clearly, but
// keep enough of their own hue that "connected" never reads as "warning".
const STATUS: Follow = { hue: 0.45, sat: 0.55, light: 0.35 };
// Fire is art. It tilts with the theme but keeps its internal hot→deep order.
const HEAT: Follow = { hue: 0.35, sat: 0.4, light: 0.25 };
// A sealed night is the accent family by construction — track it 1:1.
const SEALED: Follow = { hue: 1, sat: 0.5, light: 0.3 };

/**
 * Groups exist for the separation guard below: a group rotates as one unit, so
 * nudging "maybe" away from a yellow accent can't leave its own family split
 * across the color wheel.
 */
type Group = "ok" | "warn" | "heat" | "sealed";

interface TokenSpec {
  /** Today's value — what Classic must keep rendering, byte for byte. */
  stock: string;
  group: Group;
  follow: Follow;
}

/**
 * Every token here is declared in index.css's `@theme static` block with
 * exactly this `stock` value, which is what lets a Classic theme drop the
 * override entirely and fall back to an identical value.
 */
export const SEMANTIC_TOKENS: Record<string, TokenSpec> = {
  // Status — "connected", "maybe", and their strong/soft partners.
  "--color-ok": { stock: "#6ee7b7", group: "ok", follow: STATUS },
  "--color-ok-strong": { stock: "#34d399", group: "ok", follow: STATUS },
  "--color-warn": { stock: "#fbbf24", group: "warn", follow: STATUS },
  "--color-warn-strong": { stock: "#facc15", group: "warn", follow: STATUS },
  "--color-warn-soft": { stock: "#fde047", group: "warn", follow: STATUS },
  "--color-warn-gold": { stock: "#fcd34d", group: "warn", follow: STATUS },
  "--color-warn-pale": { stock: "#fef3c7", group: "warn", follow: STATUS },
  // Calendar heat — hottest core to deepest molten base.
  "--color-heat-glow": { stock: "#fde68a", group: "heat", follow: HEAT },
  "--color-heat-bright": { stock: "#fb923c", group: "heat", follow: HEAT },
  "--color-heat": { stock: "#f97316", group: "heat", follow: HEAT },
  "--color-heat-deep": { stock: "#c2410c", group: "heat", follow: HEAT },
  "--color-heat-ember": { stock: "#ef4444", group: "heat", follow: HEAT },
  "--color-heat-molten": { stock: "#7f1d1d", group: "heat", follow: HEAT },
  // Sealed night — the locked-in cell's deep regal base.
  "--color-sealed-base": { stock: "#1e1b4b", group: "sealed", follow: SEALED },
  "--color-sealed-mid": { stock: "#4c1d95", group: "sealed", follow: SEALED },
  "--color-sealed-edge": { stock: "#312e81", group: "sealed", follow: SEALED },
};

export const SEMANTIC_VAR_NAMES = Object.keys(SEMANTIC_TOKENS);

/**
 * Minimum hue distance a status group keeps from the accent. The coverage pie
 * paints "can" in the accent beside "maybe" in `--color-warn`; on an
 * amber-accented theme those two collapsed into one unreadable yellow disc.
 * Fire and sealed nights are large filled areas read against the page rather
 * than against a neighbouring swatch, so they are exempt.
 */
const MIN_ACCENT_SEPARATION = 30;
const SEPARATED_GROUPS: ReadonlySet<Group> = new Set<Group>(["ok", "warn"]);

/** The anchor whose hue decides a group's separation nudge. */
const GROUP_ANCHOR: Record<Group, string> = {
  ok: "--color-ok",
  warn: "--color-warn",
  heat: "--color-heat",
  sealed: "--color-sealed-mid",
};

function hslOf(hex: string): Hsl {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHsl(r, g, b);
}

function hexOf(hsl: Hsl): string {
  const { r, g, b } = hslToRgb(hsl);
  return rgbToHex(r, g, b);
}

/** Shortest signed rotation from `b` to `a`, in (-180, 180]. */
function signedHueDelta(a: number, b: number): number {
  let d = (a - b) % 360;
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return d;
}

const REFERENCE_HSL = hslOf(REFERENCE_ACCENT);

function shift(stock: Hsl, accent: Hsl, follow: Follow, extraHue: number): Hsl {
  return {
    h: stock.h + signedHueDelta(accent.h, REFERENCE_HSL.h) * follow.hue + extraHue,
    s: clamp01(stock.s + (accent.s - REFERENCE_HSL.s) * follow.sat),
    l: clamp01(stock.l + (accent.l - REFERENCE_HSL.l) * follow.light),
  };
}

/**
 * Extra rotation that pulls a group clear of the accent, applied to every
 * token in the group so the family stays coherent. Pushes along whichever
 * side of the accent the group already sits on.
 */
function separationNudge(group: Group, accent: Hsl): number {
  if (!SEPARATED_GROUPS.has(group)) return 0;
  const spec = SEMANTIC_TOKENS[GROUP_ANCHOR[group]];
  const anchor = shift(hslOf(spec.stock), accent, spec.follow, 0);
  const gap = signedHueDelta(anchor.h, accent.h);
  if (Math.abs(gap) >= MIN_ACCENT_SEPARATION) return 0;
  const direction = gap === 0 ? 1 : Math.sign(gap);
  return direction * (MIN_ACCENT_SEPARATION - Math.abs(gap));
}

/**
 * Every semantic/art token, retuned around `accentHex`. Passing the reference
 * accent returns the stock values unchanged.
 */
export function deriveSemanticTokens(accentHex: string): Record<string, string> {
  const accent = hslOf(accentHex);
  const nudges = {} as Record<Group, number>;
  for (const group of ["ok", "warn", "heat", "sealed"] as const) {
    nudges[group] = separationNudge(group, accent);
  }
  const out: Record<string, string> = {};
  for (const [name, spec] of Object.entries(SEMANTIC_TOKENS)) {
    out[name] = hexOf(shift(hslOf(spec.stock), accent, spec.follow, nudges[spec.group]));
  }
  return out;
}

// ── Ink on an accent fill ────────────────────────────────────────────────

/** WCAG relative luminance of an `#rrggbb`. */
export function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/**
 * Readable ink for text sitting ON the accent fill — the primary button's
 * gradient and the solid-accent variant. Terminal's `#00ff88` is the case
 * that forced this: white-on-neon-green was barely legible, while the stock
 * indigo needs white and must keep it.
 *
 * The primary button is a gradient, so the decision averages both ends: a
 * single bright stop is enough to sink white text over half the button.
 */
export function inkForAccent(accentHex: string, gradientEndHex: string): string {
  const luminance = (relativeLuminance(accentHex) + relativeLuminance(gradientEndHex)) / 2;
  // 0.42 rather than a contrast-ratio solve: these fills carry semibold 14–16px
  // text, and the darker ink is the app's own near-black rather than #000.
  return luminance > 0.42 ? "#0b0d12" : "#ffffff";
}
