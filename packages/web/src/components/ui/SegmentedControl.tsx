import type { ReactNode } from "react";

// ── SegmentedControl ─────────────────────────────────────────────────────
//
// Horizontal tab/toggle strip with a unified track. One primitive for every
// "pick one of N" control where the inactive options sit inside a shared
// container — sign-in/up tabs, Pick/Results/Attendees view tabs, the
// Going/Not-going switch, the 2/3/4-player picker.
//
// Visual axes:
//   shape    "pill"  rounded-full track + rounded-full options.
//            "rect"  rounded-lg track + rounded-md options.
//   size     "sm" / "md" — padding + text size.
//   fullWidth Stretch options to equal width. Defaults: pill=false, rect=true.
//
// Behavior axes:
//   tone           Active-state tint. Per-option override via `option.tone`.
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

export type SegmentedTone = "accent" | "amber" | "sky" | "emerald" | "rose";

export type SegmentedOption<T extends string | number> = {
  value: T;
  label: ReactNode;
  /** Optional leading content (icon, glyph). */
  icon?: ReactNode;
  /** Native tooltip on hover. */
  title?: string;
  /** Per-option active tint. Overrides the group's `tone`. */
  tone?: SegmentedTone;
};

type SegmentedControlProps<T extends string | number> = {
  options: ReadonlyArray<SegmentedOption<T>>;
  value: T;
  onChange: (next: T) => void;

  shape?: "pill" | "rect";
  size?: "sm" | "md";
  /** Stretch each option to equal width. Defaults: false for "pill", true for "rect". */
  fullWidth?: boolean;
  /** Default tone for options without `option.tone`. Defaults to "accent". */
  tone?: SegmentedTone;

  selectionMode?: "tabs" | "toggle";
  /** Add ring + glow to the active option. */
  emphasizeActive?: boolean;

  /** Accessible label for the group. Required for "tabs" without a visible header. */
  "aria-label"?: string;
  disabled?: boolean;
  className?: string;
};

const TRACK_SHAPE: Record<"pill" | "rect", string> = {
  pill: "rounded-full border border-white/10 bg-surface-950/60 p-0.5 gap-0.5",
  rect: "rounded-lg border border-white/10 bg-surface-800 p-1",
};

const OPTION_SHAPE: Record<"pill" | "rect", string> = {
  pill: "rounded-full",
  rect: "rounded-md",
};

const OPTION_SIZE: Record<"sm" | "md", string> = {
  // sm starts tight on phone so view-tabs + a sibling switch (e.g. RSVP
  // Going/Not going) fit on one row at ~360px, then relaxes at sm:.
  sm: "px-2 py-1 text-[11px] font-semibold sm:px-3 sm:py-1.5 sm:text-xs",
  md: "px-3 py-1.5 text-sm font-medium",
};

const TONE_ACTIVE_BG: Record<SegmentedTone, string> = {
  accent: "bg-accent-500/20",
  amber: "bg-amber-400/20",
  sky: "bg-sky-400/20",
  emerald: "bg-emerald-400/20",
  rose: "bg-rose-500/20",
};

const TONE_ACTIVE_TEXT: Record<SegmentedTone, string> = {
  accent: "text-accent-200",
  amber: "text-amber-200",
  sky: "text-sky-200",
  emerald: "text-emerald-100",
  rose: "text-rose-100",
};

const TONE_RING: Record<SegmentedTone, string> = {
  accent: "ring-1 ring-accent-400/60",
  amber: "ring-1 ring-amber-300/60",
  sky: "ring-1 ring-sky-300/60",
  emerald: "ring-1 ring-emerald-300/60",
  rose: "ring-1 ring-rose-300/60",
};

const TONE_GLOW: Record<SegmentedTone, string> = {
  accent: "shadow-[0_0_12px_-4px_rgba(99,102,241,0.5)]",
  amber: "shadow-[0_0_12px_-4px_rgba(251,191,36,0.5)]",
  sky: "shadow-[0_0_12px_-4px_rgba(56,189,248,0.5)]",
  emerald: "shadow-[0_0_12px_-4px_rgba(16,185,129,0.5)]",
  rose: "shadow-[0_0_12px_-4px_rgba(244,63,94,0.5)]",
};

const INACTIVE = "text-gray-400 hover:text-white";

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
  const stretch = fullWidth ?? shape === "rect";
  const isTabs = selectionMode === "tabs";

  const trackCls = [
    stretch ? "flex w-full" : "inline-flex",
    "items-center",
    TRACK_SHAPE[shape],
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

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
          ? [
              TONE_ACTIVE_BG[optTone],
              TONE_ACTIVE_TEXT[optTone],
              emphasizeActive ? TONE_RING[optTone] : "",
              emphasizeActive ? TONE_GLOW[optTone] : "",
            ]
              .filter(Boolean)
              .join(" ")
          : INACTIVE;
        const optionCls = [
          "inline-flex items-center justify-center gap-1 transition",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40",
          "disabled:cursor-not-allowed disabled:opacity-50",
          OPTION_SHAPE[shape],
          OPTION_SIZE[size],
          stretch ? "flex-1" : "",
          activeCls,
        ]
          .filter(Boolean)
          .join(" ");
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
