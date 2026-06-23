import type { ReactNode, Ref } from "react";

// Toggle / picker chip primitive. The single source of truth for the
// "pressed / unpressed" pill-or-rect chip pattern that appears in every
// match-history form, the RecordMatchModal kind picker, the
// ParticipantPicker user pills, the GameVariantPicker tags, the team
// winner toggles, the role chips, and the AdminPage delete-mode toggle.
//
// The active state is colored by `tone` so a row of mixed-tone chips
// (village/wolf/tanner) stays consistent; the inactive state is always
// neutral. `variant="filled"` (default) uses the surface-800 inactive
// background; `variant="outlined"` keeps a border-only inactive look,
// useful for VotedOutChip-style "additive" pickers where the inactive
// state should read as "not yet selected" rather than "available
// option".
//
// `ring` toggles whether the active state adds a ring outline (most chips
// do; some — TeamButton in WerewolfForm — opt out for a flatter feel).

export type ChipTone = "accent" | "amber" | "emerald" | "rose" | "sky";

type Variant = "filled" | "outlined";
type Size = "xs" | "sm" | "md";
type Shape = "rounded" | "pill" | "square";

type Props = {
  pressed: boolean;
  tone?: ChipTone;
  variant?: Variant;
  size?: Size;
  shape?: Shape;
  /** Drop the active-state ring outline. Defaults to `true`. */
  ring?: boolean;
  /** Optional leading icon / glyph (e.g. flag, X, +). */
  icon?: ReactNode;
  /** Block-width — stretch to fill the parent. */
  block?: boolean;
  /** Native tooltip on hover. */
  title?: string;
  /** Native disabled handling. */
  disabled?: boolean;
  /** Optional aria-label override (use when `children` is a glyph alone). */
  "aria-label"?: string;
  onClick?: () => void;
  /** When set, renders as `<span aria-disabled>` instead of `<button>` — used by status pills that look like chips but aren't actionable. */
  asStatic?: boolean;
  children: ReactNode;
  ref?: Ref<HTMLButtonElement>;
  className?: string;
};

const BASE =
  "inline-flex items-center justify-center gap-1 font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40 disabled:cursor-not-allowed disabled:opacity-40";

const SIZES: Record<Size, string> = {
  xs: "px-2 py-0.5 text-2xs",
  sm: "px-2.5 py-1 text-xs",
  md: "px-3 py-1.5 text-sm",
};

const SHAPES: Record<Shape, string> = {
  rounded: "rounded-md",
  pill: "rounded-full",
  // Square corners — abutting chips inside a segmented group (e.g. the
  // WerewolfForm team picker) where rounded inner corners would break the row.
  square: "rounded-none",
};

// Active background + text per tone. Mirrors SegmentedControl's TONE_*
// maps so a Chip and a SegmentedControl option at the same tone read
// identically.
const TONE_ACTIVE_BG: Record<ChipTone, string> = {
  accent: "bg-accent-500/20 text-accent-100",
  amber: "bg-amber-500/20 text-amber-200",
  emerald: "bg-emerald-500/20 text-emerald-100",
  rose: "bg-rose-500/20 text-rose-100",
  sky: "bg-sky-400/20 text-sky-100",
};

const TONE_ACTIVE_RING: Record<ChipTone, string> = {
  accent: "ring-1 ring-accent-400/40",
  amber: "ring-1 ring-amber-400/40",
  emerald: "ring-1 ring-emerald-400/40",
  rose: "ring-1 ring-rose-400/60",
  sky: "ring-1 ring-sky-300/40",
};

// Outlined "active" uses a colored border instead of a tinted background
// — slightly subtler look. Used for "additive" pickers where rows of
// chips should not be filled when checked.
const TONE_ACTIVE_BORDER: Record<ChipTone, string> = {
  accent: "border border-accent-400/50 bg-accent-500/15 text-accent-100",
  amber: "border border-amber-400/50 bg-amber-500/15 text-amber-200",
  emerald: "border border-emerald-400/50 bg-emerald-500/15 text-emerald-100",
  rose: "border border-rose-400/60 bg-rose-500/15 text-rose-100",
  sky: "border border-sky-300/50 bg-sky-400/15 text-sky-100",
};

const INACTIVE_FILLED =
  "bg-surface-800 text-fg-secondary hover:bg-surface-700 hover:text-fg-primary";

const INACTIVE_OUTLINED =
  "border border-white/10 bg-surface-900 text-fg-secondary hover:border-white/25 hover:text-fg-primary";

export function Chip({
  pressed,
  tone = "accent",
  variant = "filled",
  size = "sm",
  shape = "rounded",
  ring = true,
  icon,
  block = false,
  title,
  disabled,
  onClick,
  asStatic = false,
  children,
  ref,
  className = "",
  ...aria
}: Props) {
  const activeCls =
    variant === "outlined"
      ? TONE_ACTIVE_BORDER[tone]
      : `${TONE_ACTIVE_BG[tone]}${ring ? ` ${TONE_ACTIVE_RING[tone]}` : ""}`;
  const inactiveCls = variant === "outlined" ? INACTIVE_OUTLINED : INACTIVE_FILLED;
  const cls = [
    BASE,
    SIZES[size],
    SHAPES[shape],
    pressed ? activeCls : inactiveCls,
    block ? "w-full" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  if (asStatic) {
    return (
      // Non-interactive status pill. `role="status"` makes the aria-label
      // accept on a `<span>` (it would otherwise be flagged because
      // span-by-default doesn't take labels).
      <span
        role="status"
        className={cls}
        aria-disabled={disabled}
        title={title}
        aria-label={aria["aria-label"]}
      >
        {icon}
        {children}
      </span>
    );
  }
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-pressed={pressed}
      aria-label={aria["aria-label"]}
      className={cls}
    >
      {icon}
      {children}
    </button>
  );
}
