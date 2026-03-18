import { formatTime } from "../logic/metrics";
import type { PerSetRecord } from "../logic/types";

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
    { label: "Avg Find", value: formatTime(avg) },
    { label: "Fastest", value: formatTime(fastest) },
    { label: "Throughput", value: `${throughput.toFixed(1)}/min` },
    { label: "Early Calls", value: String(earlyCallCount) },
  ];

  return (
    <div className="flex flex-wrap gap-4 rounded-xl bg-gray-900/60 px-4 py-3 text-xs">
      {stats.map((s) => (
        <div key={s.label} className="text-center">
          <p className="text-gray-500 uppercase tracking-wide">{s.label}</p>
          <p className="font-mono font-semibold text-gray-300">{s.value}</p>
        </div>
      ))}
    </div>
  );
}
