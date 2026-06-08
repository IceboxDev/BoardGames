import type { ReactNode } from "react";

// Display-only status pill — the "Host" / "You" / "Ready" / "AI" micro-labels.
// Distinct from `Chip` (which is an interactive toggle): a Badge never takes a
// click, is always uppercase, and sits at the micro type scale. Tones mirror
// the rest of the design system so a Badge and a Chip at the same tone match.

export type BadgeTone = "accent" | "amber" | "emerald" | "rose" | "sky" | "neutral";

type BadgeProps = {
  tone?: BadgeTone;
  /** Optional leading glyph/icon. */
  icon?: ReactNode;
  size?: "xs" | "sm";
  className?: string;
  children: ReactNode;
};

const TONE: Record<BadgeTone, string> = {
  accent: "bg-accent-500/15 text-accent-300",
  amber: "bg-amber-500/15 text-amber-400",
  emerald: "bg-emerald-500/15 text-emerald-400",
  rose: "bg-rose-500/15 text-rose-300",
  sky: "bg-sky-500/15 text-sky-300",
  neutral: "bg-surface-700 text-fg-secondary",
};

const SIZES = {
  xs: "px-1.5 py-0.5 text-3xs",
  sm: "px-2 py-0.5 text-2xs",
};

export function Badge({
  tone = "neutral",
  icon,
  size = "xs",
  className = "",
  children,
}: BadgeProps) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded font-semibold uppercase tracking-wide ${TONE[tone]} ${SIZES[size]} ${className}`}
    >
      {icon}
      {children}
    </span>
  );
}
