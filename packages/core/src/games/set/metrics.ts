import type { GameRecord, PerSetRecord } from "./types";

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const squaredDiffs = values.map((v) => (v - mean) ** 2);
  return Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / values.length);
}

function fatigue(values: number[]): number {
  if (values.length < 4) return 0;
  const mid = Math.floor(values.length / 2);
  const firstHalf = values.slice(0, mid);
  const secondHalf = values.slice(mid);
  const avgFirst = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
  const avgSecond = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
  return avgSecond - avgFirst;
}

export function computeGameMetrics(
  perSetRecords: PerSetRecord[],
  gameStartTime: number,
  gameEndTime: number,
  incorrectCalls: number,
  plusThreeCount: number,
  cardsRemaining: number,
  hintCount: number = 0,
): GameRecord {
  const durationMs = gameEndTime - gameStartTime;
  const setsFound = perSetRecords.length;
  const totalCalls = setsFound + incorrectCalls;
  const accuracy = totalCalls > 0 ? (setsFound / totalCalls) * 100 : 100;
  const netScore = setsFound - incorrectCalls;

  const findTimes = perSetRecords.map((r) => r.totalFindTimeMs);
  const avgFindTimeMs =
    findTimes.length > 0 ? findTimes.reduce((a, b) => a + b, 0) / findTimes.length : 0;

  const earlyCallCount = perSetRecords.filter((r) => r.calledDuringDeal).length;
  const boardSizes = perSetRecords.map((r) => r.boardSize);
  const avgBoardSize =
    boardSizes.length > 0 ? boardSizes.reduce((a, b) => a + b, 0) / boardSizes.length : 0;

  let longestStreak = 0;
  let currentStreak = 0;
  for (const _r of perSetRecords) {
    currentStreak++;
    if (currentStreak > longestStreak) longestStreak = currentStreak;
  }
  // Incorrect calls reset streak -- we track this via a separate event log
  // For simplicity, longest streak = total sets found if no incorrect calls,
  // otherwise we'd need interleaved event tracking. We'll handle this properly
  // in the game orchestrator by passing a streak array.
  // Here we just use perSetRecords length as an upper bound.

  const durationMin = durationMs / 60000;
  const throughput = durationMin > 0 ? setsFound / durationMin : 0;

  const record: GameRecord = {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    durationMs,
    setsFound,
    incorrectCalls,
    accuracy: Math.round(accuracy * 10) / 10,
    netScore,
    avgFindTimeMs: Math.round(avgFindTimeMs),
    medianFindTimeMs: Math.round(median(findTimes)),
    fastestSetMs: findTimes.length > 0 ? Math.round(Math.min(...findTimes)) : 0,
    slowestSetMs: findTimes.length > 0 ? Math.round(Math.max(...findTimes)) : 0,
    consistencyMs: Math.round(stddev(findTimes)),
    timeToFirstSetMs: perSetRecords.length > 0 ? Math.round(perSetRecords[0].totalFindTimeMs) : 0,
    earlyCallCount,
    earlyCallRate: setsFound > 0 ? Math.round((earlyCallCount / setsFound) * 100) / 100 : 0,
    avgBoardSize: Math.round(avgBoardSize * 10) / 10,
    plusThreeRequests: plusThreeCount,
    hintCount,
    longestStreak,
    fatigueSlopeMs: Math.round(fatigue(findTimes)),
    cardsRemaining,
    throughput: Math.round(throughput * 100) / 100,
    rating: 0,
    perSetDetails: perSetRecords,
  };

  record.rating = computeRating(record);
  return record;
}

const RATING_WEIGHTS = {
  throughput: 0.3,
  accuracy: 0.25,
  consistency: 0.15,
  avgBoardSize: 0.15,
  earlyCallRate: 0.15,
};

export function computeRating(metrics: GameRecord): number {
  // Throughput: 2 SETs/min = 50, 4+ = 100
  const throughputScore = Math.min(100, (metrics.throughput / 4) * 100);

  // Accuracy: direct percentage
  const accuracyScore = metrics.accuracy;

  // Consistency: stddev 0 = 100, 10s+ = 0
  const consistencyScore = Math.max(0, 100 - (metrics.consistencyMs / 10000) * 100);

  // Board size: 12 = 100, 15+ = 50
  const boardSizeScore = Math.max(0, Math.min(100, ((15 - metrics.avgBoardSize) / 3) * 100));

  // Early call rate: 0.5+ = 100
  const earlyScore = Math.min(100, metrics.earlyCallRate * 200);

  const raw =
    throughputScore * RATING_WEIGHTS.throughput +
    accuracyScore * RATING_WEIGHTS.accuracy +
    consistencyScore * RATING_WEIGHTS.consistency +
    boardSizeScore * RATING_WEIGHTS.avgBoardSize +
    earlyScore * RATING_WEIGHTS.earlyCallRate;

  return Math.round(Math.max(0, Math.min(100, raw)));
}

export function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  const tenths = Math.floor((ms % 1000) / 100);
  return `${min}:${sec.toString().padStart(2, "0")}.${tenths}`;
}
