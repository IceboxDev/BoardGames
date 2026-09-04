// Readable serif option. `load` pulls the normal AND italic axes — the app
// has many `italic` sites that would otherwise render synthesized oblique.
// The stack tail mirrors --font-serif-body in packages/web/src/index.css
// (ui-serif, Georgia, serif — keep in sync, fonts.test.ts asserts it). Ahead
// of it: the non-variable "Crimson Pro" tier (a locally installed static face
// catches the blocked-webfont case), then the eager Inter tier because
// Crimson Pro ships no cyrillic/greek subsets — without it a non-Latin player
// name mid-sentence would fall to the platform serif instead of the site's
// sans.
//
// The dynamic imports resolve when the stylesheets land, NOT when the woff2
// arrives (font-display: swap still FOUTs) — after awaiting `load()`, the
// theme engine must `await document.fonts.load(...)` for the normal and
// italic faces before flipping --font-body/--font-display.
//
// display = also suitable for --font-display; all fonts are body-eligible.
let loaded: Promise<unknown> | undefined;

export default {
  key: "crimson",
  label: "Crimson Pro",
  stack:
    '"Crimson Pro Variable", "Crimson Pro", "Inter Variable", "Inter", ui-serif, Georgia, serif',
  display: true,
  // The first call's promise is cached: Vite's preload helper marks a dep
  // "seen" before its stylesheet finishes loading, so an uncached second call
  // could resolve early while the CSS is still in flight.
  load: () =>
    (loaded ??= Promise.all([
      import("@fontsource-variable/crimson-pro/index.css"),
      import("@fontsource-variable/crimson-pro/wght-italic.css"),
    ])),
} as const;
