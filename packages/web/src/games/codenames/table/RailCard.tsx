import type { ReactNode } from "react";
import { Surface } from "../../../components/ui";
import { cn } from "../../../lib/cn";

// The rail's panels (a team, the mission's agents, the timer): one chrome on
// `Surface`, raised while it is that side's turn (with a bar in its colour),
// or tinted as a warning (Duet's sudden death).

export function RailCard({
  active = false,
  accentBg,
  warn = false,
  className,
  children,
}: {
  active?: boolean;
  /** The active bar's colour class (a team's `bg-cn-red`). */
  accentBg?: string;
  warn?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Surface
      as="section"
      variant="tile"
      radius="lg"
      className={cn(
        "relative overflow-hidden bg-fill-soft transition-colors",
        active && "border-line-strong bg-fill",
        warn && "border-amber-400/40 bg-amber-500/10",
        className,
      )}
    >
      {active && accentBg && (
        <span aria-hidden className={cn("absolute inset-y-0 left-0 w-1", accentBg)} />
      )}
      {children}
    </Surface>
  );
}

/** A rail card's headline: what it counts (left) and the number (right). */
export function RailStat({
  label,
  value,
  unit,
  size = "lg",
}: {
  label: ReactNode;
  value: ReactNode;
  /** After the number, small ("/ 15", "to find"). */
  unit?: ReactNode;
  size?: "lg" | "sm";
}) {
  return (
    <div className="flex items-start justify-between gap-2">
      <div className="flex min-w-0 flex-col">{label}</div>
      <span className="flex shrink-0 items-baseline gap-1">
        <span
          className={cn(
            "font-black tabular-nums text-fg-strong",
            size === "lg" ? "text-3xl leading-none" : "text-sm",
          )}
        >
          {value}
        </span>
        {unit !== undefined && <span className="text-3xs text-fg-muted">{unit}</span>}
      </span>
    </div>
  );
}
