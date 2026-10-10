import type { Color } from "@boardgames/core/games/chess/engine/types";
import type { ClockView } from "@boardgames/core/games/chess/schemas";
import { cn } from "../../../lib/cn";
import { formatClock } from "../logic/moves";
import { LOW_TIME_MS, useClockMs } from "../logic/useClockMs";

export function ClockDisplay({
  clock,
  color,
  className,
}: {
  clock: ClockView | null;
  color: Color;
  className?: string;
}) {
  const ms = useClockMs(clock, color);
  if (ms === null) return null;
  const running = clock?.running === color;
  const low = ms < LOW_TIME_MS;
  return (
    <div
      role="timer"
      aria-label={`${color === "w" ? "White" : "Black"} clock ${formatClock(ms)}`}
      className={cn(
        "min-w-20 rounded-ui-md px-3 py-1 text-center font-mono text-xl font-semibold tabular-nums",
        running ? "bg-fill-strong text-fg-strong ring-1 ring-line-strong" : "bg-fill text-fg-muted",
        running && low && "bg-rose-500/25 text-rose-200 ring-rose-400/60",
        className,
      )}
    >
      {formatClock(ms)}
    </div>
  );
}
