import {
  computeCareerStats,
  computeRollingAverages,
  computeSkillProfile,
  computeTrend,
  generateInsights,
  type Insight,
  type NumericKey,
  type TrendDirection,
} from "@boardgames/core/games/set/analytics";
import { formatTime } from "@boardgames/core/games/set/metrics";
import type { GameRecord } from "@boardgames/core/games/set/types";
import { useMemo, useState } from "react";
import LineChart from "./charts/LineChart";
import RadarChart from "./charts/RadarChart";
import Sparkline from "./charts/Sparkline";

interface ProgressDashboardProps {
  history: GameRecord[];
}

const TREND_CONFIGS: {
  key: keyof GameRecord & string;
  label: string;
  higherIsBetter: boolean;
  format: (v: number) => string;
}[] = [
  { key: "rating", label: "Rating", higherIsBetter: true, format: (v) => v.toFixed(0) },
  {
    key: "throughput",
    label: "Throughput",
    higherIsBetter: true,
    format: (v) => `${v.toFixed(1)}/min`,
  },
  {
    key: "avgFindTimeMs",
    label: "Avg Find Time",
    higherIsBetter: false,
    format: (v) => formatTime(v),
  },
  { key: "accuracy", label: "Accuracy", higherIsBetter: true, format: (v) => `${v.toFixed(0)}%` },
  {
    key: "consistencyMs",
    label: "Consistency",
    higherIsBetter: false,
    format: (v) => `${(v / 1000).toFixed(1)}s`,
  },
  {
    key: "earlyCallRate",
    label: "Anticipation",
    higherIsBetter: true,
    format: (v) => `${(v * 100).toFixed(0)}%`,
  },
];

const CHART_TABS = [
  { key: "rating", label: "Rating", higherIsBetter: true },
  { key: "throughput", label: "Speed", higherIsBetter: true },
  { key: "accuracy", label: "Accuracy", higherIsBetter: true },
  { key: "consistencyMs", label: "Consistency", higherIsBetter: false },
] as const;

function trendArrow(dir: TrendDirection) {
  if (dir === "improving") return "↑";
  if (dir === "declining") return "↓";
  return "→";
}

function trendColor(dir: TrendDirection) {
  if (dir === "improving") return "text-green-400";
  if (dir === "declining") return "text-red-400";
  return "text-gray-500";
}

function sparklineColor(dir: TrendDirection) {
  if (dir === "improving") return "#4ade80";
  if (dir === "declining") return "#f87171";
  return "#818cf8";
}

function insightIcon(type: Insight["type"]) {
  switch (type) {
    case "improvement":
      return "📈";
    case "decline":
      return "📉";
    case "achievement":
      return "🏆";
    case "milestone":
      return "🎯";
    case "tip":
      return "💡";
  }
}

