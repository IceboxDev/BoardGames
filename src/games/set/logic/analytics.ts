import type { GameRecord } from "./types";

export type TrendDirection = "improving" | "declining" | "stable";

export interface TrendResult {
  direction: TrendDirection;
  changePercent: number;
  recentAvg: number;
  previousAvg: number;
}

export interface SkillProfile {
  speed: number;
  accuracy: number;
  consistency: number;
  boardReading: number;
  anticipation: number;
}

export interface Insight {
  type: "improvement" | "decline" | "achievement" | "tip" | "milestone";
  metric: string;
  title: string;
  description: string;
}

export interface CareerStats {
  totalGames: number;
  totalSets: number;
  totalTimeMs: number;
  overallAccuracy: number;
  avgRating: number;
  bestRating: number;
  avgThroughput: number;
  bestThroughput: number;
  avgFindTimeMs: number;
  bestFindTimeMs: number;
  totalPenalties: number;
  totalHints: number;
}

type NumericKey = {
  [K in keyof GameRecord]: GameRecord[K] extends number ? K : never;
}[keyof GameRecord];

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function computeRollingAverages(
  history: GameRecord[],
  key: NumericKey,
  windowSize: number,
): { gameIndex: number; value: number }[] {
  const sorted = [...history].sort((a, b) => a.timestamp - b.timestamp);
  const result: { gameIndex: number; value: number }[] = [];
  for (let i = windowSize - 1; i < sorted.length; i++) {
    const window = sorted.slice(i - windowSize + 1, i + 1);
    const values = window.map((r) => r[key] as number);
    result.push({ gameIndex: i, value: avg(values) });
  }
  return result;
}

export function computeTrend(
  history: GameRecord[],
  key: NumericKey,
  window: number,
  higherIsBetter: boolean,
): TrendResult {
  const sorted = [...history].sort((a, b) => a.timestamp - b.timestamp);
  if (sorted.length < window * 2) {
    const all = sorted.map((r) => r[key] as number);
    const a = avg(all);
    return { direction: "stable", changePercent: 0, recentAvg: a, previousAvg: a };
  }

  const recent = sorted.slice(-window).map((r) => r[key] as number);
  const previous = sorted.slice(-window * 2, -window).map((r) => r[key] as number);
  const recentAvg = avg(recent);
  const previousAvg = avg(previous);

  if (previousAvg === 0) {
    return { direction: "stable", changePercent: 0, recentAvg, previousAvg };
  }

  const changePercent = ((recentAvg - previousAvg) / Math.abs(previousAvg)) * 100;
  const absChange = Math.abs(changePercent);

  let direction: TrendDirection = "stable";
  if (absChange > 5) {
    const improved = higherIsBetter ? recentAvg > previousAvg : recentAvg < previousAvg;
    direction = improved ? "improving" : "declining";
  }

  return {
    direction,
    changePercent: Math.round(changePercent * 10) / 10,
    recentAvg: Math.round(recentAvg * 100) / 100,
    previousAvg: Math.round(previousAvg * 100) / 100,
  };
}

export function computeSkillProfile(records: GameRecord[]): SkillProfile {
  if (records.length === 0) {
    return { speed: 0, accuracy: 0, consistency: 0, boardReading: 0, anticipation: 0 };
  }

  const avgThroughput = avg(records.map((r) => r.throughput));
  const avgFindTime = avg(records.map((r) => r.avgFindTimeMs));
  const avgAccuracy = avg(records.map((r) => r.accuracy));
  const avgConsistency = avg(records.map((r) => r.consistencyMs));
  const avgFatigue = avg(records.map((r) => Math.abs(r.fatigueSlopeMs)));
  const avgBoard = avg(records.map((r) => r.avgBoardSize));
  const avgPlusThree = avg(records.map((r) => r.plusThreeRequests));
  const avgEarlyRate = avg(records.map((r) => r.earlyCallRate));

  const speedFromThroughput = clamp((avgThroughput / 4) * 100, 0, 100);
  const speedFromFindTime = clamp(((20000 - avgFindTime) / 18000) * 100, 0, 100);
  const speed = clamp((speedFromThroughput + speedFromFindTime) / 2, 0, 100);

  const accuracy = clamp(avgAccuracy, 0, 100);

  const consistencyFromStddev = clamp(((10000 - avgConsistency) / 10000) * 100, 0, 100);
  const consistencyFromFatigue = clamp(((5000 - avgFatigue) / 5000) * 100, 0, 100);
  const consistency = clamp(consistencyFromStddev * 0.7 + consistencyFromFatigue * 0.3, 0, 100);

  const boardFromSize = clamp(((15 - avgBoard) / 3) * 100, 0, 100);
  const boardFromPlusThree = clamp(((5 - avgPlusThree) / 5) * 100, 0, 100);
  const boardReading = clamp(boardFromSize * 0.6 + boardFromPlusThree * 0.4, 0, 100);

  const anticipation = clamp(avgEarlyRate * 200, 0, 100);

  return {
    speed: Math.round(speed),
    accuracy: Math.round(accuracy),
    consistency: Math.round(consistency),
    boardReading: Math.round(boardReading),
    anticipation: Math.round(anticipation),
  };
}

