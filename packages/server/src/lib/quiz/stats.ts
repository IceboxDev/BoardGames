// Trainer read side: the hub overview (per-domain aggregates, streak, the
// day's budget), the review history and today's study queue.
//
// A member's whole schedule is one `trainer_srs` read (≤ one row per fact)
// grouped by domain in memory — the domain lives in the content, not the
// row. New facts arrive a whole article at a time under the day's fact
// budget (`buildDailyQueue`); an article begun on an earlier day finishes on
// top of it. Only articles printed by one of the member's sources count.

import { hashSeed } from "@boardgames/core/lib/rng";
import type {
  QuizDomainSlug,
  QuizSettings,
  TrainerHistory,
  TrainerOverview,
  TrainerQueue,
  TrainerQueueItem,
} from "@boardgames/core/protocol";
import {
  addDays,
  buildDailyQueue,
  isLeech,
  SRS,
  type SrsState,
  seededShuffle,
} from "@boardgames/core/quiz/srs";
import { QUIZ_DOMAINS } from "@boardgames/core/quiz/taxonomy";
import type { Client } from "@libsql/client";
import { z } from "zod";
import { parseRow, parseRows } from "../db-rows.ts";
import { deckStreak, readDeckStates } from "../trainers/deck-db.ts";
import type { ArticleMeta, ContentStore } from "./content-store.ts";
import { QUIZ_DECK, toWireState } from "./srs-db.ts";

const RETENTION_DAYS = 30;

// ── Shared reads ───────────────────────────────────────────────────────

/** Articles the member studies: printed by one of their sources (or by none at all). */
export function eligibleArticles(store: ContentStore, settings: QuizSettings): ArticleMeta[] {
  return store.articles.filter(
    (a) => a.sources.length === 0 || a.sources.some((s) => settings.sources.includes(s)),
  );
}

interface Schedule {
  /** Every state row whose fact the bank still has. */
  states: SrsState[];
  seen: Set<string>;
  /** Articles with at least one fact studied. */
  started: Set<string>;
}

async function readSchedule(db: Client, userId: string, store: ContentStore): Promise<Schedule> {
  const states = (await readDeckStates(db, userId, QUIZ_DECK)).filter((s) =>
    store.hasFact(s.questionId),
  );
  const seen = new Set(states.map((s) => s.questionId));
  const started = new Set<string>();
  for (const id of seen) {
    const fact = store.getFact(id);
    if (fact) started.add(fact.articleId);
  }
  return { states, seen, started };
}

const CountRowSchema = z.object({ n: z.number().int() });

/** New facts introduced on `today` by the trainer (applied reviews graded from `new`). */
async function introducedToday(db: Client, userId: string, today: string): Promise<number> {
  const { rows } = await db.execute({
    sql: `SELECT COUNT(DISTINCT card_id) AS n FROM trainer_reviews
           WHERE user_id = ? AND deck = ? AND local_date = ? AND prev_state = 'new'
             AND applied = 1 AND source = 'trainer'`,
    args: [userId, QUIZ_DECK, today],
  });
  return parseRow(CountRowSchema, rows[0], "trainer_reviews.new-today").n;
}

/** Unseen facts of articles already begun — dealt on top of the budget. */
function leftovers(articles: readonly ArticleMeta[], sched: Schedule): number {
  let n = 0;
  for (const a of articles) {
    if (!sched.started.has(a.id)) continue;
    for (const id of a.factIds) if (!sched.seen.has(id)) n++;
  }
  return n;
}

// ── Overview ───────────────────────────────────────────────────────────

const TodayCountsRowSchema = z.object({
  reviews: z.number().int(),
  good: z.number().int(),
  again: z.number().int(),
  new_introduced: z.number().int(),
});
const RecentRowSchema = z.object({
  card_id: z.string(),
  grade: z.string(),
  prev_state: z.string(),
});

