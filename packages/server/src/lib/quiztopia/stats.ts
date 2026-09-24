// Trainer read side: the hub overview (per-category aggregates, streak,
// today's counts), the review history, and today's study queue.
//
// Aggregates run in SQL — one `GROUP BY category` over `quiztopia_srs` and
// one over the last 30 local dates of `quiztopia_reviews` — so a member
// with all 10,620 questions in play costs the same as one with ten. Only
// the queue reads rows, and only the due ones plus the ids of everything
// seen; the scheduling itself is the shared core `buildDailyQueue`.

import {
  hashSeed,
  parseQuestionId,
  shuffledIntroductionOrder,
  shuffledSetOrder,
} from "@boardgames/core/games/quiztopia/ids";
import {
  addDays,
  buildDailyQueue,
  computeStreak,
  type QueueItem,
  type QueueTier,
  SRS,
  type SrsState,
  seededShuffle,
} from "@boardgames/core/games/quiztopia/srs";
import type {
  QuiztopiaSettings,
  TrainerHistory,
  TrainerOverview,
  TrainerQueue,
  TrainerQueueItem,
} from "@boardgames/core/protocol";
import type { Client } from "@libsql/client";
import { z } from "zod";
import { parseRow, parseRows } from "../db-rows.ts";
import type { ContentStore } from "./content-store.ts";
import { newPerDayFor, readAllStates, toWireState } from "./srs-db.ts";

const RETENTION_DAYS = 30;
const CATEGORIES = Array.from({ length: 12 }, (_, i) => i + 1);

// ── Row projections ────────────────────────────────────────────────────

const CategoryStateAggRowSchema = z.object({
  category: z.number().int(),
  seen: z.number().int(),
  known: z.number().int(),
  mature: z.number().int(),
  due_all: z.number().int(),
  due_non_leech: z.number().int(),
  learning_due_all: z.number().int(),
  learning_due_non_leech: z.number().int(),
  leeches: z.number().int(),
});

const CategoryReviewAggRowSchema = z.object({
  category: z.number().int(),
  reviews: z.number().int(),
  review_graded: z.number().int(),
  review_good: z.number().int(),
});

const CategoryCountRowSchema = z.object({
  category: z.number().int(),
  n: z.number().int(),
});

const TodayCountsRowSchema = z.object({
  reviews: z.number().int(),
  good: z.number().int(),
  again: z.number().int(),
  new_introduced: z.number().int(),
});

const DateRowSchema = z.object({ local_date: z.string() });

const HistoryRowSchema = z.object({
  local_date: z.string(),
  reviews: z.number().int(),
  good: z.number().int(),
  again: z.number().int(),
  new_introduced: z.number().int(),
});

// ── Shared reads ───────────────────────────────────────────────────────

/** Every local date with at least one trainer review (the streak input). */
export async function streakDates(db: Client, userId: string): Promise<Set<string>> {
  const { rows } = await db.execute({
    sql: `SELECT DISTINCT local_date FROM quiztopia_reviews
           WHERE user_id = ? AND source = 'trainer'`,
    args: [userId],
  });
  return new Set(
    parseRows(DateRowSchema, rows, "quiztopia_reviews.dates").map((r) => r.local_date),
  );
}

/** Per category: new questions introduced on `today` (applied reviews graded from `new`). */
export async function newIntroducedToday(
  db: Client,
  userId: string,
  today: string,
): Promise<Map<number, number>> {
  const { rows } = await db.execute({
    sql: `SELECT category, COUNT(*) AS n FROM quiztopia_reviews
           WHERE user_id = ? AND local_date = ? AND prev_state = 'new' AND applied = 1
           GROUP BY category`,
    args: [userId, today],
  });
  return new Map(
    parseRows(CategoryCountRowSchema, rows, "quiztopia_reviews.new-today").map((r) => [
      r.category,
      r.n,
    ]),
  );
}

// ── Overview ───────────────────────────────────────────────────────────

