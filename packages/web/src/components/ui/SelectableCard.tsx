import type { CSSProperties, ReactNode } from "react";
import type { SegmentedTone } from "./SegmentedControl";

// ── SelectableCard ───────────────────────────────────────────────────────
//
// The single "option as a card" primitive — the generalization of the old
// setup/OptionCard. Replaces the hand-rolled mode-select cards, lobby/setup
// option tiles, and AI-opponent / difficulty pickers that each re-implemented
// "bordered surface + hover lift + accent". Two treatments:
//
//   tile   — bordered card whose hover/selected accents come from a system
//            `tone`. Renders a structured icon/title/description layout, or
//            arbitrary `children`. `orientation` picks icon-over-title
//            (vertical) vs icon-left row (horizontal).
//   stripe — left accent-bar option row taking a raw `accentColor` (for
//            per-option game colors outside the 5 system tones) plus custom
//            `children`. This is the old OptionCard shape.
//
// Renders a real <button> only when `onClick` is set (else a <div>), via a
// dynamic element so it stays a single focusable control. Pass `selected`
// (true/false) to make it a toggle (adds aria-pressed + selected styling);
// omit it for navigation cards. Tone maps mirror SegmentedControl / Chip so a
// card and a segmented option at the same tone read identically.

export type SelectableCardPadding = "default" | "compact";

type SelectableCardProps = {
  variant?: "tile" | "stripe";
  /** System tone driving tile hover border, glow, icon tint, selected ring. */
  tone?: SegmentedTone;
  /** Raw accent (hex/css color) for the `stripe` left bar + top hover line. */
  accentColor?: string;
  orientation?: "vertical" | "horizontal";
  /** Padding density. `compact` tightens the card for dense grids / list rows. */
  padding?: SelectableCardPadding;
  icon?: ReactNode;
  title?: ReactNode;
  description?: ReactNode;
  /** Trailing slot (e.g. a chevron) for horizontal tiles. */
  trailing?: ReactNode;
  /** Toggle state. Pass true/false for selectable cards; omit for navigation. */
  selected?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  /** Entrance stagger in ms; applies the `card-fade-up` animation when set. */
  animationDelay?: number;
  /** Escape hatch — full custom body, replaces icon/title/description. */
  children?: ReactNode;
  className?: string;
  "aria-label"?: string;
};

const TILE_HOVER_BORDER: Record<SegmentedTone, string> = {
  accent: "hover:border-accent-400/50",
  amber: "hover:border-amber-400/50",
  sky: "hover:border-sky-400/50",
  emerald: "hover:border-emerald-400/50",
  rose: "hover:border-rose-400/50",
};

const TILE_HOVER_GLOW: Record<SegmentedTone, string> = {
  accent: "hover:shadow-glow-accent",
  amber: "hover:shadow-glow-amber",
  sky: "hover:shadow-glow-sky",
  emerald: "hover:shadow-glow-emerald",
  rose: "hover:shadow-glow-rose",
};

const TILE_SELECTED: Record<SegmentedTone, string> = {
  accent: "border-accent-400/60 bg-surface-800/80 ring-1 ring-accent-400/40",
  amber: "border-amber-400/60 bg-surface-800/80 ring-1 ring-amber-400/40",
  sky: "border-sky-400/60 bg-surface-800/80 ring-1 ring-sky-400/40",
  emerald: "border-emerald-400/60 bg-surface-800/80 ring-1 ring-emerald-400/40",
  rose: "border-rose-400/60 bg-surface-800/80 ring-1 ring-rose-400/40",
};

// Always-tinted icon tile (vertical tiles).
const TILE_ICON: Record<SegmentedTone, string> = {
  accent: "bg-accent-500/10 text-accent-300 group-hover:bg-accent-500/20",
  amber: "bg-amber-500/10 text-amber-300 group-hover:bg-amber-500/20",
  sky: "bg-sky-500/10 text-sky-300 group-hover:bg-sky-500/20",
  emerald: "bg-emerald-500/10 text-emerald-300 group-hover:bg-emerald-500/20",
  rose: "bg-rose-500/10 text-rose-300 group-hover:bg-rose-500/20",
};

// Neutral-until-hover icon tint (horizontal rows).
const TILE_ICON_HOVER: Record<SegmentedTone, string> = {
  accent: "group-hover:bg-accent-500/10 group-hover:text-accent-300",
  amber: "group-hover:bg-amber-500/10 group-hover:text-amber-300",
  sky: "group-hover:bg-sky-500/10 group-hover:text-sky-300",
  emerald: "group-hover:bg-emerald-500/10 group-hover:text-emerald-300",
  rose: "group-hover:bg-rose-500/10 group-hover:text-rose-300",
};

const TILE_TITLE_HOVER: Record<SegmentedTone, string> = {
  accent: "group-hover:text-accent-200",
  amber: "group-hover:text-amber-200",
  sky: "group-hover:text-sky-200",
  emerald: "group-hover:text-emerald-200",
  rose: "group-hover:text-rose-200",
};

