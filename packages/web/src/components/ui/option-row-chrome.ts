// ── Option-row chrome ────────────────────────────────────────────────────
//
// The shared recipe for "a selectable list row": CheckRow (a real checkbox
// behind the row) and SelectableCard's `row` variant (a button that picks
// one). Four inventory lists and a picker had each spelled the selected pair
// `border-accent-400/50 bg-accent-500/10` by hand with three different idle
// treatments; the pair lives here once so a row is a row.

export const OPTION_ROW_BASE =
  "flex cursor-pointer items-center rounded-card-lg border text-left transition";

/** The chosen row — the same accent pair in every list. */
export const OPTION_ROW_SELECTED = "border-accent-400/50 bg-accent-500/10";

/** An unchosen row on a bordered list (checkbox lists). */
export const OPTION_ROW_IDLE = "border-line bg-surface-800/50 hover:border-line-strong";

/** An unchosen row on a flat list (single-pick pickers). */
export const OPTION_ROW_GHOST = "border-transparent hover:bg-fill-soft";
