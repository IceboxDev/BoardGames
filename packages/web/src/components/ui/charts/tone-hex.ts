// Tone → hex for SVG fills and strokes. Charts can't use Tailwind classes for
// gradients/strokes, so this is the one sanctioned bridge from the `tones.ts`
// vocabulary to raw color values — resolved LIVE from the theme's CSS custom
// properties, so the personalization engine (which overrides `--color-*` vars
// on `:root` and dispatches a `themechange` window event) rethemes charts
// along with everything else.
//
// Resolution order, per tone:
//   1. an inline `--color-*` override on `document.documentElement` — the
//      theme engine's write surface, and the only custom-prop source jsdom
//      reflects, which keeps tests deterministic;
//   2. the stylesheet-computed value — but ONLY for the vars this app defines
//      itself in index.css `@theme` (accent-500, fg-muted), whose stock values
//      equal the fallback hexes below. Tailwind v4's default palette vars
//      compute to wide-gamut oklch() values that do NOT match the sRGB hues
//      these charts have always rendered (v4 `--color-amber-400` ≈ #ffb900 vs
//      #fbbf24, and likewise for every other palette tone), so reading them
//      would recolor every chart in the stock theme;
//   3. the hardcoded hex — the stock look, and the jsdom/SSR-ish fallback.
//
// Resolved values are cached per tone and invalidated on `themechange`.

import { DEFAULT_ACCENT } from "../../../lib/accent";
import type { Tone } from "../tones";

interface ToneSource {
  cssVar: string;
  fallback: string;
  /** Also read the stylesheet-computed value — only for vars the app's own
      `@theme` defines with exactly `fallback` (see resolution order above). */
  stylesheet: boolean;
}

const TONE_SOURCE: Record<Tone, ToneSource> = {
  accent: { cssVar: "--color-accent-500", fallback: DEFAULT_ACCENT, stylesheet: true },
  amber: { cssVar: "--color-amber-400", fallback: "#fbbf24", stylesheet: false },
  sky: { cssVar: "--color-sky-400", fallback: "#38bdf8", stylesheet: false },
  emerald: { cssVar: "--color-emerald-500", fallback: "#10b981", stylesheet: false },
  rose: { cssVar: "--color-rose-500", fallback: "#f43f5e", stylesheet: false },
  purple: { cssVar: "--color-purple-500", fallback: "#a855f7", stylesheet: false },
  orange: { cssVar: "--color-orange-500", fallback: "#f97316", stylesheet: false },
  cyan: { cssVar: "--color-cyan-400", fallback: "#22d3ee", stylesheet: false },
  neutral: { cssVar: "--color-fg-muted", fallback: "#6b7387", stylesheet: true },
};

const resolved = new Map<Tone, string>();
let themeVersion = 0;

function readVar(cssVar: string, stylesheet: boolean): string {
  if (typeof document === "undefined") return "";
  const root = document.documentElement;
  const inline = root.style.getPropertyValue(cssVar).trim();
  if (inline) return inline;
  if (!stylesheet) return "";
  return getComputedStyle(root).getPropertyValue(cssVar).trim();
}

export function chartHex(tone: Tone): string {
  const cached = resolved.get(tone);
  if (cached !== undefined) return cached;
  const { cssVar, fallback, stylesheet } = TONE_SOURCE[tone];
  const value = readVar(cssVar, stylesheet) || fallback;
  resolved.set(tone, value);
  return value;
}

/** Resolve a chart color prop pair: explicit `color` wins over `tone`. */
export function resolveChartColor(color: string | undefined, tone: Tone | undefined): string {
  return color ?? chartHex(tone ?? "accent");
}

/** Monotonic counter bumped on every `themechange` — see `useThemeVersion`. */
export function getThemeVersion(): number {
  return themeVersion;
}

/** Subscribe to `themechange` (useSyncExternalStore-shaped; returns cleanup). */
export function subscribeToThemeChange(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("themechange", onChange);
  return () => window.removeEventListener("themechange", onChange);
}

function handleThemeChange(): void {
  resolved.clear();
  themeVersion += 1;
}

// Module-level invalidation listener, registered at import time — before any
// component subscription, so by dispatch order the cache is already cleared
// when subscribers re-render. Vite HMR re-evaluates this module without
// unloading the old copy; dispose the old listener so they don't stack.
//
// CONTRACT with the personalization engine:
//   - "themechange" is the event name it dispatches on `window` after every
//     apply. Renaming it there must rename it here (and in
//     `subscribeToThemeChange` above) or charts go stale.
//   - Overrides are written as inline style on `document.documentElement`
//     (`setProperty`). Stylesheet-injected overrides are honored only for the
//     app-defined vars (accent, fg-muted) — see the resolution order above.
//   - Override values must be self-contained color literals (hex / rgb() /
//     oklch()), never `var()` or color-mix() expressions: charts write them
//     into SVG stroke/fill presentation attributes, where CSS substitution
//     does not happen.
if (typeof window !== "undefined") {
  window.addEventListener("themechange", handleThemeChange);
  import.meta.hot?.dispose(() => window.removeEventListener("themechange", handleThemeChange));
}
