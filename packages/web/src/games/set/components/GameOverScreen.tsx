import {
  computeCareerStats,
  computeSkillProfile,
  getGameRank,
} from "@boardgames/core/games/set/analytics";
import { formatTime } from "@boardgames/core/games/set/metrics";
import type { GameRecord } from "@boardgames/core/games/set/types";
import { useMemo } from "react";
import { GameOverLayout } from "../../../components/game-over";
import { computePersonalBests } from "../logic/persistence";
import RadarChart from "./charts/RadarChart";

interface GameOverScreenProps {
  record: GameRecord;
  history: GameRecord[];
  onPlayAgain: () => void;
  onViewHighScores: () => void;
}

const STAT_TIPS: Record<string, string> = {
  Duration: "Total time from first card dealt to last SET found",
  "SETs Found": "Number of valid SETs you identified during the game",
  Penalties: "Wrong SET calls + failed +3 attempts + hint costs (3 each)",
  "Net Score": "SETs found minus penalties — your adjusted score",
  Accuracy: "Percentage of SET calls that were correct (SETs / total calls)",
  "Avg Find Time": "Average time to spot and complete a SET (reaction + selection)",
  "Median Find": "Middle value of all find times — less affected by outliers than average",
  "Fastest SET": "Your quickest SET from spotting to completing selection",
  "Slowest SET": "Your longest SET — may indicate a difficult board or fatigue",
  Consistency: "Standard deviation of find times — lower means more consistent pace",
  Throughput: "SETs found per minute — your overall solving speed",
  "1st SET": "Time to find your first SET — reflects warm-up speed",
  "Early Calls": "SETs called while cards were still being dealt",
  "Early Rate": "Percentage of SETs that were called during dealing (anticipation)",
  "Avg Board": "Average number of cards visible when you called SET — lower means sharper scanning",
  "+3 Requests": "Times you requested 3 extra cards when no SET was visible",
  "Hints Used": "Hints used (each costs 3 penalties) — a last resort when stuck",
  "Best Streak": "Longest run of correct SET calls without a penalty",
  Fatigue:
    "Difference in avg find time between first and second half — positive means slowing down",
  "Cards Left": "Cards remaining in the deck when the game ended",
};

function StatCell({ label, value, best }: { label: string; value: string; best?: boolean }) {
  return (
    <div
      className="rounded-lg bg-surface-800 p-3 text-center group relative"
      title={STAT_TIPS[label]}
    >
      <p className="text-xs text-gray-500 uppercase tracking-wide cursor-help">{label}</p>
      <p className={`mt-1 text-lg font-bold ${best ? "text-yellow-400" : "text-white"}`}>
        {value}
        {best && " ★"}
      </p>
    </div>
  );
}

interface ComparisonMetric {
  label: string;
  value: number;
  avg: number;
  format: (v: number) => string;
  lowerIsBetter?: boolean;
}

