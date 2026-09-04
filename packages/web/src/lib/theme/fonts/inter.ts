// Default body font. No `load` thunk: Inter Variable is already imported
// eagerly in src/main.tsx, so it is available before the theme engine runs.
// `stack` mirrors --font-body in packages/web/src/index.css — keep the two in
// sync (fonts.test.ts asserts they match).
//
// display = also suitable for --font-display; all fonts are body-eligible.
export default {
  key: "inter",
  label: "Inter",
  stack: '"Inter Variable", "Inter", sans-serif',
  display: true,
} as const;
