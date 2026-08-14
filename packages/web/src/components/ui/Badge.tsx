import type { ReactNode } from "react";
import { cn } from "../../lib/cn";
import { TONE_BUBBLE, TONE_RING, type Tone } from "./tones";

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
// Tones come from the shared `Tone` vocabulary (`tones.ts`) so a Badge and a
// Chip at the same tone match by construction. Sizes mirror Chip's xs/sm/md so
// a Badge can sit beside a Chip at any density.

export type BadgeTone = Tone;

type BadgeProps = {
  tone?: Tone;
  /** Optional leading glyph/icon. */
  icon?: ReactNode;
  size?: "xs" | "sm" | "md";
  shape?: "rounded" | "pill";
  /** Hairline outline in the tone's hue. */
  ring?: boolean;
  /** Tooltip text — pills often carry the "why" behind a terse label. */
  title?: string;
  className?: string;
  children: ReactNode;
};

const SIZES = {
  xs: "px-1.5 py-0.5 text-3xs",
  sm: "px-2 py-0.5 text-2xs",
  // md matches Chip's md height so mixed Badge/Chip rows align.
  md: "px-2.5 py-1 text-xs",
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
  className,
  children,
}: BadgeProps) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 font-semibold uppercase tracking-pill",
        TONE_BUBBLE[tone],
        SIZES[size],
        SHAPES[shape],
        ring && TONE_RING[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}
