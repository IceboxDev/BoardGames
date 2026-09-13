import { isNinja, rankOf } from "@boardgames/core/games/senso-battle-for-japan/deck";
import type { CardId } from "@boardgames/core/games/senso-battle-for-japan/types";
import type { CSSProperties } from "react";

/**
 * The card's design grid. Every face is drawn on a 400×600 canvas (the
 * `--aspect-card` 2:3) and rendered as DOM layers whose boxes are `%` of the
 * card and whose text is `cqw`, so one drawing is right at 20 px, 48 px,
 * 160 px and 320 px. Nothing here is React: the boxes are data so the tests
 * can check that pips never touch the corner index and the index never leaves
 * the safe area.
 */
export const GRID = { w: 400, h: 600 } as const;

export type SensoCardSize = "hand" | "play" | "table" | "mini";

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Everything but paper and grain stays inside this. */
export const SAFE: Box = { x: 14, y: 14, w: 372, h: 572 };

// ---------------------------------------------------------------------------
// Grid → CSS
// ---------------------------------------------------------------------------

/** A box as `%` of the card, for an absolutely positioned layer. */
export function boxStyle(b: Box): CSSProperties {
  return {
    left: `${(b.x / GRID.w) * 100}%`,
    top: `${(b.y / GRID.h) * 100}%`,
    width: `${(b.w / GRID.w) * 100}%`,
    height: `${(b.h / GRID.h) * 100}%`,
  };
}

/** Grid units → container-query width units (400 units = the card's width). */
export function cq(units: number): string {
  return `${units / 4}cqw`;
}

/** The same box seen from the other end of the card (rotated 180°). */
export function mirror(b: Box): Box {
  return { x: GRID.w - b.x - b.w, y: GRID.h - b.y - b.h, w: b.w, h: b.h };
}

export function union(a: Box, b: Box): Box {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    w: Math.max(a.x + a.w, b.x + b.w) - x,
    h: Math.max(a.y + a.h, b.y + b.h) - y,
  };
}

export function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

export function contains(outer: Box, inner: Box): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.w <= outer.x + outer.w &&
    inner.y + inner.h <= outer.y + outer.h
  );
}

// ---------------------------------------------------------------------------
// Chrome
// ---------------------------------------------------------------------------

export const FRAME = {
  /** The clan-coloured rule. */
  rule: { box: SAFE, width: 4 },
  /** The ink hairline inside it. */
  hairline: { box: { x: 24, y: 24, w: 352, h: 552 }, width: 1.5 },
} as const;

/** The ink cloud-scroll in each corner, drawn under everything and mirrored per corner. */
const ORNAMENT_BOX: Box = { x: 26, y: 26, w: 84, h: 84 };
export const ORNAMENT = {
  opacity: 0.35,
  corners: [
    { key: "tl", box: ORNAMENT_BOX, transform: undefined },
    {
      key: "tr",
      box: { ...ORNAMENT_BOX, x: GRID.w - ORNAMENT_BOX.x - ORNAMENT_BOX.w },
      transform: "scaleX(-1)",
    },
    {
      key: "bl",
      box: { ...ORNAMENT_BOX, y: GRID.h - ORNAMENT_BOX.y - ORNAMENT_BOX.h },
      transform: "scaleY(-1)",
    },
    { key: "br", box: mirror(ORNAMENT_BOX), transform: "rotate(180deg)" },
  ],
} as const;

// ---------------------------------------------------------------------------
// Corner index — the one thing guaranteed visible in a squeezed fan
// ---------------------------------------------------------------------------

export type IndexDetail = "normal" | "large";

/**
 * Ink bounds of every rank glyph in Inter Black, per mille of the em,
 * measured with `measureText` (actualBoundingBox*) in the browser. The
 * index is laid out from these so the ink — not the line box — keeps an
 * equal margin to the hairline on the left and the top, and the crest is
 * centred under the glyph's ink rather than under its advance.
 */
export interface GlyphInk {
  left: number;
  right: number;
  ascent: number;
  descent: number;
}

export const GLYPH_INK: Record<string, GlyphInk> = {
  "2": { left: 31, right: 609, ascent: 750, descent: 0 },
  "3": { left: 31, right: 641, ascent: 750, descent: 16 },
  "4": { left: 31, right: 672, ascent: 734, descent: 0 },
  "5": { left: 31, right: 625, ascent: 734, descent: 16 },
  "6": { left: 31, right: 641, ascent: 750, descent: 16 },
  "7": { left: 16, right: 578, ascent: 734, descent: 0 },
  "8": { left: 31, right: 656, ascent: 750, descent: 16 },
  "9": { left: 31, right: 641, ascent: 750, descent: 16 },
  "10": { left: 31, right: 1140, ascent: 750, descent: 16 },
  J: { left: 16, right: 563, ascent: 734, descent: 16 },
  Q: { left: 31, right: 766, ascent: 750, descent: 63 },
  K: { left: 47, right: 750, ascent: 734, descent: 0 },
  A: { left: 16, right: 781, ascent: 734, descent: 0 },
  忍: { left: 16, right: 984, ascent: 813, descent: 78 },
};

