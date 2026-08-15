import { useEffect, useState } from "react";

// Countdown pill for the optional 30s clue timer. The view carries an
// absolute deadline timestamp (it survives reconnection), so remaining time
// is always derived, never accumulated.

export function ClueTimer({ deadlineTs }: { deadlineTs: number }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(interval);
  }, []);

  const remaining = Math.max(0, Math.ceil((deadlineTs - now) / 1000));
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold tabular-nums ${
        remaining <= 10 ? "bg-rose-500/15 text-rose-300" : "bg-amber-500/15 text-amber-300"
      }`}
    >
      ⏱ {remaining}s
    </span>
  );
}