export default function GameOverScreen({
  record,
  history,
  onPlayAgain,
  onViewHighScores,
}: GameOverScreenProps) {
  const bests = useMemo(() => computePersonalBests(history), [history]);

  const career = useMemo(() => computeCareerStats(history), [history]);
  const rank = useMemo(
    () => (history.length > 0 ? getGameRank(history, record) : null),
    [history, record],
  );

  const gameProfile = useMemo(() => computeSkillProfile([record]), [record]);
  const careerProfile = useMemo(
    () => (history.length >= 2 ? computeSkillProfile(history.slice(-10)) : undefined),
    [history],
  );

  const comparisons: ComparisonMetric[] = useMemo(() => {
    if (history.length < 2) return [];
    return [
      {
        label: "Throughput",
        value: record.throughput,
        avg: career.avgThroughput,
        format: (v) => `${v.toFixed(2)}/min`,
      },
      {
        label: "Avg Find Time",
        value: record.avgFindTimeMs,
        avg: career.avgFindTimeMs,
        format: (v) => formatTime(v),
        lowerIsBetter: true,
      },
      { label: "Rating", value: record.rating, avg: career.avgRating, format: (v) => v.toFixed(0) },
      {
        label: "Accuracy",
        value: record.accuracy,
        avg: career.overallAccuracy,
        format: (v) => `${v.toFixed(0)}%`,
      },
    ];
  }, [record, career, history.length]);

  const isBest = (key: string, value: number, lower = false) => {
    const b = bests[key];
    if (b === undefined || !Number.isFinite(b)) return false;
    return lower ? value <= b : value >= b;
  };

  const findTimes = record.perSetDetails.map((r) => r.totalFindTimeMs);

  return (
    <GameOverLayout
      headline={String(record.rating)}
      headlineColor="neutral"
      subtitle={`Rating${isBest("bestRating", record.rating) ? " \u00b7 New Personal Best!" : ""}${
        rank !== null && history.length > 1 ? ` \u00b7 #${rank} of ${history.length}` : ""
      }`}
      actions={[
        { label: "Play Again", variant: "primary", onClick: onPlayAgain },
        { label: "High Scores", variant: "secondary", onClick: onViewHighScores },
      ]}
    >
      <div className="space-y-8">
        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCell label="Duration" value={formatTime(record.durationMs)} />
          <StatCell
            label="SETs Found"
            value={String(record.setsFound)}
            best={isBest("bestNetScore", record.netScore)}
          />
          <StatCell label="Penalties" value={String(record.incorrectCalls)} />
          <StatCell label="Net Score" value={String(record.netScore)} />
          <StatCell
            label="Accuracy"
            value={`${record.accuracy}%`}
            best={isBest("bestAccuracy", record.accuracy)}
          />
          <StatCell
            label="Avg Find Time"
            value={formatTime(record.avgFindTimeMs)}
            best={isBest("fastestAvgFindTime", record.avgFindTimeMs, true)}
          />
          <StatCell label="Median Find" value={formatTime(record.medianFindTimeMs)} />
          <StatCell
            label="Fastest SET"
            value={formatTime(record.fastestSetMs)}
            best={isBest("fastestSingleSet", record.fastestSetMs, true)}
          />
          <StatCell label="Slowest SET" value={formatTime(record.slowestSetMs)} />
          <StatCell label="Consistency" value={`${(record.consistencyMs / 1000).toFixed(1)}s`} />
          <StatCell
            label="Throughput"
            value={`${record.throughput}/min`}
            best={isBest("bestThroughput", record.throughput)}
          />
          <StatCell label="1st SET" value={formatTime(record.timeToFirstSetMs)} />
          <StatCell label="Early Calls" value={String(record.earlyCallCount)} />
          <StatCell label="Early Rate" value={`${Math.round(record.earlyCallRate * 100)}%`} />
          <StatCell label="Avg Board" value={String(record.avgBoardSize)} />
          <StatCell label="+3 Requests" value={String(record.plusThreeRequests)} />
          {record.hintCount > 0 && <StatCell label="Hints Used" value={String(record.hintCount)} />}
          <StatCell
            label="Best Streak"
            value={String(record.longestStreak)}
            best={isBest("longestStreak", record.longestStreak)}
          />
          <StatCell
            label="Fatigue"
            value={`${record.fatigueSlopeMs > 0 ? "+" : ""}${(record.fatigueSlopeMs / 1000).toFixed(1)}s`}
          />
          <StatCell label="Cards Left" value={String(record.cardsRemaining)} />
        </div>

        {/* vs. Your Average */}
        {comparisons.length > 0 && (
          <div>
            <p className="mb-2 text-xs uppercase tracking-wide text-gray-500">vs. Your Average</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {comparisons.map((c) => {
                const diff = c.value - c.avg;
                const absDiff = Math.abs(diff);
                const better = c.lowerIsBetter ? diff < 0 : diff > 0;
                const sign = diff > 0 ? "+" : "";
                const isTime = c.label.includes("Time");
                const diffStr = isTime
                  ? `${sign}${(diff / 1000).toFixed(1)}s`
                  : `${sign}${absDiff < 1 ? diff.toFixed(2) : diff.toFixed(1)}`;
                const color =
                  absDiff < 0.01 ? "text-gray-600" : better ? "text-green-400" : "text-red-400";

                return (
                  <div key={c.label} className="rounded-lg bg-surface-800 p-3 text-center">
                    <p className="text-xs text-gray-500">{c.label}</p>
                    <p className="text-sm font-bold text-white">{c.format(c.value)}</p>
                    <p className={`text-xs font-semibold ${color}`}>
                      {absDiff < 0.01 ? "= avg" : `${diffStr} vs avg`}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Mini Skill Radar */}
        {history.length >= 2 && (
          <div className="flex flex-col items-center">
            <p className="mb-2 text-xs uppercase tracking-wide text-gray-500">
              Skill Profile (this game vs career)
            </p>
            <RadarChart profile={gameProfile} previousProfile={careerProfile} size={200} />
            <div className="flex gap-4 mt-1 text-xs text-gray-600">
              <span className="flex items-center gap-1">
                <span className="inline-block w-3 h-0.5 bg-indigo-400 rounded" /> This game
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block w-3 h-0.5 bg-gray-400 rounded" /> Career
              </span>
            </div>
          </div>
        )}

        {/* Find Time chart */}
        {findTimes.length > 1 && (
          <div>
            <p className="mb-2 text-xs uppercase tracking-wide text-gray-500">Find Time per SET</p>
            <div className="flex items-end gap-1 h-24">
              {findTimes.map((t, i) => {
                const max = Math.max(...findTimes);
                const h = max > 0 ? (t / max) * 100 : 0;
                return (
                  <div
                    // biome-ignore lint/suspicious/noArrayIndexKey: static list / chart data points don't reorder
                    key={i}
                    className="flex-1 rounded-t bg-indigo-500 transition-all"
                    style={{ height: `${h}%`, minWidth: "4px" }}
                    title={`SET ${i + 1}: ${(t / 1000).toFixed(1)}s`}
                  />
                );
              })}
            </div>
          </div>
        )}
      </div>
    </GameOverLayout>
  );
}
