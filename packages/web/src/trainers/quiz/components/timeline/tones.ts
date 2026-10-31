import type { CSSProperties } from "react";
import type { DomainTone } from "../../domains";

// The timeline's inks. Pins and interval bars take their section's own
// colour (`Domain.color`, a theme token); the legacy tone map below is kept
// for the study card's timeline chip until it moves to the paper look.

export const DATE_INK: Record<DomainTone, string> = {
  accent: "text-accent-300",
  amber: "text-amber-300",
  sky: "text-sky-300",
  emerald: "text-emerald-300",
  rose: "text-rose-300",
  purple: "text-purple-300",
  orange: "text-orange-300",
  cyan: "text-cyan-300",
};

/**
 * A pin in its section's own ink (`Domain.color`): solid once the answer is
 * known, a hollow ring on the paper while it is still being learned.
 */
export function inkDot(color: string, known: boolean): CSSProperties {
  return known
    ? { borderColor: color, backgroundColor: color }
    : { borderColor: color, backgroundColor: "var(--color-surface-900)" };
}