/** Where the baseline sits in a `line-height: 1` box (Inter: ascent 968, descent 242). */
const BASELINE = 0.863;
/** The tallest rank's ascent, per mille. */
const CAP_HEIGHT = 750;
/** Tracking applied to the two-character "10". */
export const TRACK_WIDE = -0.06;
/** Ink margin from the hairline's inner edge, left and top. */
export const INDEX_MARGIN = 11;

export interface IndexSpec {
  rankFont: number;
  /** Line-box width for the glyph (overflow is visible; it only needs to hold "10"). */
  glyphW: number;
  gapBar: number;
  barH: number;
  gapCrest: number;
  crest: number;
}

export const INDEX: Record<IndexDetail, IndexSpec> = {
  normal: { rankFont: 72, glyphW: 110, gapBar: 8, barH: 6, gapCrest: 4, crest: 48 },
  large: { rankFont: 92, glyphW: 130, gapBar: 8, barH: 8, gapCrest: 4, crest: 52 },
};

export interface IndexGeometry {
  /** The glyph's line box; the ink lands `INDEX_MARGIN` inside the hairline. */
  glyph: Box;
  ink: Box;
  bar: Box;
  crest: Box;
  letterSpacing: string | undefined;
}

/** The index's boxes for one glyph, from its measured ink. */
export function indexGeometry(glyph: string, detail: IndexDetail): IndexGeometry {
  const spec = INDEX[detail];
  const F = spec.rankFont;
  const m = GLYPH_INK[glyph] ?? GLYPH_INK.A;
  const wide = glyph.length > 1;
  const inner = FRAME.hairline.box.x + FRAME.hairline.width;
  const target = inner + INDEX_MARGIN;
  const inkW = ((m.right - m.left) / 1000) * F + (wide ? TRACK_WIDE * F : 0);
  const inkH = ((m.ascent + m.descent) / 1000) * F;
  const glyphBox: Box = {
    x: target - (m.left / 1000) * F,
    y: target - (BASELINE - m.ascent / 1000) * F,
    w: spec.glyphW,
    h: F,
  };
  const ink: Box = { x: target, y: target, w: inkW, h: inkH };
  const cx = target + inkW / 2;
  // The bar and crest hang from the cap height, not the glyph's own descent,
  // so every card's crest sits at the same height (a Q's tail just runs closer).
  const barY = target + (CAP_HEIGHT / 1000) * F + spec.gapBar;
  const barW = Math.max(spec.crest, inkW);
  return {
    glyph: glyphBox,
    ink,
    bar: { x: cx - barW / 2, y: barY, w: barW, h: spec.barH },
    crest: {
      x: cx - spec.crest / 2,
      y: barY + spec.barH + spec.gapCrest,
      w: spec.crest,
      h: spec.crest,
    },
    letterSpacing: wide ? `${TRACK_WIDE}em` : undefined,
  };
}

/** The whole footprint of an index over every glyph, for collision checks. */
export function indexBounds(detail: IndexDetail): Box {
  let bounds: Box | null = null;
  for (const glyph of Object.keys(GLYPH_INK)) {
    const g = indexGeometry(glyph, detail);
    for (const b of [g.ink, g.bar, g.crest]) bounds = bounds ? union(bounds, b) : b;
  }
  return bounds as Box;
}

// ---------------------------------------------------------------------------
// Ribbon, seal, bodies
// ---------------------------------------------------------------------------

/** The tanzaku hanging over the top edge. */
export const RIBBON = {
  box: { x: 312, y: 0, w: 64, h: 196 },
  cap: { x: 312, y: 0, w: 64, h: 24 },
  kanji: { x: 320, y: 38, w: 48, h: 140 },
  border: 2,
} as const;

/** The advantage seal — bottom-left, where a print carries its artist's seal. */
export const SEAL: Box = { x: 22, y: 466, w: 64, h: 64 };

export interface BodySpec {
  /** The area that holds the pip *rects* (centres are inset by half a pip). */
  pipArea: Box;
  pipSize: (rank: number) => number;
  court: Box;
  aceHalo: Box;
  aceCrest: Box;
  /** A single crest as the whole body (`mini`, and a `clanOnly` card). */
  crest: Box;
  crestBare: Box;
}

export const BODY: Record<IndexDetail, BodySpec> = {
  normal: {
    pipArea: { x: 118, y: 160, w: 164, h: 282 },
    pipSize: (rank) => (rank <= 3 ? 72 : rank <= 6 ? 60 : 52),
    court: { x: 88, y: 158, w: 224, h: 284 },
    aceHalo: { x: 50, y: 150, w: 300, h: 300 },
    aceCrest: { x: 100, y: 200, w: 200, h: 200 },
    crest: { x: 84, y: 196, w: 232, h: 232 },
    crestBare: { x: 60, y: 150, w: 280, h: 280 },
  },
  large: {
    pipArea: { x: 134, y: 186, w: 132, h: 228 },
    pipSize: (rank) => (rank <= 3 ? 60 : rank <= 6 ? 50 : 44),
    court: { x: 90, y: 188, w: 220, h: 226 },
    aceHalo: { x: 60, y: 160, w: 280, h: 280 },
    aceCrest: { x: 110, y: 200, w: 180, h: 180 },
    crest: { x: 100, y: 200, w: 200, h: 200 },
    crestBare: { x: 60, y: 150, w: 280, h: 280 },
  },
};

