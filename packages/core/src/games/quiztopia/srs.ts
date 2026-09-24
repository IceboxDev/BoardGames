// The trainer's spaced-repetition scheduler: SM-2 reduced to two grades
// ("again" / "good"), day-granular like Anki. Pure and shared by the server
// (source of truth) and the web (optimistic updates), so both compute the
// same next state. The client is the clock: it passes its local `YYYY-MM-DD`
// with every read and write, because the app is timezone-naive.

import { createRng, shuffle } from "../../lib/rng.ts";

export type SrsGrade = "again" | "good";
export type SrsStateKind = "new" | "learning" | "review" | "relearning";

export interface SrsState {
  questionId: string;
  state: SrsStateKind;
  ease: number;
  intervalDays: number;
  /** Local date key the item becomes due (`YYYY-MM-DD`). */
  dueDate: string;
  reps: number;
  lapses: number;
  lastReviewedAt: string | null;
}

export const SRS = {
  EASE_START: 2.5,
  EASE_MIN: 1.3,
  EASE_AGAIN: -0.2,
  EASE_GOOD: 0.05,
  FIRST_INTERVAL: 1,
  GRADUATE_INTERVAL: 3,
  MAX_INTERVAL: 365,
  /** Share of the interval kept after a lapse (Anki resets to 0; too harsh for a binary grader). */
  LAPSE_FACTOR: 0.3,
  LEECH_LAPSES: 8,
  MATURE_DAYS: 21,
} as const;

const DATE_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** `dateKey + n` days, computed in UTC so DST can never shift a day. */
export function addDays(dateKey: string, n: number): string {
  const m = DATE_KEY_RE.exec(dateKey);
  if (!m) throw new Error(`bad date key: ${dateKey}`);
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + n));
  return d.toISOString().slice(0, 10);
}

/** Whole days from `a` to `b` (negative when `b` is earlier). */
export function daysBetween(a: string, b: string): number {
  const pa = DATE_KEY_RE.exec(a);
  const pb = DATE_KEY_RE.exec(b);
  if (!pa || !pb) throw new Error(`bad date key: ${a} / ${b}`);
  const ua = Date.UTC(Number(pa[1]), Number(pa[2]) - 1, Number(pa[3]));
  const ub = Date.UTC(Number(pb[1]), Number(pb[2]) - 1, Number(pb[3]));
  return Math.round((ub - ua) / 86_400_000);
}

