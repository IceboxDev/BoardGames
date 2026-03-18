import { computeCareerStats, computePercentile, computeSkillProfile } from "../logic/analytics";
import { formatTime } from "../logic/metrics";
import type { GameRecord } from "../logic/types";
import BarChartH from "./charts/BarChartH";
import RadarChart from "./charts/RadarChart";

interface GameDetailModalProps {
  record: GameRecord;
  history: GameRecord[];
  onClose: () => void;
}

interface MetricDisplay {
  label: string;
  key: keyof GameRecord;
  value: string;
  lowerIsBetter?: boolean;
}

const STAT_TIPS: Record<string, string> = {
  Rating:
    "Composite score (0-100) weighting throughput, accuracy, consistency, board reading, and anticipation",
  Throughput: "SETs found per minute — your overall solving speed",
  "Avg Find Time": "Average time to spot and complete a SET (reaction + selection)",
  Accuracy: "Percentage of SET calls that were correct (SETs / total calls)",
  Consistency: "Standard deviation of find times — lower means more consistent pace",
  "Fastest SET": "Your quickest SET from spotting to completing selection",
  "Longest Streak": "Longest run of correct SET calls without a penalty",
  "Avg Board Size":
    "Average number of cards visible when you called SET — lower means sharper scanning",
  "SETs Found": "Number of valid SETs you identified during the game",
  Penalties: "Wrong SET calls + failed +3 attempts + hint costs (3 each)",
  "+3 Requests": "Times you requested 3 extra cards when no SET was visible",
  "Early Calls": "SETs called while cards were still being dealt (anticipation)",
  Fatigue:
    "Difference in avg find time between first and second half — positive means slowing down",
  "Cards Left": "Cards remaining in the deck when the game ended",
};

function percentileLabel(p: number): string {
  if (p >= 90) return "Top 10%";
  if (p >= 75) return "Top 25%";
  if (p >= 50) return "Top 50%";
  return `Bottom ${100 - p}%`;
}

function percentileColor(p: number): string {
  if (p >= 90) return "text-yellow-400";
  if (p >= 75) return "text-green-400";
  if (p >= 50) return "text-blue-400";
  return "text-gray-500";
}

