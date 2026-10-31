// Shared class strings and helpers of the Reading Room's print furniture (Paper.tsx).

/** Small caps with the eyebrow tracking: the paper's captions. */
export const KICKER = "font-news text-2xs font-semibold uppercase tracking-pill";

/** The first day of the trainer's edition count ("No. 1"). */
const FIRST_EDITION = Date.UTC(2026, 0, 1);

/** "No. 297" for the given ISO day. */
export function editionNumber(day: string): number {
  return Math.max(1, Math.floor((Date.parse(`${day}T00:00:00Z`) - FIRST_EDITION) / 86_400_000) + 1);
}

/** The newspaper's double rule, as a top or bottom border. */
export const RULE_DOUBLE_TOP = "border-t-3 border-double border-fg-primary";
export const RULE_DOUBLE_BOTTOM = "border-b-3 border-double border-fg-primary";

/** "Saturday, 24 October 2026" for the given ISO day. */
export function longDate(day: string): string {
  return new Date(`${day}T12:00:00`).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