export function generateInsights(history: GameRecord[]): Insight[] {
  const sorted = [...history].sort((a, b) => a.timestamp - b.timestamp);
  const insights: Insight[] = [];
  const n = sorted.length;

  if (n === 0) return insights;

  const milestones = [10, 25, 50, 100, 200, 500];
  for (const m of milestones) {
    if (n === m) {
      insights.push({
        type: "milestone",
        metric: "games",
        title: `${m} Games Played`,
        description: `You've completed ${m} games. Keep training to sharpen your pattern recognition.`,
      });
    }
  }

  const latest = sorted[n - 1];

  if (latest.accuracy === 100 && latest.setsFound > 0) {
    insights.push({
      type: "achievement",
      metric: "accuracy",
      title: "Perfect Accuracy",
      description: `Flawless game with ${latest.setsFound} SETs found and zero penalties.`,
    });
  }

  if (latest.durationMs > 0 && latest.durationMs < 300000 && latest.setsFound >= 5) {
    const isFirst = sorted.filter((r) => r.durationMs < 300000 && r.setsFound >= 5).length === 1;
    if (isFirst) {
      insights.push({
        type: "milestone",
        metric: "duration",
        title: "Speed Demon",
        description: "First game completed in under 5 minutes.",
      });
    }
  }

  const pbKeys: { key: NumericKey; label: string; lower?: boolean }[] = [
    { key: "rating", label: "Rating" },
    { key: "throughput", label: "Throughput" },
    { key: "avgFindTimeMs", label: "Avg Find Time", lower: true },
    { key: "fastestSetMs", label: "Fastest SET", lower: true },
    { key: "longestStreak", label: "Longest Streak" },
    { key: "netScore", label: "Net Score" },
  ];

  for (const { key, label, lower } of pbKeys) {
    const val = latest[key] as number;
    if (val === 0) continue;
    const others = sorted
      .slice(0, -1)
      .map((r) => r[key] as number)
      .filter((v) => v > 0);
    if (others.length === 0) continue;
    const best = lower ? Math.min(...others) : Math.max(...others);
    const isPB = lower ? val < best : val > best;
    if (isPB) {
      insights.push({
        type: "achievement",
        metric: key,
        title: `New PB: ${label}`,
        description: `You set a new personal best for ${label} in your latest game.`,
      });
    }
  }

  if (n >= 10) {
    const trendMetrics: { key: NumericKey; label: string; higher: boolean }[] = [
      { key: "throughput", label: "Speed (throughput)", higher: true },
      { key: "avgFindTimeMs", label: "Find time", higher: false },
      { key: "accuracy", label: "Accuracy", higher: true },
      { key: "consistencyMs", label: "Consistency", higher: false },
      { key: "earlyCallRate", label: "Anticipation (early calls)", higher: true },
      { key: "avgBoardSize", label: "Board reading", higher: false },
    ];

    for (const { key, label, higher } of trendMetrics) {
      const trend = computeTrend(sorted, key, 5, higher);
      if (trend.direction === "improving" && Math.abs(trend.changePercent) > 10) {
        insights.push({
          type: "improvement",
          metric: key,
          title: `${label} Improving`,
          description: `${label} improved ${Math.abs(trend.changePercent).toFixed(0)}% over your last 10 games.`,
        });
      } else if (trend.direction === "declining" && Math.abs(trend.changePercent) > 10) {
        insights.push({
          type: "decline",
          metric: key,
          title: `${label} Declining`,
          description: `${label} declined ${Math.abs(trend.changePercent).toFixed(0)}% recently. Focus on this area.`,
        });
      }
    }
  }

  if (n >= 5) {
    const recentFatigue = avg(sorted.slice(-5).map((r) => r.fatigueSlopeMs));
    if (recentFatigue > 2000) {
      insights.push({
        type: "tip",
        metric: "fatigue",
        title: "Fatigue Detected",
        description:
          "Your find times increase significantly during games. Try shorter sessions or take breaks.",
      });
    }

    const recentFirstSet = avg(sorted.slice(-5).map((r) => r.timeToFirstSetMs));
    const recentAvgFind = avg(sorted.slice(-5).map((r) => r.avgFindTimeMs));
    if (recentAvgFind > 0 && recentFirstSet > recentAvgFind * 2) {
      insights.push({
        type: "tip",
        metric: "warmup",
        title: "Slow Warm-up",
        description:
          "Your first SET typically takes 2x longer than average. Consider a quick warm-up round.",
      });
    }

    const recentAccuracy = avg(sorted.slice(-5).map((r) => r.accuracy));
    const recentThroughput = avg(sorted.slice(-5).map((r) => r.throughput));
    if (recentAccuracy > 90 && recentThroughput < 2) {
      insights.push({
        type: "tip",
        metric: "speed",
        title: "Prioritize Speed",
        description: "Your accuracy is excellent. Try calling SETs faster to improve throughput.",
      });
    }

    const recentPlusThree = avg(sorted.slice(-5).map((r) => r.plusThreeRequests));
    if (recentPlusThree > 3) {
      insights.push({
        type: "tip",
        metric: "boardReading",
        title: "Improve Board Scanning",
        description:
          "You request +3 cards frequently. Practice systematic scanning to find SETs on the existing board.",
      });
    }
  }

  return insights.slice(0, 8);
}

