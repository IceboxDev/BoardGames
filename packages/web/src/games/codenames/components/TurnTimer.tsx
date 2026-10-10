import { useEffect, useState } from "react";
import { cn } from "../../../lib/cn";

// Countdown pill for the optional clue / guess timers. The view carries an
// absolute deadline (it survives reconnection), so the time left is always
// derived, never accumulated.

export function TurnTimer({ deadlineTs }: { deadlineTs: number }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(interval);
  }, []);

  const remaining = Math.max(0, Math.ceil((deadlineTs - now) / 1000));
  const m = Math.floor(remaining / 60);
  const s = String(remaining % 60).padStart(2, "0");
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold tabular-nums",
        remaining <= 15 ? "bg-rose-500/15 text-rose-300" : "bg-amber-500/15 text-amber-300",
      )}
    >
      ⏱ {m}:{s}
    </span>
  );
}