/** The ninja figure runs under the indices (they get a paper backing). */
export const NINJA_FIGURE: Box = { x: 40, y: 60, w: 320, h: 480 };

// ---------------------------------------------------------------------------
// Pips — the classic playing-card layouts as (u, v) fractions of the pip area
// ---------------------------------------------------------------------------

export interface Pip {
  u: number;
  v: number;
  /** Lower-half pips are printed upside down, as on a real card. */
  flip: boolean;
}

const L = 0;
const C = 0.5;
const R = 1;

function pip(u: number, v: number): Pip {
  return { u, v, flip: v > 0.5 };
}

function columns(vs: number[]): Pip[] {
  return vs.flatMap((v) => [pip(L, v), pip(R, v)]);
}

export const PIP_LAYOUTS: Record<number, readonly Pip[]> = {
  2: [pip(C, 0), pip(C, 1)],
  3: [pip(C, 0), pip(C, 0.5), pip(C, 1)],
  4: columns([0, 1]),
  5: [...columns([0, 1]), pip(C, 0.5)],
  6: columns([0, 0.5, 1]),
  7: [...columns([0, 0.5, 1]), pip(C, 0.25)],
  8: [...columns([0, 0.5, 1]), pip(C, 0.25), pip(C, 0.75)],
  9: [...columns([0, 1 / 3, 2 / 3, 1]), pip(C, 0.5)],
  10: [...columns([0, 1 / 3, 2 / 3, 1]), pip(C, 0.25), pip(C, 0.75)],
};

export interface PipRect extends Box {
  flip: boolean;
}

/** Where each pip of a number card sits on the grid. */
export function pipRects(rank: number, detail: IndexDetail): PipRect[] {
  const layout = PIP_LAYOUTS[rank];
  if (!layout) return [];
  const { pipArea, pipSize } = BODY[detail];
  const s = pipSize(rank);
  return layout.map(({ u, v, flip }) => ({
    x: pipArea.x + u * (pipArea.w - s),
    y: pipArea.y + v * (pipArea.h - s),
    w: s,
    h: s,
    flip,
  }));
}

// ---------------------------------------------------------------------------
// Level of detail
// ---------------------------------------------------------------------------

export interface Detail {
  index: IndexDetail;
  mirroredIndex: boolean;
  ribbon: boolean;
  grain: boolean;
  ornaments: boolean;
  /** `full` = pips / figure / halo; `crest` = one big crest. */
  body: "full" | "crest";
}

export const DETAIL: Record<SensoCardSize, Detail> = {
  hand: {
    index: "normal",
    mirroredIndex: true,
    ribbon: true,
    grain: true,
    ornaments: true,
    body: "full",
  },
  play: {
    index: "large",
    mirroredIndex: true,
    ribbon: true,
    grain: false,
    ornaments: false,
    body: "full",
  },
  table: {
    index: "large",
    mirroredIndex: true,
    ribbon: true,
    grain: false,
    ornaments: false,
    body: "full",
  },
  mini: {
    index: "large",
    mirroredIndex: false,
    ribbon: false,
    grain: false,
    ornaments: false,
    body: "crest",
  },
};

/** The narrowest each size is rendered at, in CSS px (the phone table's `play` is ≈49). */
export const MIN_FACE_PX: Record<SensoCardSize, number> = {
  hand: 160,
  play: 48,
  table: 56,
  mini: 36,
};

/** Readability floor for the rank glyph, in CSS px. */
export const MIN_RANK_PX = 11;

export function rankGlyphPx(size: SensoCardSize, facePx: number): number {
  return (INDEX[DETAIL[size].index].rankFont / GRID.w) * facePx;
}

// ---------------------------------------------------------------------------
// What fills the body
// ---------------------------------------------------------------------------

export type CardKind = "pips" | "court" | "ace" | "ninja" | "crest";

export function cardKind(card: CardId, clanOnly: boolean, body: Detail["body"]): CardKind {
  if (isNinja(card)) return "ninja";
  if (clanOnly || body === "crest") return "crest";
  const rank = rankOf(card);
  if (rank === 14) return "ace";
  if (rank >= 11) return "court";
  return "pips";
}

// ---------------------------------------------------------------------------
// Back
// ---------------------------------------------------------------------------

export const BACK = {
  frame: { box: { x: 16, y: 16, w: 368, h: 568 }, width: 2 },
  emblem: { x: 90, y: 190, w: 220, h: 220 },
} as const;