export function newState(questionId: string, localDate: string): SrsState {
  return {
    questionId,
    state: "new",
    ease: SRS.EASE_START,
    intervalDays: 0,
    dueDate: localDate,
    reps: 0,
    lapses: 0,
    lastReviewedAt: null,
  };
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

/**
 * The next state after grading. Intervals use the ease BEFORE this review's
 * ease change (SM-2). `max(interval + 1, …)` guarantees growth even at the
 * 1.3 floor, where `1 × 1.3` would round back to 1 and freeze.
 */
export function applyReview(
  prev: SrsState,
  grade: SrsGrade,
  at: { localDate: string; now: string },
): SrsState {
  const base = { ...prev, reps: prev.reps + 1, lastReviewedAt: at.now };
  if (grade === "good") {
    switch (prev.state) {
      case "new":
        return {
          ...base,
          state: "learning",
          intervalDays: SRS.FIRST_INTERVAL,
          dueDate: addDays(at.localDate, SRS.FIRST_INTERVAL),
        };
      case "learning":
        return {
          ...base,
          state: "review",
          intervalDays: SRS.GRADUATE_INTERVAL,
          dueDate: addDays(at.localDate, SRS.GRADUATE_INTERVAL),
        };
      case "review": {
        const grown = Math.max(prev.intervalDays + 1, Math.round(prev.intervalDays * prev.ease));
        const intervalDays = Math.min(SRS.MAX_INTERVAL, grown);
        return {
          ...base,
          state: "review",
          intervalDays,
          ease: round2(prev.ease + SRS.EASE_GOOD),
          dueDate: addDays(at.localDate, intervalDays),
        };
      }
      case "relearning":
        return {
          ...base,
          state: "review",
          intervalDays: prev.intervalDays,
          dueDate: addDays(at.localDate, prev.intervalDays),
        };
    }
  }
  // again
  switch (prev.state) {
    case "new":
    case "learning":
      return { ...base, state: "learning", intervalDays: 0, dueDate: at.localDate };
    case "review":
      return {
        ...base,
        state: "relearning",
        lapses: prev.lapses + 1,
        ease: round2(Math.max(SRS.EASE_MIN, prev.ease + SRS.EASE_AGAIN)),
        intervalDays: Math.max(1, Math.floor(prev.intervalDays * SRS.LAPSE_FACTOR)),
        dueDate: at.localDate,
      };
    case "relearning":
      return { ...base, state: "relearning", dueDate: at.localDate };
  }
}

export function isLeech(s: Pick<SrsState, "lapses">): boolean {
  return s.lapses >= SRS.LEECH_LAPSES;
}

export function isDue(s: Pick<SrsState, "dueDate">, today: string): boolean {
  return s.dueDate <= today;
}

export type QueueTier = "learning" | "review" | "new";

export interface QueueItem {
  questionId: string;
  tier: QueueTier;
  state: SrsState | null;
}

export interface QueueInput {
  /** States already filtered to `dueDate <= today`. */
  due: readonly SrsState[];
  /** Every question id that has a state row (introduced before). */
  seenIds: ReadonlySet<string>;
  /** Introduction order for brand-new questions. */
  newOrder: readonly string[];
  /** New cards still allowed today (per-day cap minus already introduced). */
  newRemaining: number;
  limit: number;
  includeLeeches: boolean;
  /** A question's set, the unit both groupings work on. */
  setIdOf: (questionId: string) => string;
  /**
   * "spread" (default): a set's questions never come back to back.
   * "sets": they stay together — new cards arrive a whole set at a time
   * (the cap is rounded up to finish the last set started) and due cards
   * are gathered by set, so a topic is studied in one sitting.
   */
  grouping?: "spread" | "sets";
  /**
   * Set mode only: after the day's new articles have been read, their
   * questions and everything due are studied in one shuffled mix (seed it
   * per user and day so a reload keeps the order). Without it the new sets
   * stay back to back and due siblings are gathered.
   */
  shuffleSeed?: number;
}

/**
 * Today's queue: learning / relearning first (oldest review first), then
 * due reviews (most overdue first), then new cards up to the daily cap;
 * siblings spread apart (or gathered, in set mode); cut at `limit`.
 */
export function buildDailyQueue(input: QueueInput): QueueItem[] {
  const usable = input.due.filter((s) => input.includeLeeches || !isLeech(s));
  const learning = usable
    .filter((s) => s.state === "learning" || s.state === "relearning")
    .sort(
      (a, b) =>
        (a.lastReviewedAt ?? "").localeCompare(b.lastReviewedAt ?? "") ||
        a.questionId.localeCompare(b.questionId),
    );
  const review = usable
    .filter((s) => s.state === "review")
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.questionId.localeCompare(b.questionId));
  const bySet = input.grouping === "sets";
  const fresh: string[] = [];
  const cap = Math.max(0, input.newRemaining);
  for (const id of input.newOrder) {
    if (input.seenIds.has(id)) continue;
    if (fresh.length >= cap) {
      // In set mode, finish the set the cap cut into, then stop.
      if (!bySet || cap === 0 || input.setIdOf(id) !== input.setIdOf(fresh[fresh.length - 1])) {
        break;
      }
    }
    fresh.push(id);
  }
  const items: QueueItem[] = [
    ...learning.map((s) => ({ questionId: s.questionId, tier: "learning" as const, state: s })),
    ...review.map((s) => ({ questionId: s.questionId, tier: "review" as const, state: s })),
    ...fresh.map((id) => ({ questionId: id, tier: "new" as const, state: null })),
  ];
  const keyOf = (it: QueueItem) => input.setIdOf(it.questionId);
  let ordered: QueueItem[];
  if (!bySet) ordered = interleaveSiblings(items, keyOf);
  else if (input.shuffleSeed === undefined) ordered = groupSiblings(items, keyOf);
  else ordered = shuffle(items, createRng(input.shuffleSeed));
  return ordered.slice(0, Math.max(0, input.limit));
}