export async function trainerOverview(
  db: Client,
  userId: string,
  today: string,
  store: ContentStore,
  settings: QuizSettings,
): Promise<TrainerOverview> {
  const since = addDays(today, -(RETENTION_DAYS - 1));
  const [sched, introduced, todayRow, recent, streak] = await Promise.all([
    readSchedule(db, userId, store),
    introducedToday(db, userId, today),
    db.execute({
      sql: `SELECT COUNT(*) AS reviews,
                   COALESCE(SUM(grade = 'good'), 0) AS good,
                   COALESCE(SUM(grade = 'again'), 0) AS again,
                   COALESCE(SUM(prev_state = 'new' AND applied = 1), 0) AS new_introduced
              FROM trainer_reviews
             WHERE user_id = ? AND deck = ? AND local_date = ? AND source = 'trainer'`,
      args: [userId, QUIZ_DECK, today],
    }),
    db.execute({
      sql: `SELECT card_id, grade, prev_state FROM trainer_reviews
             WHERE user_id = ? AND deck = ? AND applied = 1 AND local_date >= ? AND local_date <= ?`,
      args: [userId, QUIZ_DECK, since, today],
    }),
    deckStreak(db, userId, QUIZ_DECK, today),
  ]);
  const todayCounts = parseRow(TodayCountsRowSchema, todayRow.rows[0], "trainer_reviews.today");
  const eligible = eligibleArticles(store, settings);
  const eligibleFacts = new Set(eligible.flatMap((a) => a.factIds));

  const agg = QUIZ_DOMAINS.map((d) => ({
    domain: d.slug,
    total: 0,
    seen: 0,
    due: 0,
    learningDue: 0,
    known: 0,
    mature: 0,
    leeches: 0,
    reviews30: 0,
    graded: 0,
    good: 0,
  }));
  const byDomain = new Map(agg.map((d) => [d.domain, d]));
  for (const a of eligible) {
    const d = byDomain.get(a.domain);
    if (d) d.total += a.factIds.length;
  }
  for (const s of sched.states) {
    if (!eligibleFacts.has(s.questionId)) continue;
    const fact = store.getFact(s.questionId);
    const d = fact && byDomain.get(fact.domain);
    if (!d) continue;
    d.seen++;
    const leech = isLeech(s);
    if (leech) d.leeches++;
    if (s.dueDate <= today && (settings.includeLeeches || !leech)) {
      d.due++;
      if (s.state === "learning" || s.state === "relearning") d.learningDue++;
    }
    if (s.state === "review") {
      d.known++;
      if (s.intervalDays >= SRS.MATURE_DAYS) d.mature++;
    }
  }
  for (const r of parseRows(RecentRowSchema, recent.rows, "trainer_reviews.recent")) {
    const fact = store.getFact(r.card_id);
    const d = fact && byDomain.get(fact.domain);
    if (!d) continue;
    d.reviews30++;
    if (r.prev_state === "review") {
      d.graded++;
      if (r.grade === "good") d.good++;
    }
  }

  const leftoverToday = leftovers(eligible, sched);
  const newAvailable = agg.reduce((n, d) => n + Math.max(0, d.total - d.seen), 0);
  const domains = agg.map((d) => ({
    domain: d.domain,
    total: d.total,
    seen: d.seen,
    due: d.due,
    learningDue: d.learningDue,
    newAvailable: Math.max(0, d.total - d.seen),
    known: d.known,
    mature: d.mature,
    mastery: d.total > 0 ? d.mature / d.total : 0,
    retention30: d.graded > 0 ? d.good / d.graded : null,
    reviews30: d.reviews30,
    leeches: d.leeches,
  }));

  return {
    contentVersion: store.version,
    today,
    streak,
    todayCounts: {
      reviews: todayCounts.reviews,
      good: todayCounts.good,
      again: todayCounts.again,
      newIntroduced: todayCounts.new_introduced,
    },
    newRemainingToday: Math.max(
      0,
      Math.min(newAvailable - leftoverToday, settings.newFactsPerDay - introduced),
    ),
    leftoverToday,
    domains,
    settings,
  };
}

