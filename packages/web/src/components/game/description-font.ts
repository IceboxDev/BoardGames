import { createContext, useContext } from "react";

// Uniform description sizing for the catalog grid. Every card shows the
// `default` description variant at ONE font size — the largest at which the
// longest description still fits the card's box at the current column width.
// That keeps the grid visually consistent (same size on every card) while
// never truncating: on smaller/narrower screens the font scales down
// uniformly instead of cutting text. The font is computed by
// `DescriptionGrid` and read by cards via `useDescriptionFont`.

/** Target height (px) the description should fit within — applied by cards
 *  as a `min-height`, so a rare over-long outlier grows its card rather than
 *  clipping. */
export const DESCRIPTION_TARGET_PX = 144;
export const DESCRIPTION_LINE_HEIGHT = 1.5;

/** Font ladder (px), largest first. Floor at 10px — comfortably readable,
 *  and the data shows even the tightest 2-column layout fits `default`
 *  there. */
export const DESCRIPTION_FONT_LADDER = [16, 15, 14, 13, 12, 11, 10] as const;
export const DESCRIPTION_DEFAULT_FONT_PX = 13;

/** GameCardBody horizontal padding (px-6 → 24px each side) plus a few px of
 *  headroom for the card border / sub-pixel rounding, so the measured width
 *  is never wider than the real text column. */
export const DESCRIPTION_BODY_INSET_PX = 48 + 6;

export const DescriptionFontContext = createContext<number>(DESCRIPTION_DEFAULT_FONT_PX);

/** Font size (px) chosen by the nearest `DescriptionGrid`. */
export function useDescriptionFont(): number {
  return useContext(DescriptionFontContext);
}