export default function GameDetailModal({ record, history, onClose }: GameDetailModalProps) {
  const career = computeCareerStats(history);

  const gameProfile = computeSkillProfile([record]);
  const careerProfile = computeSkillProfile(history.slice(-10));

  const metrics: MetricDisplay[] = [
    { label: "Rating", key: "rating", value: String(record.rating) },
    { label: "Throughput", key: "throughput", value: `${record.throughput}/min` },
    {
      label: "Avg Find Time",
      key: "avgFindTimeMs",
      value: formatTime(record.avgFindTimeMs),
      lowerIsBetter: true,
    },
    { label: "Accuracy", key: "accuracy", value: `${record.accuracy}%` },
    {
      label: "Consistency",
      key: "consistencyMs",
      value: `${(record.consistencyMs / 1000).toFixed(1)}s`,
      lowerIsBetter: true,
    },
    {
      label: "Fastest SET",
      key: "fastestSetMs",
      value: formatTime(record.fastestSetMs),
      lowerIsBetter: true,
    },
    { label: "Longest Streak", key: "longestStreak", value: String(record.longestStreak) },
    {
      label: "Avg Board Size",
      key: "avgBoardSize",
      value: String(record.avgBoardSize),
      lowerIsBetter: true,
    },
  ];

  const bars = record.perSetDetails.map((psr, i) => ({
    label: `#${i + 1}`,
    segments: [
      { value: psr.reactionTimeMs, color: "#818cf8", label: "Reaction" },
      { value: psr.selectionTimeMs, color: "#fb923c", label: "Selection" },
    ],
    annotation: String(psr.boardSize),
  }));

  return (
    // biome-ignore lint/a11y/useSemanticElements: overlay backdrop, button would affect layout
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) {
          e.preventDefault();
          onClose();
        }
      }}
      role="button"
      tabIndex={0}
      aria-label="Close modal"
    >
      <div className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-gray-900 p-6 shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 text-gray-500 hover:text-white text-xl leading-none"
        >
          ×
        </button>

        <div className="mb-4 text-center">
          <p className="text-xs text-gray-500 uppercase tracking-widest">
            {new Date(record.timestamp).toLocaleDateString()} &middot;{" "}
            {formatTime(record.durationMs)}
          </p>
          <p className="text-4xl font-extrabold text-white mt-1">{record.rating}</p>
          <p className="text-sm text-gray-400">Rating</p>
        </div>

        {/* Stats grid with percentile + delta */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-6">
          {metrics.map((m) => {
            const numVal = record[m.key] as number;
            const pct = computePercentile(history, numVal, m.key as any, m.lowerIsBetter);
            const avg = career[
              m.key === "rating"
                ? "avgRating"
                : m.key === "throughput"
                  ? "avgThroughput"
                  : m.key === "avgFindTimeMs"
                    ? "avgFindTimeMs"
                    : "avgRating"
            ] as number;
            const isTime = m.key.includes("Ms") || m.key.includes("Time");
            const diff = numVal - avg;
            const absDiff = Math.abs(diff);
            const better = m.lowerIsBetter ? diff < 0 : diff > 0;
            const sign = diff > 0 ? "+" : "";
            const diffStr = isTime
              ? `${sign}${(diff / 1000).toFixed(1)}s`
              : `${sign}${absDiff < 1 ? diff.toFixed(2) : diff.toFixed(1)}`;
            const diffColor =
              absDiff < 0.01 ? "text-gray-600" : better ? "text-green-400" : "text-red-400";

            return (
              <div
                key={m.key}
                className="rounded-lg bg-gray-800 p-2 text-center"
                title={STAT_TIPS[m.label]}
              >
                <p className="text-xs text-gray-500 cursor-help">{m.label}</p>
                <p className="text-lg font-bold text-white">{m.value}</p>
                <div className="flex items-center justify-center gap-2 mt-0.5">
                  <span className={`text-xs font-semibold ${percentileColor(pct)}`}>
                    {percentileLabel(pct)}
                  </span>
                </div>
                <p className={`text-xs ${diffColor}`}>
                  {absDiff < 0.01 ? "= avg" : `${diffStr} vs avg`}
                </p>
              </div>
            );
          })}
        </div>

        {/* Mini Skill Radar */}
        <div className="flex flex-col items-center mb-6">
          <h4 className="text-xs text-gray-500 uppercase tracking-wide mb-1">
            Skill Profile (this game vs career)
          </h4>
          <RadarChart profile={gameProfile} previousProfile={careerProfile} size={200} />
          <div className="flex gap-4 mt-1 text-xs text-gray-600">
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-0.5 bg-indigo-400 rounded" /> This game
            </span>
            <span className="flex items-center gap-1">
              <span
                className="inline-block w-3 h-0.5 bg-gray-400 rounded"
                style={{ borderTop: "1px dashed" }}
              />{" "}
              Career (last 10)
            </span>
          </div>
        </div>

        {/* Per-SET Timeline */}
        {bars.length > 1 && (
          <div className="mb-6">
            <h4 className="text-xs text-gray-500 uppercase tracking-wide mb-2">
              Per-SET Timeline (reaction + selection)
            </h4>
            <BarChartH bars={bars} />
            <div className="flex gap-4 mt-2 text-xs text-gray-600 justify-end">
              <span className="flex items-center gap-1">
                <span
                  className="inline-block w-3 h-2 rounded"
                  style={{ backgroundColor: "#818cf8" }}
                />{" "}
                Reaction
              </span>
              <span className="flex items-center gap-1">
                <span
                  className="inline-block w-3 h-2 rounded"
                  style={{ backgroundColor: "#fb923c" }}
                />{" "}
                Selection
              </span>
              <span className="text-gray-700">Board size annotated</span>
            </div>
          </div>
        )}

        {/* Find time bar chart */}
        {record.perSetDetails.length > 1 && (
          <div className="mb-6">
            <h4 className="text-xs text-gray-500 uppercase tracking-wide mb-2">
              Find Time per SET
            </h4>
            <div className="flex items-end gap-1 h-20">
              {record.perSetDetails.map((psr, i) => {
                const max = Math.max(...record.perSetDetails.map((r) => r.totalFindTimeMs));
                const h = max > 0 ? (psr.totalFindTimeMs / max) * 100 : 0;
                return (
                  <div
                    // biome-ignore lint/suspicious/noArrayIndexKey: static list / chart data points don't reorder
                    key={i}
                    className="flex-1 rounded-t bg-indigo-500"
                    style={{ height: `${h}%`, minWidth: "4px" }}
                    title={`SET ${i + 1}: ${(psr.totalFindTimeMs / 1000).toFixed(1)}s`}
                  />
                );
              })}
            </div>
          </div>
        )}

        {/* Extra stats */}
        <div className="grid grid-cols-3 gap-2 text-center text-sm mb-4">
          <div className="rounded-lg bg-gray-800 p-2" title={STAT_TIPS["SETs Found"]}>
            <p className="text-xs text-gray-500 cursor-help">SETs Found</p>
            <p className="font-bold text-white">{record.setsFound}</p>
          </div>
          <div className="rounded-lg bg-gray-800 p-2" title={STAT_TIPS.Penalties}>
            <p className="text-xs text-gray-500 cursor-help">Penalties</p>
            <p className="font-bold text-white">{record.incorrectCalls}</p>
          </div>
          <div className="rounded-lg bg-gray-800 p-2" title={STAT_TIPS["+3 Requests"]}>
            <p className="text-xs text-gray-500 cursor-help">+3 Requests</p>
            <p className="font-bold text-white">{record.plusThreeRequests}</p>
          </div>
          <div className="rounded-lg bg-gray-800 p-2" title={STAT_TIPS["Early Calls"]}>
            <p className="text-xs text-gray-500 cursor-help">Early Calls</p>
            <p className="font-bold text-white">
              {record.earlyCallCount} ({Math.round(record.earlyCallRate * 100)}%)
            </p>
          </div>
          <div className="rounded-lg bg-gray-800 p-2" title={STAT_TIPS.Fatigue}>
            <p className="text-xs text-gray-500 cursor-help">Fatigue</p>
            <p className="font-bold text-white">
              {record.fatigueSlopeMs > 0 ? "+" : ""}
              {(record.fatigueSlopeMs / 1000).toFixed(1)}s
            </p>
          </div>
          <div className="rounded-lg bg-gray-800 p-2" title={STAT_TIPS["Cards Left"]}>
            <p className="text-xs text-gray-500 cursor-help">Cards Left</p>
            <p className="font-bold text-white">{record.cardsRemaining}</p>
          </div>
        </div>

        <div className="flex justify-center">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-gray-700 px-6 py-2 text-sm font-semibold text-white hover:bg-gray-600 transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