/** A deterministic shuffle (same seed, same order) for the day's study mix. */
export function seededShuffle<T>(items: readonly T[], seed: number): T[] {
  return shuffle(items, createRng(seed));
}

/**
 * Stable gather: every item joins the first item with its key, groups keep
 * the order of their first appearance. The opposite of `interleaveSiblings`.
 */
export function groupSiblings<T>(items: readonly T[], keyOf: (item: T) => string): T[] {
  const groups = new Map<string, T[]>();
  for (const it of items) {
    const k = keyOf(it);
    const group = groups.get(k);
    if (group) group.push(it);
    else groups.set(k, [it]);
  }
  return [...groups.values()].flat();
}

/**
 * Spread siblings apart while keeping the incoming order wherever it already
 * works: an item is taken as-is unless it shares its key with the item just
 * placed, in which case the nearest item within `window` with a different
 * key is pulled forward — preferring the key with the most items left, so a
 * long run of one set is broken as early as possible instead of piling up at
 * the end. Gives up (keeps the collision) when nothing suitable is in reach.
 */
export function interleaveSiblings<T>(
  items: readonly T[],
  keyOf: (item: T) => string,
  window = 5,
): T[] {
  const remaining = [...items];
  const counts = new Map<string, number>();
  for (const it of remaining) counts.set(keyOf(it), (counts.get(keyOf(it)) ?? 0) + 1);
  const out: T[] = [];
  let lastKey: string | null = null;
  while (remaining.length > 0) {
    let pick = 0;
    if (keyOf(remaining[0]) === lastKey) {
      let best = -1;
      const limit = Math.min(remaining.length, window + 1);
      for (let j = 1; j < limit; j++) {
        const k = keyOf(remaining[j]);
        if (k === lastKey) continue;
        const c = counts.get(k) ?? 0;
        if (c > best) {
          best = c;
          pick = j;
        }
      }
    }
    const [it] = remaining.splice(pick, 1);
    const k = keyOf(it);
    counts.set(k, (counts.get(k) ?? 1) - 1);
    out.push(it);
    lastKey = k;
  }
  return out;
}

export interface StreakInfo {
  current: number;
  longest: number;
  studiedToday: boolean;
}

/**
 * Study streak over local date keys: `current` counts consecutive days
 * ending today or yesterday (so a streak survives until tonight), `longest`
 * is the best run ever.
 */
export function computeStreak(dates: ReadonlySet<string>, today: string): StreakInfo {
  const studiedToday = dates.has(today);
  let current = 0;
  let cursor = studiedToday ? today : addDays(today, -1);
  while (dates.has(cursor)) {
    current++;
    cursor = addDays(cursor, -1);
  }
  let longest = 0;
  const sorted = [...dates].sort();
  let run = 0;
  let prev: string | null = null;
  for (const d of sorted) {
    run = prev !== null && addDays(prev, 1) === d ? run + 1 : 1;
    if (run > longest) longest = run;
    prev = d;
  }
  return { current, longest: Math.max(longest, current), studiedToday };
}

export interface CategoryMastery {
  seen: number;
  known: number;
  mature: number;
  /** mature / total, 0..1. */
  mastery: number;
}

export function categoryMastery(
  rows: readonly Pick<SrsState, "state" | "intervalDays">[],
  total: number,
): CategoryMastery {
  const seen = rows.length;
  let known = 0;
  let mature = 0;
  for (const r of rows) {
    if (r.state === "review") {
      known++;
      if (r.intervalDays >= SRS.MATURE_DAYS) mature++;
    }
  }
  return { seen, known, mature, mastery: total > 0 ? mature / total : 0 };
}
