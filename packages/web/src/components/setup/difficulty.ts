// ── Difficulty tiers ─────────────────────────────────────────────────────
//
// The single difficulty→color table for AI strategy pickers. This exact
// map used to be copy-pasted into six game SetupScreens ({Easy → #22c55e /
// green badge}, …) and had already drifted (sky-team's Medium badge was
// text-amber-300 while everyone else's was -400). Strategy options now name
// a tier; the accent hex (stripe bar + difficulty stars) and the badge
// recipe are derived here.
//
// The hexes are raw because they feed SVG fills and `style` stripes — not
// Tailwind classes — and are difficulty semantics, not theme surface tokens.

export type DifficultyTier = "Easy" | "Medium" | "Hard" | "Hard+" | "Expert";

type DifficultyStyle = {
  /** Stripe/star color for the option card. */
  accentColor: string;
  /** Classes for the small difficulty pill (`ring-1 ring-inset` applied by the pill). */
  badgeClass: string;
};

export const DIFFICULTY: Record<DifficultyTier, DifficultyStyle> = {
  Easy: {
    accentColor: "#22c55e",
    badgeClass: "bg-green-500/15 text-green-400 ring-green-500/30",
  },
  Medium: {
    accentColor: "#f59e0b",
    badgeClass: "bg-amber-500/15 text-amber-400 ring-amber-500/30",
  },
  Hard: {
    // rose (the app's danger hue), not Tailwind red — the pre-extraction
    // copies used red-*, one more drift the shared table retires.
    accentColor: "#f43f5e",
    badgeClass: "bg-rose-500/15 text-rose-400 ring-rose-500/30",
  },
  "Hard+": {
    accentColor: "#a855f7",
    badgeClass: "bg-violet-500/15 text-violet-300 ring-violet-500/30",
  },
  Expert: {
    accentColor: "#a855f7",
    badgeClass: "bg-violet-500/15 text-violet-300 ring-violet-500/30",
  },
};
