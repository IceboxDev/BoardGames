// Modern geometric sans. Chosen over Space Grotesk because its variable axis
// covers 100-900 (Space Grotesk stops at 700, which would flatten the
// font-extrabold/font-black heading hierarchy the app uses). Outfit ships
// latin/latin-ext only, so non-Latin text routes through the eager Inter tier
// before the generic fallback.
//
// The fontsource CSS is imported only inside the `load` thunk so it stays out
// of the entry chunk (same rule as Cinzel, which is imported only in the D&D
// lazy chunk). The dynamic import resolves when the stylesheet lands, NOT when
// the woff2 arrives (font-display: swap still FOUTs) — after awaiting
// `load()`, the theme engine must `await document.fonts.load('1em "Outfit
// Variable"')` before flipping --font-body/--font-display.
//
// display = also suitable for --font-display; all fonts are body-eligible.
let loaded: Promise<unknown> | undefined;

export default {
  key: "outfit",
  label: "Outfit",
  stack: '"Outfit Variable", "Inter Variable", "Inter", sans-serif',
  display: true,
  // The first call's promise is cached: Vite's preload helper marks a dep
  // "seen" before its stylesheet finishes loading, so an uncached second call
  // could resolve early while the CSS is still in flight.
  load: () => (loaded ??= import("@fontsource-variable/outfit/index.css")),
} as const;
