// The app accent for the places that need a *value* rather than a class —
// SVG fills, chart strokes, `accentHex ?? …` fallbacks. The source of truth
// is the `--color-accent-500` theme var (declared in index.css `@theme`,
// overridable at runtime by the personalization engine): call `getAccent()`
// for the live value. `DEFAULT_ACCENT` is that var's stock value and the
// static fallback when no DOM is available. Before this constant existed,
// six files each hand-typed "#6366f1".
export const DEFAULT_ACCENT = "#6366f1";

/**
 * Live accent read: `--color-accent-500` off `<html>` — an inline override
 * (the theme engine's write surface, and what jsdom reflects) first, then the
 * stylesheet-computed value — falling back to `DEFAULT_ACCENT`.
 *
 * For the personalization engine and theme-aware consumers. Existing
 * `DEFAULT_ACCENT` importers stay on the const (a static fallback is exactly
 * what they want); new code that must track the active theme calls this,
 * re-reading after each `themechange` window event since the result is a
 * point-in-time value, not a subscription.
 */
export function getAccent(): string {
  if (typeof document === "undefined") return DEFAULT_ACCENT;
  const root = document.documentElement;
  const inline = root.style.getPropertyValue("--color-accent-500").trim();
  if (inline) return inline;
  return getComputedStyle(root).getPropertyValue("--color-accent-500").trim() || DEFAULT_ACCENT;
}
