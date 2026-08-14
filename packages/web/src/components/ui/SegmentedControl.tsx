import type { ReactNode } from "react";
import { cn } from "../../lib/cn";
import { type CoreTone, TONE_ACTIVE, TONE_GLOW, TONE_RING_STRONG } from "./tones";

// ── SegmentedControl ─────────────────────────────────────────────────────
//
// Horizontal tab/toggle strip with a unified track. One primitive for every
// "pick one of N" control where the inactive options sit inside a shared
// container — sign-in/up tabs, Pick/Results/Attendees view tabs, the
// Going/Not-going switch, the 2/3/4-player picker.
//
// Visual axes:
//   shape    "pill"     rounded-full track + rounded-full options.
//            "rounded"  rounded-lg track + rounded-md options.
//   size     "xs" / "sm" / "md" — padding + text size.
//   fullWidth Stretch options to equal width. Defaults: pill=false, rounded=true.
//
// Behavior axes:
//   tone           Active-state tint (shared `CoreTone`; the fill is the
//                  identical recipe Chip uses). Per-option via `option.tone`.
//   selectionMode  "tabs"   role=tablist + role=tab + aria-selected. Use when
//                           each option swaps a panel of content.
//                  "toggle" aria-pressed on each option. Use when the control
//                           sets a value (Going / Not going, 3 / 4 players).
//   emphasizeActive Ring + glow on the active option, for high-emphasis
//                   switches (RSVP yes/no).
//
// Not in scope: "choice chip" grids where every option has its own opaque
// background even when inactive (e.g. the RecordMatchModal match-kind picker).
// That's a different visual contract and needs a separate primitive.

export type SegmentedTone = CoreTone;

export type SegmentedOption<T extends string | number> = {
  value: T;
  label: ReactNode;
  /** Optional leading content (icon, glyph). */
  icon?: ReactNode;
  /** Native tooltip on hover. */
  title?: string;
  /** Per-option active tint. Overrides the group's `tone`. */
  tone?: CoreTone;
};

type Shape = "pill" | "rounded";

type SegmentedControlProps<T extends string | number> = {
  options: ReadonlyArray<SegmentedOption<T>>;
  value: T;
  onChange: (next: T) => void;

  shape?: Shape;
  size?: "xs" | "sm" | "md";
  /** Stretch each option to equal width. Defaults: false for "pill", true for "rounded". */
  fullWidth?: boolean;
  /** Default tone for options without `option.tone`. Defaults to "accent". */
  tone?: CoreTone;

  selectionMode?: "tabs" | "toggle";
  /** Add ring + glow to the active option. */
  emphasizeActive?: boolean;

  /** Accessible label for the group. Required for "tabs" without a visible header. */
  "aria-label"?: string;
  disabled?: boolean;
  className?: string;
};

const TRACK_SHAPE: Record<Shape, string> = {
  pill: "rounded-full border border-white/10 bg-surface-950/60 p-0.5 gap-0.5",
  rounded: "rounded-lg border border-white/10 bg-surface-800 p-1",
};

const OPTION_SHAPE: Record<Shape, string> = {
  pill: "rounded-full",
  rounded: "rounded-md",
};

const OPTION_SIZE: Record<"xs" | "sm" | "md", string> = {
  // xs is for in-row table density (e.g. the admin users-table online-mode
  // picker) — same tight padding at every viewport, no breakpoint expansion
  // up to sm/md sizes that would push the cell out of bounds.
  xs: "px-1.5 py-0.5 text-3xs font-semibold",
  // sm starts tight on phone so view-tabs + a sibling switch (e.g. RSVP
  // Going/Not going) fit on one row even on a ~330px CSS viewport (Galaxy
  // A13 with slight zoom). Two breakpoints: ultra-tight default, mid at
  // 420px, full padding at sm:.
  sm: "px-1.5 py-1 text-2xs font-semibold xs2:px-2 sm:px-3 sm:py-1.5 sm:text-xs",
  md: "px-3 py-1.5 text-sm font-medium",
};

const INACTIVE = "text-fg-secondary hover:text-white";

export function SegmentedControl<T extends string | number>({
  options,
  value,
  onChange,
  shape = "pill",
  size = "md",
  fullWidth,
  tone: groupTone = "accent",
  selectionMode = "tabs",
  emphasizeActive = false,
  "aria-label": ariaLabel,
  disabled = false,
  className,
}: SegmentedControlProps<T>) {
  const stretch = fullWidth ?? shape === "rounded";
  const isTabs = selectionMode === "tabs";

  const trackCls = cn(
    stretch ? "flex w-full" : "inline-flex",
    "items-center",
    TRACK_SHAPE[shape],
    className,
  );

  // Bundle role + aria-* per mode so the lint rule sees a single, stable role
  // for each branch rather than a union.
  const trackAria = isTabs
    ? { role: "tablist" as const, "aria-label": ariaLabel }
    : { role: "group" as const, "aria-label": ariaLabel };

  return (
    <div className={trackCls} {...trackAria}>
      {options.map((opt) => {
        const isActive = opt.value === value;
        const optTone = opt.tone ?? groupTone;
        const activeCls = isActive
          ? cn(
              TONE_ACTIVE[optTone],
              emphasizeActive && TONE_RING_STRONG[optTone],
              emphasizeActive && TONE_GLOW[optTone],
            )
          : INACTIVE;
        const optionCls = cn(
          "inline-flex items-center justify-center gap-1 transition",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40",
          "disabled:cursor-not-allowed disabled:opacity-50",
          OPTION_SHAPE[shape],
          OPTION_SIZE[size],
          stretch && "flex-1",
          activeCls,
        );
        const optionAria = isTabs
          ? { role: "tab" as const, "aria-selected": isActive }
          : { "aria-pressed": isActive };
        return (
          <button
            key={String(opt.value)}
            type="button"
            disabled={disabled}
            title={opt.title}
            onClick={() => {
              if (opt.value !== value) onChange(opt.value);
            }}
            className={optionCls}
            {...optionAria}
          >
            {opt.icon}
            <span>{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
