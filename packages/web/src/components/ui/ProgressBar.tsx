import type { CSSProperties } from "react";
import { cn } from "../../lib/cn";
import type { CoreTone } from "./tones";

// ── ProgressBar ──────────────────────────────────────────────────────────
//
// The one horizontal meter. Seven hand-rolled tracks used to exist at four
// geometries (h-1.5 / h-2, rounded / rounded-full, surface-800 / white-alpha);
// this is the single track + fill, with the value on the ARIA progressbar
// contract so the number is readable, not just visible.
//
//   value   0..1 — the filled fraction.
//   extent  0..1 — an optional outer segment behind the fill (a host's share
//                  of all nights, with the attended share filled inside it).
//   tone    a system tone for the fill, or `color` for a computed one (the
//                  performance green→red, a game's accent var).

export type ProgressBarSize = "sm" | "md";
export type ProgressBarTone = CoreTone | "neutral";

type ProgressBarProps = {
  value: number;
  extent?: number;
  tone?: ProgressBarTone;
  /** Any CSS color; wins over `tone`. */
  color?: string;
  size?: ProgressBarSize;
  /** Accessible name ("Attendance", "Rated games"). */
  label: string;
  /** Animate width changes (off for bars that render once). */
  animate?: boolean;
  className?: string;
};

const SIZES: Record<ProgressBarSize, string> = { sm: "h-1.5", md: "h-2" };

const FILLS: Record<ProgressBarTone, string> = {
  accent: "bg-accent-500",
  amber: "bg-amber-400",
  sky: "bg-sky-400",
  emerald: "bg-emerald-500",
  rose: "bg-rose-500",
  neutral: "bg-fg-muted",
};

function pct(n: number): string {
  return `${Math.round(Math.min(1, Math.max(0, n)) * 100)}%`;
}

export function ProgressBar({
  value,
  extent,
  tone = "accent",
  color,
  size = "sm",
  label,
  animate = true,
  className,
}: ProgressBarProps) {
  const fillStyle: CSSProperties = { width: pct(value) };
  if (color) fillStyle.backgroundColor = color;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(Math.min(1, Math.max(0, value)) * 100)}
      className={cn(
        "relative w-full overflow-hidden rounded-full bg-surface-800",
        SIZES[size],
        className,
      )}
    >
      {extent !== undefined && (
        <div
          aria-hidden="true"
          className="absolute inset-y-0 left-0 rounded-full bg-fill-strong"
          style={{ width: pct(extent) }}
        />
      )}
      <div
        className={cn(
          "absolute inset-y-0 left-0 rounded-full",
          !color && FILLS[tone],
          animate && "transition-[width] duration-500",
        )}
        style={fillStyle}
      />
    </div>
  );
}