export async function trainerOverview(
  db: Client,
  userId: string,
  today: string,
  store: ContentStore,
  settings: QuiztopiaSettings,
): Promise<TrainerOverview> {
  const since = addDays(today, -(RETENTION_DAYS - 1));
  const [stateAgg, reviewAgg, introduced, todayRow, dates] = await Promise.all([
    db.execute({
      sql: `SELECT category,
                   COUNT(*) AS seen,
                   SUM(state = 'review') AS known,
                   SUM(state = 'review' AND interval_days >= ?) AS mature,
                   SUM(due_date <= ?) AS due_all,
                   SUM(due_date <= ? AND lapses < ?) AS due_non_leech,
                   SUM(due_date <= ? AND state IN ('learning','relearning')) AS learning_due_all,
                   SUM(due_date <= ? AND state IN ('learning','relearning') AND lapses < ?)
                     AS learning_due_non_leech,
                   SUM(lapses >= ?) AS leeches
              FROM quiztopia_srs
             WHERE user_id = ?
             GROUP BY category`,
      args: [
        SRS.MATURE_DAYS,
        today,
        today,
        SRS.LEECH_LAPSES,
        today,
        today,
        SRS.LEECH_LAPSES,
        SRS.LEECH_LAPSES,
        userId,
      ],
    }),
    db.execute({
      sql: `SELECT category,
                   COUNT(*) AS reviews,
                   SUM(prev_state = 'review') AS review_graded,
                   SUM(prev_state = 'review' AND grade = 'good') AS review_good
              FROM quiztopia_reviews
             WHERE user_id = ? AND applied = 1 AND local_date >= ? AND local_date <= ?
             GROUP BY category`,
      args: [userId, since, today],
    }),
    newIntroducedToday(db, userId, today),
    db.execute({
      sql: `SELECT COUNT(*) AS reviews,
                   COALESCE(SUM(grade = 'good'), 0) AS good,
                   COALESCE(SUM(grade = 'again'), 0) AS again,
                   COALESCE(SUM(prev_state = 'new' AND applied = 1), 0) AS new_introduced
              FROM quiztopia_reviews
             WHERE user_id = ? AND local_date = ? AND source = 'trainer'`,
      args: [userId, today],
    }),
    streakDates(db, userId),
  ]);

  const states = new Map(
    parseRows(CategoryStateAggRowSchema, stateAgg.rows, "quiztopia_srs.overview").map((r) => [
      r.category,
      r,
    ]),
  );
  const reviews = new Map(
    parseRows(CategoryReviewAggRowSchema, reviewAgg.rows, "quiztopia_reviews.overview").map((r) => [
      r.category,
      r,
    ]),
  );
  const todayCounts = parseRow(TodayCountsRowSchema, todayRow.rows[0], "quiztopia_reviews.today");

  const categories = CATEGORIES.map((n) => {
    const total = store.questionIdsByCategory(n).length;
    const s = states.get(n);
    const r = reviews.get(n);
    const seen = s?.seen ?? 0;
    const newAvailable = Math.max(0, total - seen);
    const cap = Math.max(0, newPerDayFor(settings, n) - (introduced.get(n) ?? 0));
    // Set mode finishes the set the cap cuts into — count whole sets (an
    // estimate when a set is already half seen).
    const setCap = settings.newCardOrder === "sets" ? Math.ceil(cap / 5) * 5 : cap;
    const newRemainingToday = Math.min(newAvailable, setCap);
    const mature = s?.mature ?? 0;
    const graded = r?.review_graded ?? 0;
    return {
      n,
      total,
      seen,
      due: (settings.includeLeeches ? s?.due_all : s?.due_non_leech) ?? 0,
      learningDue: (settings.includeLeeches ? s?.learning_due_all : s?.learning_due_non_leech) ?? 0,
      newAvailable,
      newRemainingToday,
      known: s?.known ?? 0,
      mature,
      mastery: total > 0 ? mature / total : 0,
      retention30: graded > 0 ? (r?.review_good ?? 0) / graded : null,
      reviews30: r?.reviews ?? 0,
      leeches: s?.leeches ?? 0,
    };
  });

  return {
    contentVersion: store.version,
    today,
    streak: computeStreak(dates, today),
    todayCounts: {
      reviews: todayCounts.reviews,
      good: todayCounts.good,
      again: todayCounts.again,
      newIntroduced: todayCounts.new_introduced,
    },
    categories,
    settings,
  };
}

// ── History ────────────────────────────────────────────────────────────

export async function trainerHistory(
  db: Client,
  userId: string,
  today: string,
  days: number,
): Promise<TrainerHistory> {
  const since = addDays(today, -(days - 1));
  const { rows } = await db.execute({
    sql: `SELECT local_date,
                 COUNT(*) AS reviews,
                 SUM(grade = 'good') AS good,
                 SUM(grade = 'again') AS again,
                 SUM(prev_state = 'new' AND applied = 1) AS new_introduced
            FROM quiztopia_reviews
           WHERE user_id = ? AND source = 'trainer' AND local_date >= ? AND local_date <= ?
           GROUP BY local_date
           ORDER BY local_date`,
    args: [userId, since, today],
  });
  return {
    days: parseRows(HistoryRowSchema, rows, "quiztopia_reviews.history").map((r) => ({
      date: r.local_date,
      reviews: r.reviews,
      good: r.good,
      again: r.again,
      newIntroduced: r.new_introduced,
    })),
  };
}

