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
//      one. The floor is guaranteed, though — a card always shows at LEAST
//      the tight text, clamped when even that can't fit whole (tights vary
//      ~120–220 chars, and a phone-height slot sits right in that range,
//      which used to leave some games with text and others with none).
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
// How far a description may shrink to finish instead of being clamped.
const SHRINK_FLOOR_PX = 9;
// Share of a line's character capacity that word wrapping actually uses.
const WRAP_SLACK = 0.9;
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
// Compact, measured in the rendered body (320px phone): py-3 12 + accent 2
// + gap 6 + [title] + gap 6 + meta 14 + gap 6 + BggInline 34 + gap 6 +
// bottom 12 = 98. The old 115 over-reserved 17px — exactly the two lines
// a short phone's card had room for, so it showed no description at all.
const FIXED_NON_TITLE_PX = { full: 152, compact: 98 };
const REF_TITLE_LINE_PX = 23;
const TITLE_LEADING = 1.15;

// Horizontal body padding (full px-5, compact px-3), both sides.
const BODY_PAD_PX = { full: 40, compact: 24 };

// A text column taller than this many lines stops reading as a card blurb.
const MAX_LINES = { full: 12, compact: 8 };

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
  const baseFontPx = Math.round(Math.max(MIN_DESC_FONT_PX, REF_DESC_FONT_PX * scale));

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

  const layout = (fontPx: number) => {
    const lineHeightPx = Math.round(fontPx * DESC_LEADING);
    const maxLines = Math.min(MAX_LINES[mode], Math.floor(slotPx / lineHeightPx));
    // Lines break at words, not characters: a line ends on average about
    // half a word short of its width (WRAP_SLACK), which the raw estimate
    // missed — Cartographers' blurb "fit" three lines and wrapped to four.
    const charsPerLine = ((cardW - BODY_PAD_PX[mode]) / (fontPx * AVG_CHAR_EM)) * WRAP_SLACK;
    const fits = (t: string) => maxLines >= 2 && Math.ceil(t.length / charsPerLine) <= maxLines;
    return { fontPx, lineHeightPx, maxLines, fits };
  };
  const base = layout(baseFontPx);
  if (!descriptions || base.maxLines < 2) {
    return { text: null, ...pick(base), titleFontPx };
  }

  // Longest variant that fits WHOLE at the card's own size — never a chosen
  // truncation. Only when even the tight text doesn't fit does the type step
  // down, a pixel at a time to SHRINK_FLOOR_PX (still crisp on the
  // high-density screens such cards live on), and then for the TIGHT text
  // only: smaller type is the last resort to finish the shortest blurb, never
  // a way to squeeze in a longer one. Past the floor, a clamped tight.
  const ranked = [descriptions.loose, descriptions.default, descriptions.tight].map(stripBggHtml);
  const full = ranked.find(base.fits);
  if (full) return { text: full, ...pick(base), titleFontPx };
  const tight = ranked[2];
  for (let fontPx = baseFontPx - 1; fontPx >= SHRINK_FLOOR_PX; fontPx--) {
    const at = layout(fontPx);
    if (at.fits(tight)) return { text: tight, ...pick(at), titleFontPx };
  }
  const floor = layout(Math.min(baseFontPx, SHRINK_FLOOR_PX));
  return floor.maxLines >= 2
    ? { text: tight, ...pick(floor), titleFontPx }
    : { text: tight, ...pick(base), titleFontPx };
}

function pick(at: { fontPx: number; lineHeightPx: number; maxLines: number }) {
  return { fontPx: at.fontPx, lineHeightPx: at.lineHeightPx, maxLines: at.maxLines };
}
