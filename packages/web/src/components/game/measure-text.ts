// Shared offscreen text measurer. One node for the whole app, reused across
// every measurement so computing the grid's uniform description font (80+
// strings × a handful of font sizes) doesn't churn DOM nodes. Heights are
// memoized by (width, font, lineHeight, text).

let measurer: HTMLDivElement | null = null;
const cache = new Map<string, number>();

function ensure(): HTMLDivElement {
  if (!measurer) {
    measurer = document.createElement("div");
    const s = measurer.style;
    s.position = "absolute";
    s.visibility = "hidden";
    s.pointerEvents = "none";
    s.left = "-9999px";
    s.top = "0";
    s.whiteSpace = "normal";
    s.overflowWrap = "break-word";
    document.body.appendChild(measurer);
  }
  return measurer;
}

/**
 * Copy the typography of `el` (font family, weight, letter-spacing) onto the
 * measurer so wrapping matches the real element. Call once before a batch of
 * measurements; cached heights assume a single app-wide font.
 */
export function syncMeasurerFont(el: HTMLElement): void {
  const m = ensure();
  const cs = getComputedStyle(el);
  m.style.fontFamily = cs.fontFamily;
  m.style.fontWeight = cs.fontWeight;
  m.style.letterSpacing = cs.letterSpacing;
}

/** Rendered height (px) of `text` wrapped to `width` at the given size. */
export function measureTextHeight(
  text: string,
  width: number,
  fontPx: number,
  lineHeight: number,
): number {
  const key = `${width}|${fontPx}|${lineHeight}|${text}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const m = ensure();
  m.style.width = `${width}px`;
  m.style.fontSize = `${fontPx}px`;
  m.style.lineHeight = String(lineHeight);
  m.textContent = text;
  const h = m.scrollHeight;
  cache.set(key, h);
  return h;
}
