// Pure aggregations over the pre-derived match summary
// (`ProfileMatchSummaryItem[]`, newest first). Everything the match-history
// page draws — hero counts, streaks, month buckets, co-player rows, filters —
// derives here from the one unpaginated payload, so the numbers always agree
// with each other. Results are NEVER re-derived from outcomes (the server did
// that once); this module only counts and slices.

import type { ProfileMatchSummaryItem } from "@boardgames/core/protocol";

export type ResultFilter = "all" | "won" | "lost" | "other";

export interface SummaryFilters {
  result: ResultFilter;
  /** Calendar year, or null = all time. */
  year: number | null;
  /** Game slug, or null = every game. */
  gameSlug: string | null;
}

export const ALL_FILTERS: SummaryFilters = { result: "all", year: null, gameSlug: null };

/** Year of a loose-ISO `playedAt` ("2026-…"); NaN never matches a filter. */
export function itemYear(item: ProfileMatchSummaryItem): number {
  return Number.parseInt(item.playedAt.slice(0, 4), 10);
}

export function applyFilters(
  items: readonly ProfileMatchSummaryItem[],
  filters: SummaryFilters,
): ProfileMatchSummaryItem[] {
  return items.filter((item) => {
    if (filters.year !== null && itemYear(item) !== filters.year) return false;
    if (filters.gameSlug !== null && item.gameSlug !== filters.gameSlug) return false;
    switch (filters.result) {
      case "won":
        return item.result === "win";
      case "lost":
        return item.result === "loss";
      case "other":
        return item.result !== "win" && item.result !== "loss";
      default:
        return true;
    }
  });
}

/** Distinct calendar years present, newest first. */
export function summaryYears(items: readonly ProfileMatchSummaryItem[]): number[] {
  const years = new Set<number>();
  for (const item of items) {
    const y = itemYear(item);
    if (!Number.isNaN(y)) years.add(y);
  }
  return [...years].sort((a, b) => b - a);
}

export interface RecordCounts {
  total: number;
  wins: number;
  losses: number;
  draws: number;
  /** Everything non-decisive: draws + moderated + scored/ongoing plays. */
  other: number;
}

export function recordCounts(items: readonly ProfileMatchSummaryItem[]): RecordCounts {
  let wins = 0;
  let losses = 0;
  let draws = 0;
  for (const item of items) {
    if (item.result === "win") wins++;
    else if (item.result === "loss") losses++;
    else if (item.result === "draw") draws++;
  }
  return { total: items.length, wins, losses, draws, other: items.length - wins - losses };
}

export interface StreakInfo {
  /** The live run of consecutive wins or losses; null when none (e.g. a draw
   *  just broke it, or no decisive results yet). */
  current: { type: "win" | "loss"; length: number } | null;
  /** Longest win run ever. */
  bestWin: number;
}

/**
 * Streaks over decisive results in chronological order. Draws BREAK streaks
 * (a run of wins ends on a draw); moderator/scored/ongoing plays are
 * transparent — they neither extend nor break a run.
 */
export function streaks(items: readonly ProfileMatchSummaryItem[]): StreakInfo {
  const decisive = [...items]
    .reverse() // chronological
    .filter((i) => i.result === "win" || i.result === "loss" || i.result === "draw");

  let bestWin = 0;
  let run: { type: "win" | "loss"; length: number } | null = null;
  for (const item of decisive) {
    if (item.result !== "win" && item.result !== "loss") {
      // Only draws reach here (pre-filtered above) — they reset the run.
      run = null;
      continue;
    }
    const type = item.result;
    run = run && run.type === type ? { type, length: run.length + 1 } : { type, length: 1 };
    if (type === "win" && run.length > bestWin) bestWin = run.length;
  }
  return { current: run, bestWin };
}

/** The last `n` decisive results (win/loss/draw), chronological. */
export function recentForm(
  items: readonly ProfileMatchSummaryItem[],
  n = 10,
): ("win" | "loss" | "draw")[] {
  const decisive: ("win" | "loss" | "draw")[] = [];
  for (const item of items) {
    // Items are newest first; collect until the window is full.
    if (item.result === "win" || item.result === "loss" || item.result === "draw") {
      decisive.push(item.result);
      if (decisive.length === n) break;
    }
  }
  return decisive.reverse();
}