// ── History ────────────────────────────────────────────────────────────

const HistoryRowSchema = z.object({
  local_date: z.string(),
  reviews: z.number().int(),
  good: z.number().int(),
  again: z.number().int(),
  new_introduced: z.number().int(),
});

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
            FROM trainer_reviews
           WHERE user_id = ? AND deck = ? AND source = 'trainer'
             AND local_date >= ? AND local_date <= ?
           GROUP BY local_date
           ORDER BY local_date`,
    args: [userId, QUIZ_DECK, since, today],
  });
  return {
    days: parseRows(HistoryRowSchema, rows, "trainer_reviews.history").map((r) => ({
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
  domain?: QuizDomainSlug;
  limit: number;
  includeLeeches: boolean;
}

const CardRowSchema = z.object({ card_id: z.string() });

/**
 * Today's queue — one domain, or "Study all" (every domain the member did
 * not leave out): learning → review → new under the day's fact budget,
 * new facts a whole article at a time, then the day mixed in one seeded
 * shuffle (stable for the member and the day, so a reload keeps it).
 */
export async function trainerQueue(
  db: Client,
  userId: string,
  opts: QueueOptions,
  store: ContentStore,
  settings: QuizSettings,
): Promise<TrainerQueue> {
  const includeLeeches = opts.includeLeeches || settings.includeLeeches;
  const [sched, introduced, reviewedRows] = await Promise.all([
    readSchedule(db, userId, store),
    introducedToday(db, userId, opts.today),
    db.execute({
      sql: `SELECT DISTINCT card_id FROM trainer_reviews
             WHERE user_id = ? AND deck = ? AND local_date = ? AND source = 'trainer' AND applied = 1`,
      args: [userId, QUIZ_DECK, opts.today],
    }),
  ]);
  const inScope = (domain: string) =>
    opts.domain !== undefined ? domain === opts.domain : !settings.excludeFromAll.includes(domain);
  const articles = eligibleArticles(store, settings).filter((a) => inScope(a.domain));
  const scopeFacts = new Set(articles.flatMap((a) => a.factIds));
  // A per-member order of the articles: random across members, stable for one.
  const newOrder = seededShuffle(articles, hashSeed(`${userId}:quiz`)).flatMap((a) => a.factIds);
  const articleOf = (id: string) => store.getFact(id)?.articleId ?? id;

  const queue = buildDailyQueue({
    due: sched.states.filter((s) => s.dueDate <= opts.today && scopeFacts.has(s.questionId)),
    seenIds: sched.seen,
    newOrder,
    newRemaining: settings.newFactsPerDay - introduced,
    limit: Number.MAX_SAFE_INTEGER,
    includeLeeches,
    articleOf,
    shuffleSeed: hashSeed(`${userId}:${opts.today}:${opts.domain ?? "all"}`),
    startedArticles: sched.started,
  });
  const counts = { learning: 0, review: 0, new: 0 };
  for (const it of queue) counts[it.tier]++;

  const items: TrainerQueueItem[] = [];
  for (const it of queue.slice(0, opts.limit)) {
    const fact = store.getFact(it.questionId);
    if (!fact) continue;
    items.push({
      questionId: it.questionId,
      articleId: fact.articleId,
      domain: fact.domain,
      tier: it.tier,
      state: it.state ? toWireState(it.state) : null,
      articleStarted: it.tier === "new" && sched.started.has(fact.articleId),
    });
  }
  // Facts studied today that the queue no longer holds: a sitting picked up
  // again later in the day counts on from them, not from zero.
  const queued = new Set(queue.map((it) => it.questionId));
  const doneToday = parseRows(
    CardRowSchema,
    reviewedRows.rows,
    "trainer_reviews.done-today",
  ).filter((r) => !queued.has(r.card_id) && scopeFacts.has(r.card_id)).length;
  return { today: opts.today, items, counts, doneToday };
}
