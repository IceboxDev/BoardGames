import type { ReactNode } from "react";

// Display-only status pill — the "Host" / "You" / "Maybe" / "Dungeon Master" /
// "Ready" / "AI" micro-labels. Distinct from `Chip` (which is an interactive
// toggle): a Badge never takes a click, is always uppercase, and sits at the
// micro type scale on the shared `tracking-pill` token.
//
// Two shapes, because the app used both and they are not interchangeable:
//   rounded — the default, a soft-cornered tag (game counts, "You").
//   pill    — fully-round, for person/status pills in attendee + party rows.
//
// `ring` adds a hairline outline in the tone's hue, for pills that must read as
// advisory rather than decorative ("Hasn't RSVP'd yet").
//
// Tones mirror the rest of the design system so a Badge and a Chip at the same
// tone match. The text ramp deliberately sits at -200/-300 (not -400): these
// pills always sit on a dark, low-opacity fill of their own hue.

export type BadgeTone = "accent" | "amber" | "emerald" | "rose" | "sky" | "neutral";

type BadgeProps = {
  tone?: BadgeTone;
  /** Optional leading glyph/icon. */
  icon?: ReactNode;
  size?: "xs" | "sm";
  shape?: "rounded" | "pill";
  /** Hairline outline in the tone's hue. */
  ring?: boolean;
  /** Tooltip text — pills often carry the "why" behind a terse label. */
  title?: string;
  className?: string;
  children: ReactNode;
};

const TONE: Record<BadgeTone, string> = {
  accent: "bg-accent-500/15 text-accent-300",
  amber: "bg-amber-400/20 text-amber-200",
  emerald: "bg-emerald-500/15 text-emerald-300",
  rose: "bg-rose-500/15 text-rose-300",
  sky: "bg-sky-400/15 text-sky-200",
  neutral: "bg-white/[0.06] text-fg-secondary",
};

const RING: Record<BadgeTone, string> = {
  accent: "ring-1 ring-accent-400/40",
  amber: "ring-1 ring-amber-400/60",
  emerald: "ring-1 ring-emerald-400/40",
  rose: "ring-1 ring-rose-400/40",
  sky: "ring-1 ring-sky-400/40",
  neutral: "ring-1 ring-white/10",
};

const SIZES = {
  xs: "px-1.5 py-0.5 text-3xs",
  sm: "px-2 py-0.5 text-2xs",
};

const SHAPES = {
  rounded: "rounded",
  pill: "rounded-full",
};

export function Badge({
  tone = "neutral",
  icon,
  size = "xs",
  shape = "rounded",
  ring = false,
  title,
  className = "",
  children,
}: BadgeProps) {
  const cls = [
    "inline-flex shrink-0 items-center gap-1 font-semibold uppercase tracking-pill",
    TONE[tone],
    SIZES[size],
    SHAPES[shape],
    ring ? RING[tone] : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <span title={title} className={cls}>
      {icon}
      {children}
    </span>
  );
}
