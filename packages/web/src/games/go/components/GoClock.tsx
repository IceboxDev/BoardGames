import type { Color } from "@boardgames/core/games/go/types";
import type { GoClockView } from "@boardgames/core/games/go/view";
import { clockFace } from "@boardgames/core/machines/clock";
import { useEffect, useState } from "react";
import { cn } from "../../../lib/cn";

function fmt(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * One side's clock face. The server's view says how far into the running
 * turn it was; this counts on from when the view arrived.
 */
export default function GoClock({ clock, color }: { clock: GoClockView; color: Color }) {
  const running = clock.running === color;
  const [arrivedAt, setArrivedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new view restarts the count
  useEffect(() => {
    const t = Date.now();
    setArrivedAt(t);
    setNow(t);
  }, [clock]);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [running]);
  const elapsed = running ? clock.elapsedMs + (now - arrivedAt) : 0;
  const face = clockFace(clock.timeControl, clock.clocks[color], elapsed);
  const low = running && face.showMs < 10_000;
  return (
    <div
      role="timer"
      className={cn(
        "flex items-baseline gap-1.5 font-mono tabular-nums",
        running ? "text-fg-strong" : "text-fg-muted",
        low && "animate-pulse text-rose-400",
      )}
      aria-label={`${color === 0 ? "Black" : "White"} clock ${fmt(face.showMs)}`}
    >
      <span className="text-lg font-semibold">{fmt(face.showMs)}</span>
      {clock.timeControl.kind === "byoyomi" &&
        (face.inOvertime || clock.clocks[color].mainMs === 0) && (
          <span className="text-xs">×{face.periodsLeft}</span>
        )}
    </div>
  );
}