// ── Queue ──────────────────────────────────────────────────────────────

export interface QueueOptions {
  today: string;
  category?: number;
  limit: number;
  includeLeeches: boolean;
}

function setIdOf(questionId: string): string {
  return parseQuestionId(questionId)?.setId ?? questionId;
}

/** Round-robin the categories' items tier by tier, keeping each list's own order. */
function mergeRoundRobin(lists: readonly QueueItem[][]): QueueItem[] {
  const out: QueueItem[] = [];
  for (const tier of ["learning", "review", "new"] as const satisfies readonly QueueTier[]) {
    const cursors = lists.map((items) => items.filter((it) => it.tier === tier));
    let remaining = cursors.reduce((n, items) => n + items.length, 0);
    let i = 0;
    while (remaining > 0) {
      const items = cursors[i % cursors.length];
      const next = items.shift();
      if (next) {
        out.push(next);
        remaining--;
      }
      i++;
    }
  }
  return out;
}

/**
 * Today's queue. With a category: that programme's learning → review →
 * new items under its daily new-card cap. Without: every category's
 * queue under the same per-category caps, round-robined tier by tier so
 * one district cannot crowd the rest out.
 */
export async function trainerQueue(
  db: Client,
  userId: string,
  opts: QueueOptions,
  store: ContentStore,
  settings: QuiztopiaSettings,
): Promise<TrainerQueue> {
  const includeLeeches = opts.includeLeeches || settings.includeLeeches;
  const [seenRows, dueRows, introduced] = await Promise.all([
    db.execute({
      sql: `SELECT question_id, category FROM quiztopia_srs
             WHERE user_id = ?${opts.category !== undefined ? " AND category = ?" : ""}`,
      args: opts.category !== undefined ? [userId, opts.category] : [userId],
    }),
    readAllStates(db, userId, { category: opts.category, dueBy: opts.today }),
    newIntroducedToday(db, userId, opts.today),
  ]);

  const seenByCategory = new Map<number, Set<string>>();
  for (const row of parseRows(
    z.object({ question_id: z.string(), category: z.number().int() }),
    seenRows.rows,
    "quiztopia_srs.seen",
  )) {
    let set = seenByCategory.get(row.category);
    if (!set) {
      set = new Set();
      seenByCategory.set(row.category, set);
    }
    set.add(row.question_id);
  }
  const dueByCategory = new Map<number, SrsState[]>();
  for (const { category, state } of dueRows) {
    let list = dueByCategory.get(category);
    if (!list) {
      list = [];
      dueByCategory.set(category, list);
    }
    list.push(state);
  }

  const categories = opts.category !== undefined ? [opts.category] : CATEGORIES;
  const bySet = settings.newCardOrder === "sets";
  const perCategory = categories.map((n) => {
    // A per-user, per-district shuffle: stable for the learner, random
    // across learners — whole sets, or all originals before any sibling.
    const seed = hashSeed(`${userId}:${n}`);
    return buildDailyQueue({
      due: dueByCategory.get(n) ?? [],
      seenIds: seenByCategory.get(n) ?? new Set(),
      newOrder: bySet
        ? shuffledSetOrder(store.cardIds, n, seed)
        : shuffledIntroductionOrder(store.cardIds, n, seed),
      newRemaining: newPerDayFor(settings, n) - (introduced.get(n) ?? 0),
      limit: Number.MAX_SAFE_INTEGER,
      includeLeeches,
      setIdOf,
      grouping: bySet ? "sets" : "spread",
      // The day's new questions mixed across their articles — stable for the day.
      shuffleSeed: bySet ? hashSeed(`${userId}:${opts.today}:${n}`) : undefined,
    });
  });
  // Several districts: round-robin tier by tier — except in whole-set mode,
  // where the day is one shuffled mix of new and due across every district.
  const merged =
    perCategory.length === 1
      ? perCategory[0]
      : bySet
        ? seededShuffle(perCategory.flat(), hashSeed(`${userId}:${opts.today}:all`))
        : mergeRoundRobin(perCategory);
  const counts = { learning: 0, review: 0, new: 0 };
  for (const it of merged) counts[it.tier]++;

  const items: TrainerQueueItem[] = [];
  for (const it of merged.slice(0, opts.limit)) {
    const q = store.getQuestion(it.questionId);
    if (!q) continue; // a state row for a question the content no longer has
    items.push({
      questionId: it.questionId,
      setId: q.setId,
      cardId: q.cardId,
      category: q.n,
      tier: it.tier,
      state: it.state ? toWireState(it.state) : null,
    });
  }
  return { today: opts.today, items, counts };
}
