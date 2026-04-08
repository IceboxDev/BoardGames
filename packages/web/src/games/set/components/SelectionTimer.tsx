import { SELECTION_TIMEOUT_MS } from "@boardgames/core/games/set/pvp-machine";
import { useEffect, useState } from "react";

interface SelectionTimerProps {
  deadline: number;
}

export default function SelectionTimer({ deadline }: SelectionTimerProps) {
  const [remaining, setRemaining] = useState(() => Math.max(0, deadline - Date.now()));

  useEffect(() => {
    const tick = () => setRemaining(Math.max(0, deadline - Date.now()));
    tick();
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  }, [deadline]);

  const fraction = remaining / SELECTION_TIMEOUT_MS;
  const seconds = (remaining / 1000).toFixed(1);

  const color = fraction > 0.5 ? "bg-green-500" : fraction > 0.2 ? "bg-yellow-500" : "bg-red-500";

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 rounded-full bg-gray-700 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-100 ${color}`}
          style={{ width: `${fraction * 100}%` }}
        />
      </div>
      <span className="text-xs font-mono font-semibold text-gray-400 w-8 text-right tabular-nums">
        {seconds}
      </span>
    </div>
  );
}
