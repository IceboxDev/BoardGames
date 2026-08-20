// Pure aggregations over the pre-derived match summary
// (`ProfileMatchSummaryItem[]`, newest first). Everything the match-history
// page draws — hero counts, streaks, month buckets, co-player rows, filters —
// derives here from the one unpaginated payload, so the numbers always agree
// with each other. Results are NEVER re-derived from outcomes (the server did
// that once); this module only counts and slices.

import { type StreakInfo, type StreakResult, streakInfo } from "@boardgames/core/history/streaks";
import type { ProfileMatchSummaryItem } from "@boardgames/core/protocol";
import { isPointlessFreeForAll } from "../../../games/score-config.ts";

export type ResultFilter = "all" | "won" | "placed" | "lost" | "other";

/**
 * A loss that reads friendlier than "lost": the player finished mid-field in
 * a placement game — not last, and not a duel (where 2nd of 2 IS the loss).
 * Point-less free-for-alls (Villainous) carry no real placement and stay
 * plain losses. The fourth Record bucket between won and lost.
 */
export function isPlacedLoss(item: ProfileMatchSummaryItem): boolean {
  if (item.result !== "loss" || item.place === null || item.fieldSize === null) return false;
  if (item.kind === "free-for-all" && isPointlessFreeForAll(item.gameSlug)) return false;
  return item.fieldSize > 2 && item.place > 1 && item.place < item.fieldSize;
}

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
      case "placed":
        return isPlacedLoss(item);
      case "lost":
        return item.result === "loss" && !isPlacedLoss(item);
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
  /** Mid-field finishes in placement games — between won and lost. */
  placed: number;
  /** Outright losses: last place, duels, teams/co-op/one-vs-many defeats. */
  losses: number;
  draws: number;
  /** Everything non-decisive: draws + moderated + scored/ongoing plays. */
  other: number;
}

export function recordCounts(items: readonly ProfileMatchSummaryItem[]): RecordCounts {
  let wins = 0;
  let placed = 0;
  let losses = 0;
  let draws = 0;
  for (const item of items) {
    if (item.result === "win") wins++;
    else if (item.result === "loss") {
      if (isPlacedLoss(item)) placed++;
      else losses++;
    } else if (item.result === "draw") draws++;
  }
  return {
    total: items.length,
    wins,
    placed,
    losses,
    draws,
    other: items.length - wins - placed - losses,
  };
}

export type { StreakInfo } from "@boardgames/core/history/streaks";

/**
 * Streaks over decisive results in chronological order. Draws BREAK streaks
 * (a run of wins ends on a draw); moderator/scored/ongoing plays are
 * transparent — they neither extend nor break a run. The fold itself lives in
 * core so a "five straight" on this page and a "five straight" in a spotlight
 * greeting are the same five.
 */
export function streaks(items: readonly ProfileMatchSummaryItem[]): StreakInfo {
  const decisive = [...items]
    .reverse() // chronological
    .map((i) => i.result)
    .filter((r): r is StreakResult => r === "win" || r === "loss" || r === "draw");
  return streakInfo(decisive);
}

export type FormResult = "win" | "placed" | "loss" | "draw";

/** The last `n` decisive results (won/placed/lost/drawn), chronological. */
export function recentForm(items: readonly ProfileMatchSummaryItem[], n = 10): FormResult[] {
  const decisive: FormResult[] = [];
  for (const item of items) {
    // Items are newest first; collect until the window is full.
    if (item.result === "win" || item.result === "draw") {
      decisive.push(item.result);
    } else if (item.result === "loss") {
      decisive.push(isPlacedLoss(item) ? "placed" : "loss");
    } else {
      continue;
    }
    if (decisive.length === n) break;
  }
  return decisive.reverse();
}

export interface MonthBucket {
  /** "YYYY-MM". */
  key: string;
  /** Column label ("Mar", with "’26" on year boundaries). */
  label: string;
  wins: number;
  placed: number;
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
      bucket = { key, label: "", wins: 0, placed: 0, losses: 0, other: 0 };
      byKey.set(key, bucket);
    }
    if (item.result === "win") bucket.wins++;
    else if (item.result === "loss") {
      if (isPlacedLoss(item)) bucket.placed++;
      else bucket.losses++;
    } else bucket.other++;
  }
  if (!minKey) return [];

  const out: MonthBucket[] = [];
  let [y, m] = minKey.split("-").map((s) => Number.parseInt(s, 10));
  const [maxY, maxM] = maxKey.split("-").map((s) => Number.parseInt(s, 10));
  while (y < maxY || (y === maxY && m <= maxM)) {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    const bucket = byKey.get(key) ?? { key, label: "", wins: 0, placed: 0, losses: 0, other: 0 };
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
