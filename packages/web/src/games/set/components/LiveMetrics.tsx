import { formatTime } from "@boardgames/core/games/set/metrics";
import type { PerSetRecord } from "@boardgames/core/games/set/types";

interface LiveMetricsProps {
  perSetRecords: PerSetRecord[];
  gameStartTime: number;
  score: number;
  earlyCallCount: number;
}

export default function LiveMetrics({
  perSetRecords,
  gameStartTime,
  score,
  earlyCallCount,
}: LiveMetricsProps) {
  if (perSetRecords.length === 0) return null;

  const findTimes = perSetRecords.map((r) => r.totalFindTimeMs);
  const avg = findTimes.reduce((a, b) => a + b, 0) / findTimes.length;
  const fastest = Math.min(...findTimes);
  const elapsed = Date.now() - gameStartTime;
  const throughput = elapsed > 0 ? (score / elapsed) * 60000 : 0;

  const stats = [
    { label: "Avg", value: formatTime(avg) },
    { label: "Fast", value: formatTime(fastest) },
    { label: "Rate", value: `${throughput.toFixed(1)}/m` },
    { label: "Early", value: String(earlyCallCount) },
  ];

  return (
    <div className="flex flex-col gap-1.5 border-t border-gray-800 pt-3">
      {stats.map((s) => (
        <div key={s.label} className="flex items-baseline justify-between gap-2">
          <span className="text-xs text-gray-600 uppercase tracking-wide">{s.label}</span>
          <span className="font-mono text-sm font-semibold text-gray-400">{s.value}</span>
        </div>
      ))}
    </div>
  );
}
