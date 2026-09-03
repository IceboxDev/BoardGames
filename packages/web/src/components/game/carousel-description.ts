// Fill-aware description sizing for carousel card bodies — the pure math,
// split from `CarouselBody` so it's unit-testable without a layout engine.
//
// The carousel scales every pixel dimension off cardW, but the body's TEXT
// used to stay at viewport-breakpoint sizes and always show the `default`
// variant. On a MAX-width desktop card that left ~340 chars of 12px text
// floating in a ~300px-tall description slot (the body's height share keeps
// growing with the card; the text doesn't). This module makes the text
// follow the card instead:
//
//   1. The body type (title + description) scales with cardW — softened,
//      so larger cards get both bigger text AND more character capacity.
//   2. The VARIANT is the longest of loose/default/tight that fits the
//      slot COMPLETELY. Descriptions are never truncated by choice: a
//      variant that would need an ellipsis falls back to the next shorter
//      one, and when even tight can't fit whole the card shows no
//      description at all (that's the three-variant pipeline's whole
//      point — every length is a finished text).
//
// The estimate is deliberately rough (average glyph width), so
// `CarouselBody` keeps a `-webkit-line-clamp` as a BACKSTOP for estimate
// error: a rare miss costs a whole-line ellipsis, never an overflow past
// the card's clip edge.

import type { GameDescriptions } from "../../games/types";
import { stripBggHtml } from "../../lib/bgg-format";
import { REF_CARD_W } from "./carousel-3d-constants";

// Typography at the 380px reference card — the sizes the design was tuned
// at (title text-xl, description at the old `xl:text-xs` tier).
const REF_TITLE_FONT_PX = 20;
const REF_DESC_FONT_PX = 12;
const MIN_DESC_FONT_PX = 10;
const DESC_LEADING = 1.45;

// Compact-card title: sized to fit the WHOLE title on one line, between
// these bounds (text-lg down to a still-legible floor). Bold glyph advance
// ≈ 0.55em. A pathologically long title that would need to go below the
// floor wraps instead — the renderer keeps a 2-line clamp as the backstop.
const COMPACT_TITLE_MAX_PX = 18;
const COMPACT_TITLE_MIN_PX = 13;
const TITLE_CHAR_EM = 0.55;

// Softened growth: cards larger than the reference scale their type by 60%
// of the size ratio, capped. Full proportionality would keep the body's
// CHARACTER capacity constant (the reference look, zoomed) and the loose
// variant could never fit; no scaling leaves a MAX-width card's text
// drowning in its own body. 0.6 splits the growth between bigger type and
// more text on screen. Cards at or below the reference are untouched.
const SCALE_SOFTNESS = 0.6;
const MAX_SCALE = 1.4;

// Average glyph advance as a fraction of the font size for the UI stack —
// mixed-case English in Inter/system-ui lands near 0.5em; 0.52 errs toward
// picking the shorter variant, which degrades to slack, not clipping.
const AVG_CHAR_EM = 0.52;

// Px budget of everything above the description at scale 1, split so the
// title's share (one line at ~23px for text-xl) can follow the actual
// title treatment — scaled in full mode, fitted (and occasionally wrapped)
// in compact — while paddings, gaps, meta and BggInline stay fixed.
const FIXED_NON_TITLE_PX = { full: 152, compact: 115 };
const REF_TITLE_LINE_PX = 23;
const TITLE_LEADING = 1.15;

// Horizontal body padding (full px-5, compact px-3), both sides.
const BODY_PAD_PX = { full: 40, compact: 24 };

// A text column taller than this many lines stops reading as a card blurb.
const MAX_LINES = { full: 12, compact: 3 };

/** Softened type scale for a card of this width (1 at/below the reference). */
function bodyScale(cardW: number): number {
  return Math.min(MAX_SCALE, Math.max(1, 1 + (cardW / REF_CARD_W - 1) * SCALE_SOFTNESS));
}

export type DescriptionPlan = {
  /** null when the slot can't fit even two lines — render nothing. */
  text: string | null;
  fontPx: number;
  lineHeightPx: number;
  /** Whole lines the slot fits — the `-webkit-line-clamp` value. */
  maxLines: number;
  /** Title size: scaled in full mode, fitted-to-one-line in compact. */
  titleFontPx: number;
};

/** Pick type scale + variant for a carousel card body. */
export function planDescription({
  cardW,
  bodyHeight,
  compact,
  title,
  descriptions,
}: {
  cardW: number;
  bodyHeight: number;
  compact: boolean;
  title: string;
  descriptions?: GameDescriptions;
}): DescriptionPlan {
  const mode = compact ? "compact" : "full";
  // Compact cards sit below the reference width, so scale is 1 there and
  // the compact layout renders exactly as tuned.
  const scale = compact ? 1 : bodyScale(cardW);
  const titleFontPx = compact
    ? Math.min(
        COMPACT_TITLE_MAX_PX,
        Math.max(
          COMPACT_TITLE_MIN_PX,
          Math.floor((cardW - BODY_PAD_PX.compact) / (TITLE_CHAR_EM * Math.max(1, title.length))),
        ),
      )
    : Math.round(REF_TITLE_FONT_PX * scale);
  const fontPx = Math.round(Math.max(MIN_DESC_FONT_PX, REF_DESC_FONT_PX * scale));
  const lineHeightPx = Math.round(fontPx * DESC_LEADING);

  // Title budget follows the actual rendering: full mode is always one
  // (truncated) line; compact is one FITTED line, or two when the title is
  // long enough to have pushed the fit below the font floor.
  const compactTitleWraps =
    compact && TITLE_CHAR_EM * title.length * titleFontPx > cardW - BODY_PAD_PX.compact;
  const titleLinePx = compact
    ? Math.round(titleFontPx * TITLE_LEADING)
    : Math.round(REF_TITLE_LINE_PX * scale);
  const fixedPx = FIXED_NON_TITLE_PX[mode] + (compactTitleWraps ? 2 : 1) * titleLinePx;
  const slotPx = bodyHeight - fixedPx;
  const maxLines = Math.min(MAX_LINES[mode], Math.floor(slotPx / lineHeightPx));
  if (!descriptions || maxLines < 2)
    return { text: null, fontPx, lineHeightPx, maxLines, titleFontPx };

  const charsPerLine = (cardW - BODY_PAD_PX[mode]) / (fontPx * AVG_CHAR_EM);
  // Longest variant that fits WHOLE — never a chosen truncation. No fit at
  // all → no description (title + meta carry the card).
  const text =
    [descriptions.loose, descriptions.default, descriptions.tight]
      .map(stripBggHtml)
      .find((t) => Math.ceil(t.length / charsPerLine) <= maxLines) ?? null;
  return { text, fontPx, lineHeightPx, maxLines, titleFontPx };
}