export interface MonthBucket {
  /** "YYYY-MM". */
  key: string;
  /** Column label ("Mar", with "’26" on year boundaries). */
  label: string;
  wins: number;
  losses: number;
  other: number;
}

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** Chronological month buckets, gap months included (zero columns). */
export function monthlyBuckets(items: readonly ProfileMatchSummaryItem[]): MonthBucket[] {
  if (items.length === 0) return [];
  const byKey = new Map<string, MonthBucket>();
  let minKey = "";
  let maxKey = "";
  for (const item of items) {
    const key = item.playedAt.slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(key)) continue;
    if (!minKey || key < minKey) minKey = key;
    if (!maxKey || key > maxKey) maxKey = key;
    let bucket = byKey.get(key);
    if (!bucket) {
      bucket = { key, label: "", wins: 0, losses: 0, other: 0 };
      byKey.set(key, bucket);
    }
    if (item.result === "win") bucket.wins++;
    else if (item.result === "loss") bucket.losses++;
    else bucket.other++;
  }
  if (!minKey) return [];

  const out: MonthBucket[] = [];
  let [y, m] = minKey.split("-").map((s) => Number.parseInt(s, 10));
  const [maxY, maxM] = maxKey.split("-").map((s) => Number.parseInt(s, 10));
  while (y < maxY || (y === maxY && m <= maxM)) {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    const bucket = byKey.get(key) ?? { key, label: "", wins: 0, losses: 0, other: 0 };
    // Year marker on January and on the very first column.
    bucket.label =
      m === 1 || out.length === 0
        ? `${MONTH_NAMES[m - 1]} ’${String(y).slice(2)}`
        : MONTH_NAMES[m - 1];
    out.push(bucket);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

export interface CoPlayerCount {
  userId: string;
  games: number;
  /** `playedAt` of the most recent shared unit. */
  lastPlayedAt: string;
}

/** Who this player plays with, most-shared first. */
export function coPlayerCounts(items: readonly ProfileMatchSummaryItem[]): CoPlayerCount[] {
  const byId = new Map<string, CoPlayerCount>();
  for (const item of items) {
    for (const id of item.coPlayerIds) {
      const entry = byId.get(id);
      if (entry) {
        entry.games += 1;
        if (item.playedAt > entry.lastPlayedAt) entry.lastPlayedAt = item.playedAt;
      } else {
        byId.set(id, { userId: id, games: 1, lastPlayedAt: item.playedAt });
      }
    }
  }
  return [...byId.values()].sort(
    (a, b) => b.games - a.games || b.lastPlayedAt.localeCompare(a.lastPlayedAt),
  );
}

export interface GamePlays {
  slug: string;
  title: string;
  plays: number;
}

/** Games by play count (slug-less matches excluded), most-played first. */
export function gamesByPlays(items: readonly ProfileMatchSummaryItem[]): GamePlays[] {
  const bySlug = new Map<string, GamePlays>();
  for (const item of items) {
    if (!item.gameSlug) continue;
    const entry = bySlug.get(item.gameSlug);
    if (entry) entry.plays += 1;
    else bySlug.set(item.gameSlug, { slug: item.gameSlug, title: item.gameTitle, plays: 1 });
  }
  return [...bySlug.values()].sort((a, b) => b.plays - a.plays || a.title.localeCompare(b.title));
}

/** Rolling mean of performance credit (window `n`), chronological. */
export function rollingPerformance(
  items: readonly ProfileMatchSummaryItem[],
  window = 5,
): number[] {
  const credits = [...items]
    .reverse()
    .map((i) => i.credit)
    .filter((c): c is number => c !== null);
  if (credits.length === 0) return [];
  const out: number[] = [];
  for (let i = 0; i < credits.length; i++) {
    const slice = credits.slice(Math.max(0, i - window + 1), i + 1);
    out.push(slice.reduce((s, c) => s + c, 0) / slice.length);
  }
  return out;
}

/** Mean performance credit over all competitive plays, or null. */
export function meanPerformance(items: readonly ProfileMatchSummaryItem[]): number | null {
  const credits = items.map((i) => i.credit).filter((c): c is number => c !== null);
  if (credits.length === 0) return null;
  return credits.reduce((s, c) => s + c, 0) / credits.length;
}

export interface PersonalRecords {
  longestWinStreak: number;
  /** The night with the most units played, or null (standalone-only history). */
  biggestNight: { dateKey: string; games: number } | null;
  firstPlayedAt: string | null;
  distinctGames: number;
  /** Total sessions incl. campaign sittings (≥ total units). */
  totalSessions: number;
}

export function personalRecords(items: readonly ProfileMatchSummaryItem[]): PersonalRecords {
  const byNight = new Map<string, number>();
  let totalSessions = 0;
  const slugs = new Set<string>();
  for (const item of items) {
    totalSessions += item.sessions;
    if (item.gameSlug) slugs.add(item.gameSlug);
    if (item.dateKey) byNight.set(item.dateKey, (byNight.get(item.dateKey) ?? 0) + 1);
  }
  let biggestNight: { dateKey: string; games: number } | null = null;
  for (const [dateKey, games] of byNight) {
    if (!biggestNight || games > biggestNight.games) biggestNight = { dateKey, games };
  }
  return {
    longestWinStreak: streaks(items).bestWin,
    biggestNight,
    firstPlayedAt: items.length > 0 ? items[items.length - 1].playedAt : null,
    distinctGames: slugs.size,
    totalSessions,
  };
}