export default function ProgressDashboard({ history }: ProgressDashboardProps) {
  const [chartTab, setChartTab] = useState<string>("rating");

  const sorted = useMemo(() => [...history].sort((a, b) => a.timestamp - b.timestamp), [history]);

  const currentProfile = useMemo(() => computeSkillProfile(sorted.slice(-5)), [sorted]);

  const previousProfile = useMemo(
    () => (sorted.length >= 10 ? computeSkillProfile(sorted.slice(-10, -5)) : undefined),
    [sorted],
  );

  const career = useMemo(() => computeCareerStats(history), [history]);

  const insights = useMemo(() => generateInsights(history), [history]);

  const trends = useMemo(
    () =>
      TREND_CONFIGS.map((cfg) => ({
        ...cfg,
        trend: computeTrend(history, cfg.key as NumericKey, 5, cfg.higherIsBetter),
        sparkData: sorted.slice(-20).map((r) => r[cfg.key as keyof GameRecord] as number),
      })),
    [history, sorted],
  );

  const activeChart = CHART_TABS.find((t) => t.key === chartTab) ?? CHART_TABS[0];
  const chartData = useMemo(
    () =>
      sorted.map((r, i) => ({
        x: i,
        y: r[activeChart.key as keyof GameRecord] as number,
        label: new Date(r.timestamp).toLocaleDateString(),
      })),
    [sorted, activeChart.key],
  );
  const rollingAvg = useMemo(() => {
    const raw = computeRollingAverages(history, activeChart.key as NumericKey, 5);
    return raw.map((p) => ({ x: p.gameIndex, y: p.value }));
  }, [history, activeChart.key]);

  if (history.length === 0) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-500">
        Play some games to see your progress.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Section A: Skill Radar + Career Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl bg-gray-800/60 p-4 flex flex-col items-center">
          <h3 className="text-sm font-semibold text-gray-300 mb-2">Skill Profile (last 5 games)</h3>
          <RadarChart profile={currentProfile} previousProfile={previousProfile} size={220} />
          {previousProfile && (
            <p className="text-xs text-gray-600 mt-1">Dashed line = previous 5 games</p>
          )}
        </div>

        <div className="rounded-xl bg-gray-800/60 p-4">
          <h3 className="text-sm font-semibold text-gray-300 mb-3">Career Summary</h3>
          <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-sm">
            <Stat label="Games Played" value={String(career.totalGames)} />
            <Stat label="Total SETs" value={String(career.totalSets)} />
            <Stat label="Play Time" value={formatTime(career.totalTimeMs)} />
            <Stat label="Avg Accuracy" value={`${career.overallAccuracy}%`} />
            <Stat label="Avg Rating" value={String(career.avgRating)} />
            <Stat label="Best Rating" value={String(career.bestRating)} />
            <Stat label="Avg Throughput" value={`${career.avgThroughput}/min`} />
            <Stat label="Best Throughput" value={career.bestThroughput.toFixed(2)} />
            <Stat label="Avg Find Time" value={formatTime(career.avgFindTimeMs)} />
            <Stat label="Best Find Time" value={formatTime(career.bestFindTimeMs)} />
            <Stat label="Total Penalties" value={String(career.totalPenalties)} />
            <Stat label="Hints Used" value={String(career.totalHints)} />
          </div>
        </div>
      </div>

      {/* Section B: Trend Cards */}
      <div>
        <h3 className="text-sm font-semibold text-gray-300 mb-2">Trends (last 10 games)</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
          {trends.map((t) => (
            <div
              key={t.key}
              className="rounded-lg bg-gray-800/60 p-3 flex flex-col items-center gap-1"
            >
              <span className="text-xs text-gray-500">{t.label}</span>
              <span className="text-sm font-bold text-gray-200">{t.format(t.trend.recentAvg)}</span>
              <Sparkline
                data={t.sparkData}
                width={100}
                height={28}
                color={sparklineColor(t.trend.direction)}
                invertY={!t.higherIsBetter}
              />
              <span className={`text-xs font-semibold ${trendColor(t.trend.direction)}`}>
                {trendArrow(t.trend.direction)} {Math.abs(t.trend.changePercent).toFixed(0)}%
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Section C: Insights */}
      {insights.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-300 mb-2">Insights</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {insights.map((ins, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: static list / chart data points don't reorder
              <div key={i} className="flex items-start gap-2 rounded-lg bg-gray-800/60 p-3">
                <span className="text-lg leading-none">{insightIcon(ins.type)}</span>
                <div>
                  <p className="text-sm font-semibold text-gray-200">{ins.title}</p>
                  <p className="text-xs text-gray-500">{ins.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Section D: Full Progression Charts */}
      <div>
        <h3 className="text-sm font-semibold text-gray-300 mb-2">Progression</h3>
        <div className="flex gap-1 mb-3">
          {CHART_TABS.map((tab) => (
            <button
              type="button"
              key={tab.key}
              onClick={() => setChartTab(tab.key)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                chartTab === tab.key
                  ? "bg-indigo-600 text-white"
                  : "bg-gray-800 text-gray-400 hover:bg-gray-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="rounded-xl bg-gray-800/60 p-4 overflow-x-auto">
          <LineChart
            data={chartData}
            rollingAvgData={rollingAvg}
            yLabel={activeChart.label}
            invertY={!activeChart.higherIsBetter}
            height={220}
          />
          <div className="flex items-center gap-4 mt-2 text-xs text-gray-600 justify-end">
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-0.5 bg-indigo-400 rounded" /> Per game
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-0.5 bg-amber-400 rounded border-dashed" /> Rolling
              avg (5)
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-gray-500 text-xs">{label}</span>
      <p className="text-gray-200 font-medium tabular-nums">{value}</p>
    </div>
  );
}