export function computePercentile(
  history: GameRecord[],
  value: number,
  key: NumericKey,
  lowerIsBetter = false,
): number {
  const values = history.map((r) => r[key] as number).filter((v) => v > 0);
  if (values.length === 0) return 50;
  const count = lowerIsBetter
    ? values.filter((v) => v >= value).length
    : values.filter((v) => v <= value).length;
  return Math.round((count / values.length) * 100);
}

export function computeCareerStats(history: GameRecord[]): CareerStats {
  if (history.length === 0) {
    return {
      totalGames: 0,
      totalSets: 0,
      totalTimeMs: 0,
      overallAccuracy: 0,
      avgRating: 0,
      bestRating: 0,
      avgThroughput: 0,
      bestThroughput: 0,
      avgFindTimeMs: 0,
      bestFindTimeMs: 0,
      totalPenalties: 0,
      totalHints: 0,
    };
  }

  return {
    totalGames: history.length,
    totalSets: history.reduce((s, r) => s + r.setsFound, 0),
    totalTimeMs: history.reduce((s, r) => s + r.durationMs, 0),
    overallAccuracy: Math.round(avg(history.map((r) => r.accuracy)) * 10) / 10,
    avgRating: Math.round(avg(history.map((r) => r.rating))),
    bestRating: Math.max(...history.map((r) => r.rating)),
    avgThroughput: Math.round(avg(history.map((r) => r.throughput)) * 100) / 100,
    bestThroughput: Math.max(...history.map((r) => r.throughput)),
    avgFindTimeMs: Math.round(avg(history.map((r) => r.avgFindTimeMs))),
    bestFindTimeMs: Math.min(
      ...history.filter((r) => r.avgFindTimeMs > 0).map((r) => r.avgFindTimeMs),
    ),
    totalPenalties: history.reduce((s, r) => s + r.incorrectCalls, 0),
    totalHints: history.reduce((s, r) => s + r.hintCount, 0),
  };
}

export function getGameRank(
  history: GameRecord[],
  record: GameRecord,
  key: NumericKey = "rating",
): number {
  const sorted = [...history].sort((a, b) => (b[key] as number) - (a[key] as number));
  const idx = sorted.findIndex((r) => r.id === record.id);
  return idx === -1 ? history.length : idx + 1;
}
