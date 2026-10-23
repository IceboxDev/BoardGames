import type { DomainTone } from "../../domains";

// The timeline's domain inks. A pin takes its domain's tone, solid when the
// answer is known and a hollow ring while it is still being learned; an
// interval is a translucent bar in the gutter. Palette classes (not raw
// colours), so the theme engine reaches them like every other tone surface.

export const DOT_FILL: Record<DomainTone, string> = {
  accent: "border-accent-400 bg-accent-400",
  amber: "border-amber-400 bg-amber-400",
  sky: "border-sky-400 bg-sky-400",
  emerald: "border-emerald-400 bg-emerald-400",
  rose: "border-rose-400 bg-rose-400",
  purple: "border-purple-400 bg-purple-400",
  orange: "border-orange-400 bg-orange-400",
  cyan: "border-cyan-400 bg-cyan-400",
};

export const DOT_RING: Record<DomainTone, string> = {
  accent: "border-accent-400 bg-surface-950",
  amber: "border-amber-400 bg-surface-950",
  sky: "border-sky-400 bg-surface-950",
  emerald: "border-emerald-400 bg-surface-950",
  rose: "border-rose-400 bg-surface-950",
  purple: "border-purple-400 bg-surface-950",
  orange: "border-orange-400 bg-surface-950",
  cyan: "border-cyan-400 bg-surface-950",
};

export const BAR: Record<DomainTone, string> = {
  accent: "bg-accent-400/45",
  amber: "bg-amber-400/45",
  sky: "bg-sky-400/45",
  emerald: "bg-emerald-400/45",
  rose: "bg-rose-400/45",
  purple: "bg-purple-400/45",
  orange: "bg-orange-400/45",
  cyan: "bg-cyan-400/45",
};

export const BAR_ACTIVE: Record<DomainTone, string> = {
  accent: "bg-accent-300",
  amber: "bg-amber-300",
  sky: "bg-sky-300",
  emerald: "bg-emerald-300",
  rose: "bg-rose-300",
  purple: "bg-purple-300",
  orange: "bg-orange-300",
  cyan: "bg-cyan-300",
};

export const CARD_EDGE: Record<DomainTone, string> = {
  accent: "border-l-accent-400",
  amber: "border-l-amber-400",
  sky: "border-l-sky-400",
  emerald: "border-l-emerald-400",
  rose: "border-l-rose-400",
  purple: "border-l-purple-400",
  orange: "border-l-orange-400",
  cyan: "border-l-cyan-400",
};

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
