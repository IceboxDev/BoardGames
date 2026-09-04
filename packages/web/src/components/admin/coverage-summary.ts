import type { Coverage } from "../../pages/admin-coverage";

// The coverage number and its two prose forms, in one place. They used to be
// three: AdminPage's row sort divided `(can + maybe) / total` inline, the pie
// rounded a *sum of two separately-divided* percentages, and the tooltip built
// its own sentence. The first two disagreed at the .5 boundary — with a 40-day
// window, 23 marked days rendered as 57% or 58% depending on how they split
// between can and maybe, while the sort treated both as an exact tie.
//
// `coverage-summary` is deliberately a plain module, not an export tacked onto
// CoverageCell.tsx: a non-component export there breaks that file's React Fast
// Refresh and trips Biome's `useComponentExportOnlyModules`.

/** Copy for a user whose editable window is empty. */
export const NO_EDITABLE_DAYS = "No editable days";

/**
 * Share of the editable window this user has weighed in on, 0–1. This is the
 * SORT key — full precision, no rounding, so two different splits of the same
 * marked-day count compare equal.
 */
export function coverageRatio({ can, maybe, total }: Coverage): number {
  return total > 0 ? (can + maybe) / total : 0;
}

/**
 * `coverageRatio` as a whole percent, 0–100 — the number the pie labels.
 * Integer-first (`(can + maybe) * 100 / total`) so it rounds the true ratio:
 * summing two separately-divided percentages lands on 57.49999999999999 for a
 * value that is exactly 57.5. Clamped, since `Coverage` alone does not
 * guarantee `can + maybe <= total`.
 */
export function coveragePercent({ can, maybe, total }: Coverage): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round(((can + maybe) * 100) / total)));
}

/** The pie's tooltip — the full three-bucket breakdown. */
export function coverageBreakdown({ can, maybe, total }: Coverage): string {
  if (total <= 0) return NO_EDITABLE_DAYS;
  return `${can} can · ${maybe} maybe · ${total - can - maybe} unmarked of ${total} editable days`;
}

/**
 * Spoken form for the pie's button label. The pie itself is `aria-hidden` and
 * its breakdown lives in a `title`, so this is the only route to the data for
 * assistive tech — it carries the denominator too, since "3 can" means nothing
 * without knowing whether the window is 10 days or 42.
 */
export function coverageSpeech(coverage: Coverage): string {
  const { can, maybe, total } = coverage;
  if (total <= 0) return NO_EDITABLE_DAYS;
  return `${coveragePercent(coverage)}% covered (${can} can, ${maybe} maybe of ${total} editable days)`;
}