export function SelectableCard({
  variant = "tile",
  tone = "accent",
  accentColor,
  orientation = "vertical",
  padding = "default",
  icon,
  title,
  description,
  trailing,
  selected,
  onClick,
  disabled,
  animationDelay,
  children,
  className = "",
  "aria-label": ariaLabel,
}: SelectableCardProps) {
  const Component = onClick ? "button" : "div";
  const isToggle = selected !== undefined;
  const animated = animationDelay !== undefined;

  // Padding lives here (not in caller `className`) so call sites never need an
  // `!important` to beat the default px/py. `compact` is orientation-aware.
  const pad =
    variant === "stripe"
      ? padding === "compact"
        ? orientation === "horizontal"
          ? "px-4 py-2.5"
          : "px-2 py-3 sm:px-4 sm:py-5"
        : "px-5 py-5"
      : orientation === "horizontal"
        ? padding === "compact"
          ? "px-3 py-2.5"
          : "px-5 py-3.5"
        : padding === "compact"
          ? "px-3 py-4"
          : "px-6 py-8";

  const style: CSSProperties = {};
  if (variant === "stripe" && accentColor) {
    style.borderLeftWidth = "3px";
    style.borderLeftColor = accentColor;
  }
  if (animated) style.animationDelay = `${animationDelay}ms`;

  // Structured body (skipped when `children` is supplied).
  const body =
    children ??
    (orientation === "horizontal" ? (
      <>
        {icon && (
          <div
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-700/40 text-fg-secondary transition-colors ${TILE_ICON_HOVER[tone]}`}
          >
            {icon}
          </div>
        )}
        <div className="min-w-0 flex-1">
          {title && (
            <div className="text-sm font-medium text-fg-secondary transition-colors group-hover:text-white">
              {title}
            </div>
          )}
          {description && <p className="mt-0.5 text-2xs text-fg-muted">{description}</p>}
        </div>
        {trailing && (
          <div className="shrink-0 text-fg-disabled transition-all group-hover:translate-x-0.5 group-hover:text-fg-muted">
            {trailing}
          </div>
        )}
      </>
    ) : (
      <>
        {icon && (
          <div
            className={`flex h-14 w-14 items-center justify-center rounded-2xl transition-colors duration-300 ${TILE_ICON[tone]}`}
          >
            {icon}
          </div>
        )}
        <div>
          {title && (
            <div
              className={`text-base font-semibold text-white transition-colors ${TILE_TITLE_HOVER[tone]}`}
            >
              {title}
            </div>
          )}
          {description && (
            <p className="mt-1.5 text-xs leading-relaxed text-fg-muted">{description}</p>
          )}
        </div>
      </>
    ));

  let cls: string;
  if (variant === "stripe") {
    cls = [
      `group relative flex overflow-hidden rounded-xl border bg-surface-800/50 ${pad} text-left transition-all duration-200`,
      orientation === "horizontal" ? "items-center gap-3" : "flex-col",
      isToggle && selected
        ? "border-white/20 bg-surface-800/80 shadow-lg"
        : "border-surface-600/80 hover:-translate-y-0.5 hover:bg-surface-800/80 hover:shadow-lg hover:shadow-black/20",
      animated ? "animate-card-fade-up" : "",
      onClick ? "disabled:pointer-events-none disabled:opacity-50" : "",
      className,
    ]
      .filter(Boolean)
      .join(" ");
  } else if (orientation === "horizontal") {
    cls = [
      `group flex items-center gap-3 rounded-xl border bg-surface-800/30 ${pad} text-left transition-all duration-200 hover:bg-surface-800/60`,
      isToggle && selected ? TILE_SELECTED[tone] : `border-white/10 ${TILE_HOVER_BORDER[tone]}`,
      animated ? "animate-card-fade-up" : "",
      onClick ? "disabled:pointer-events-none disabled:opacity-50" : "",
      className,
    ]
      .filter(Boolean)
      .join(" ");
  } else {
    cls = [
      `group flex flex-col items-center gap-4 rounded-2xl border bg-surface-800/40 ${pad} text-center shadow-lg shadow-transparent transition-all duration-300 hover:-translate-y-1 hover:bg-surface-800/70 hover:shadow-xl`,
      isToggle && selected
        ? TILE_SELECTED[tone]
        : `border-white/10 ${TILE_HOVER_BORDER[tone]} ${TILE_HOVER_GLOW[tone]}`,
      animated ? "animate-card-fade-up" : "",
      onClick ? "disabled:pointer-events-none disabled:opacity-50" : "",
      className,
    ]
      .filter(Boolean)
      .join(" ");
  }

  return (
    <Component
      type={onClick ? "button" : undefined}
      onClick={onClick}
      disabled={onClick ? disabled : undefined}
      aria-pressed={onClick && isToggle ? selected : undefined}
      aria-label={ariaLabel}
      className={cls}
      style={Object.keys(style).length > 0 ? style : undefined}
    >
      {variant === "stripe" && accentColor && (
        <span
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-px opacity-0 transition-opacity group-hover:opacity-100"
          style={{ backgroundColor: accentColor }}
        />
      )}
      {body}
    </Component>
  );
}
