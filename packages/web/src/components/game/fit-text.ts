// Pure text-fitting policy, split from the DOM/React layer so it's
// unit-testable without a real layout engine. The catalog grid shows ONE
// description variant (`default`) at ONE uniform font size across every
// card — so the only decision is: what is the largest font at which the
// longest description still fits the card's description box? This computes
// exactly that, given a height-measuring function.

/**
 * Largest font from `fonts` (pass largest→smallest) at which EVERY text
 * fits within `maxHeight`. Used to pick one uniform description font for the
 * whole grid: the worst-case (tallest) description sets the size, so all
 * cards render at the same readable size with nothing truncated.
 *
 * Returns the smallest font in `fonts` as a floor if even that doesn't fit
 * every text — callers pair this with a `min-height` (not a hard clip) box,
 * so an over-long outlier grows its card rather than getting cut off.
 */
export function largestFontFittingAll(
  texts: readonly string[],
  maxHeight: number,
  fonts: readonly number[],
  measure: (text: string, fontPx: number) => number,
): number {
  for (const fontPx of fonts) {
    let allFit = true;
    for (const text of texts) {
      if (measure(text, fontPx) > maxHeight) {
        allFit = false;
        break;
      }
    }
    if (allFit) return fontPx;
  }
  return fonts[fonts.length - 1] ?? 12;
}
