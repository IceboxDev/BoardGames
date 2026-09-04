// Monospace option. Weights 400/500/700 are already imported eagerly in
// src/main.tsx; the `load` thunk adds the 600/800 faces that font-semibold and
// font-extrabold sites need once the whole UI renders in the mono family.
// JetBrains Mono ships no 900, so font-black clamps to the 800 face.
// `stack` mirrors --font-mono in packages/web/src/index.css — keep the two in
// sync (fonts.test.ts asserts they match).
//
// display = also suitable for --font-display; all fonts are body-eligible by
// design — display: false only excludes this font from the display slot, and
// today nothing uses a `font-display` utility (headings inherit the body
// family), so it still reaches headings when chosen for --font-body.
let loaded: Promise<unknown> | undefined;

export default {
  key: "jetbrains",
  label: "JetBrains Mono",
  stack: '"JetBrains Mono", monospace',
  display: false,
  // The first call's promise is cached: Vite's preload helper marks a dep
  // "seen" before its stylesheet finishes loading, so an uncached second call
  // could resolve early while the CSS is still in flight.
  load: () =>
    (loaded ??= Promise.all([
      import("@fontsource/jetbrains-mono/600.css"),
      import("@fontsource/jetbrains-mono/800.css"),
    ])),
} as const;
