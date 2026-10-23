// Quiz trainer, wiki and search — `/api/trainers/quiz/*`.
//
//   GET  /trainer/overview?today=        hub: streak, today's budget, one tile per domain
//   GET  /trainer/queue?today=&domain=   today's study queue
//   GET  /trainer/states?ids=            states for an explicit id list
//   POST /trainer/reviews                grade one fact (201; 200 on replay)
//   POST /trainer/reviews/bulk           offline replay / game-over posting
//   GET  /trainer/history?today=&days=   per-day counts for the heatmap
//   GET  /trainer/pins                   every studied fact (the personal timeline)
//   GET  /settings, PUT /settings
//   GET  /search?q=&lang=&domain=
//   GET  /articles/:id/history           an article's changelog + its retired facts
//   POST /wiki/reads, DELETE /wiki/reads, GET /wiki/reads
//   GET  /journal?before=&days=&tz=      day-by-day studied facts and reads
//   POST /reports                        report a problem with a question or article
//   GET  /reports/mine, POST /reports/mine/seen, DELETE /reports/:id
//   GET  /games/recent-misses
//
// The client is the clock: every read carries its local `today`, every
// write its `localDate`. The content store is the authority on which facts
// and articles exist; the DB only ever holds ids.

import {
  ArticleHistoryParamSchema,
  ArticleHistoryResponseSchema,
  BulkReviewsBodySchema,
  BulkReviewsResponseSchema,
  CreateReportBodySchema,
  CreateReportResponseSchema,
  JournalQuerySchema,
  JournalResponseSchema,
  MarkReportsSeenBodySchema,
  MyReportsResponseSchema,
  QuizSettingsSchema,
  type RecentMisses,
  RecentMissesQuerySchema,
  RecentMissesResponseSchema,
  ReportIdParamSchema,
  ReviewBodySchema,
  ReviewResponseSchema,
  SearchQuerySchema,
  SearchResponseSchema,
  SrsStateKindSchema,
  type SrsStateWire,
  TimelinePinsResponseSchema,
  TrainerHistoryQuerySchema,
  TrainerHistoryResponseSchema,
  TrainerOverviewQuerySchema,
  TrainerOverviewResponseSchema,
  TrainerQueueQuerySchema,
  TrainerQueueResponseSchema,
  TrainerResetBodySchema,
  TrainerResetResponseSchema,
  TrainerStatesQuerySchema,
  TrainerStatesResponseSchema,
  WikiReadBodySchema,
  WikiReadsResponseSchema,
} from "@boardgames/core/protocol";
import { timelineSummary } from "@boardgames/core/quiz/timeline";
import type { Client } from "@libsql/client";
import { z } from "zod";
import { authedApp } from "../auth/index.ts";
import { getDb } from "../db.ts";
import { logActivity, settingsChanges } from "../lib/activity-log.ts";
import { parseRows } from "../lib/db-rows.ts";
import { errorResponse, zJsonBody, zQuery } from "../lib/error-response.ts";
import { getContentStore } from "../lib/quiz/content-store.ts";
import { InvalidTimeZoneError, readJournal } from "../lib/quiz/journal.ts";
import {
  createOrUpdateReport,
  markSeen,
  myReports,
  ReportTargetNotFoundError,
  withdrawReport,
} from "../lib/quiz/reports.ts";
import {
  QUIZ_DECK,
  readSettings,
  recordReview,
  resetProgress,
  toWireState,
  writeSettings,
} from "../lib/quiz/srs-db.ts";
import { trainerHistory, trainerOverview, trainerQueue } from "../lib/quiz/stats.ts";
import { type DeckReviewResult, readDeckStates } from "../lib/trainers/deck-db.ts";
import { ReviewRejectedError } from "../lib/trainers/review-guards.ts";

export const quizRoutes = authedApp();

const RECENT_MISS_DAYS = 60;

const WikiReadRowSchema = z.object({ article_id: z.string(), read_at: z.string() });
const PinRowSchema = z.object({
  card_id: z.string(),
  state: SrsStateKindSchema,
  last_reviewed_at: z.string().nullable(),
});
const MissRowSchema = z.object({
  card_id: z.string(),
  reviewed_at: z.string(),
  outcome_json: z.string(),
});
const MissOutcomeSchema = z.object({ roomCode: z.string().optional() });

/** Re-marking an article within this long counts as the same read in the log. */
const READ_LOG_DEDUPE_MS = 10 * 60_000;

async function wikiReads(db: Client, userId: string) {
  const { rows } = await db.execute({
    sql: "SELECT article_id, read_at FROM quiz_wiki_reads WHERE user_id = ? ORDER BY read_at DESC",
    args: [userId],
  });
  return WikiReadsResponseSchema.parse({
    reads: parseRows(WikiReadRowSchema, rows, "quiz_wiki_reads").map((r) => ({
      articleId: r.article_id,
      readAt: r.read_at,
    })),
  });
}

function noteTrainerDay(userId: string, result: DeckReviewResult, localDate: string): void {
  if (result.firstOfDay) logActivity(userId, "quiz-train", { localDate });
}

// ── Trainer ────────────────────────────────────────────────────────────

quizRoutes.get("/trainer/overview", zQuery(TrainerOverviewQuerySchema), async (c) => {
  const user = c.get("user");
  const { today } = c.req.valid("query");
  const db = getDb();
  const store = getContentStore();
  const settings = await readSettings(db, user.id);
  const overview = await trainerOverview(db, user.id, today, store, settings);
  return c.json(TrainerOverviewResponseSchema.parse(overview));
});

quizRoutes.get("/trainer/queue", zQuery(TrainerQueueQuerySchema), async (c) => {
  const user = c.get("user");
  const { today, domain, limit, includeLeeches } = c.req.valid("query");
  const db = getDb();
  const store = getContentStore();
  const settings = await readSettings(db, user.id);
  const queue = await trainerQueue(
    db,
    user.id,
    { today, domain, limit, includeLeeches },
    store,
    settings,
  );
  return c.json(TrainerQueueResponseSchema.parse(queue));
});

quizRoutes.get("/trainer/states", zQuery(TrainerStatesQuerySchema), async (c) => {
  const user = c.get("user");
  const { ids } = c.req.valid("query");
  const wanted = new Set(ids);
  const states = (await readDeckStates(getDb(), user.id, QUIZ_DECK)).filter((s) =>
    wanted.has(s.questionId),
  );
  return c.json(TrainerStatesResponseSchema.parse({ states: states.map(toWireState) }));
});

quizRoutes.post("/trainer/reviews", zJsonBody(ReviewBodySchema), async (c) => {
  const user = c.get("user");
  const body = c.req.valid("json");
  let result: DeckReviewResult;
  try {
    result = await recordReview(getDb(), user.id, body, getContentStore());
  } catch (err) {
    if (err instanceof ReviewRejectedError) {
      return err.code === "UNKNOWN_QUESTION"
        ? errorResponse(c, 404, "fact not found", "NOT_FOUND")
        : errorResponse(c, 400, err.message, "BAD_REQUEST");
    }
    throw err;
  }
  noteTrainerDay(user.id, result, body.localDate);
  return c.json(
    ReviewResponseSchema.parse({
      ok: true,
      existed: result.existed,
      applied: result.applied,
      state: result.state ? toWireState(result.state) : null,
    }),
    result.existed ? 200 : 201,
  );
});

quizRoutes.post("/trainer/reviews/bulk", zJsonBody(BulkReviewsBodySchema), async (c) => {
  const user = c.get("user");
  const { reviews } = c.req.valid("json");
  const db = getDb();
  const store = getContentStore();
  let applied = 0;
  let skipped = 0;
  const states = new Map<string, SrsStateWire>();
  for (const review of reviews) {
    try {
      const result = await recordReview(db, user.id, review, store);
      noteTrainerDay(user.id, result, review.localDate);
      if (result.applied && !result.existed) applied++;
      else skipped++;
      if (result.state) states.set(review.questionId, toWireState(result.state));
    } catch (err) {
      if (!(err instanceof ReviewRejectedError)) throw err;
      skipped++;
    }
  }
  return c.json(
    BulkReviewsResponseSchema.parse({ ok: true, applied, skipped, states: [...states.values()] }),
  );
});

quizRoutes.get("/trainer/history", zQuery(TrainerHistoryQuerySchema), async (c) => {
  const user = c.get("user");
  const { today, days } = c.req.valid("query");
  const history = await trainerHistory(getDb(), user.id, today, days);
  return c.json(TrainerHistoryResponseSchema.parse(history));
});

// Every schedule row is a pin: a fact enters the schedule the first time it
// is graded. Ids the current content no longer knows are dropped.
quizRoutes.get("/trainer/pins", async (c) => {
  const user = c.get("user");
  const store = getContentStore();
  const { rows } = await getDb().execute({
    sql: `SELECT card_id, state, last_reviewed_at FROM trainer_srs
           WHERE user_id = ? AND deck = ? AND reps > 0
           ORDER BY card_id`,
    args: [user.id, QUIZ_DECK],
  });
  const pins = parseRows(PinRowSchema, rows, "trainer_srs.pins")
    .filter((r) => store.hasFact(r.card_id))
    .map((r) => ({
      questionId: r.card_id,
      state: r.state,
      known: r.state === "review",
      lastReviewedAt: r.last_reviewed_at,
    }));
  const summary = timelineSummary(
    pins.flatMap((p) => {
      const timeline = store.getFact(p.questionId)?.timeline;
      return timeline ? [timeline] : [];
    }),
  );
  return c.json(TimelinePinsResponseSchema.parse({ pins, summary }));
});

// ── Settings ───────────────────────────────────────────────────────────

quizRoutes.get("/settings", async (c) => {
  const user = c.get("user");
  return c.json(QuizSettingsSchema.parse(await readSettings(getDb(), user.id)));
});

quizRoutes.put("/settings", zJsonBody(QuizSettingsSchema), async (c) => {
  const user = c.get("user");
  const settings = c.req.valid("json");
  const db = getDb();
  const before = await readSettings(db, user.id);
  await writeSettings(db, user.id, settings);
  // Log what the save changed; a no-op save (the stepper settling on the
  // stored value) is not activity.
  const changes = settingsChanges(before, settings);
  if (Object.keys(changes).length > 0) logActivity(user.id, "quiz-settings", { changes });
  return c.json(QuizSettingsSchema.parse(settings));
});

// ── Reset ──────────────────────────────────────────────────────────────

quizRoutes.post("/trainer/reset", zJsonBody(TrainerResetBodySchema), async (c) => {
  const user = c.get("user");
  const deleted = await resetProgress(getDb(), user.id);
  logActivity(user.id, "quiz-reset", deleted);
  return c.json(TrainerResetResponseSchema.parse({ ok: true, deleted }));
});

// ── Search ─────────────────────────────────────────────────────────────

quizRoutes.get("/search", zQuery(SearchQuerySchema), (c) => {
  const { q, lang, limit, domain } = c.req.valid("query");
  const hits = getContentStore()
    .search({ q, lang, limit, domain })
    .map(({ factId, ...hit }) => ({ ...hit, questionId: factId }));
  return c.json(SearchResponseSchema.parse({ hits }));
});

// ── Article history ────────────────────────────────────────────────────
// Content, not progress: the same for every member. The history file is read
// on demand (never bundled into the web); retired facts come from the article.

quizRoutes.get("/articles/:id/history", async (c) => {
  const parsed = ArticleHistoryParamSchema.safeParse({ id: c.req.param("id") });
  if (!parsed.success) return errorResponse(c, 400, "bad article id", "BAD_REQUEST");
  const store = getContentStore();
  const [article, history] = await Promise.all([
    store.getArticle(parsed.data.id),
    store.getHistory(parsed.data.id),
  ]);
  if (!article || !history) return errorResponse(c, 404, "article not found", "NOT_FOUND");
  const retired = (article.retired ?? []).map((f) => {
    const lead = f.wordings[0];
    return {
      id: f.id,
      answerEn: f.answerEn,
      answerDe: f.answerDe,
      ...(f.answerRu ? { answerRu: f.answerRu } : {}),
      questionEn: lead.en,
      questionDe: lead.de,
      ...(lead.ru ? { questionRu: lead.ru } : {}),
      wordingIds: f.wordings.map((w) => w.id),
      retired: f.retired,
    };
  });
  return c.json(
    ArticleHistoryResponseSchema.parse({
      articleId: article.id,
      entries: history.entries,
      retired,
    }),
  );
});

// ── Wiki reads ─────────────────────────────────────────────────────────

quizRoutes.post("/wiki/reads", zJsonBody(WikiReadBodySchema), async (c) => {
  const user = c.get("user");
  const { articleId } = c.req.valid("json");
  if (!getContentStore().getArticleMeta(articleId)) {
    return errorResponse(c, 404, "article not found", "NOT_FOUND");
  }
  const db = getDb();
  const now = new Date();
  const readAt = now.toISOString();
  const dedupeSince = new Date(now.getTime() - READ_LOG_DEDUPE_MS).toISOString();
  await db.batch(
    [
      {
        sql: `INSERT INTO quiz_wiki_reads (user_id, article_id, read_at)
              VALUES (?, ?, ?)
              ON CONFLICT(user_id, article_id) DO UPDATE SET read_at = excluded.read_at`,
        args: [user.id, articleId, readAt],
      },
      // The journal's log of every read — one entry per sitting: a re-mark
      // of the same article within a few minutes is the same read.
      {
        sql: `INSERT INTO quiz_wiki_read_log (user_id, article_id, read_at)
              SELECT ?, ?, ?
               WHERE NOT EXISTS (SELECT 1 FROM quiz_wiki_read_log
                                  WHERE user_id = ? AND article_id = ? AND read_at > ?)`,
        args: [user.id, articleId, readAt, user.id, articleId, dedupeSince],
      },
    ],
    "write",
  );
  return c.json(await wikiReads(db, user.id));
});

// Unmark: a read marked by mistake (a stray tap, the auto-mark firing on a
// skim). Idempotent — an article that isn't marked stays unmarked.
quizRoutes.delete("/wiki/reads", zJsonBody(WikiReadBodySchema), async (c) => {
  const user = c.get("user");
  const { articleId } = c.req.valid("json");
  const db = getDb();
  await db.batch(
    [
      // The mistaken read is the newest log entry — only while the article
      // is still marked, so a repeated unmark never eats an earlier read.
      {
        sql: `DELETE FROM quiz_wiki_read_log
               WHERE id = (SELECT id FROM quiz_wiki_read_log
                            WHERE user_id = ? AND article_id = ?
                            ORDER BY read_at DESC, id DESC LIMIT 1)
                 AND EXISTS (SELECT 1 FROM quiz_wiki_reads WHERE user_id = ? AND article_id = ?)`,
        args: [user.id, articleId, user.id, articleId],
      },
      {
        sql: "DELETE FROM quiz_wiki_reads WHERE user_id = ? AND article_id = ?",
        args: [user.id, articleId],
      },
    ],
    "write",
  );
  return c.json(await wikiReads(db, user.id));
});

quizRoutes.get("/wiki/reads", async (c) => {
  const user = c.get("user");
  return c.json(await wikiReads(getDb(), user.id));
});

// ── Journal ────────────────────────────────────────────────────────────

quizRoutes.get("/journal", zQuery(JournalQuerySchema), async (c) => {
  const user = c.get("user");
  const { before, days, tz } = c.req.valid("query");
  try {
    const db = getDb();
    const settings = await readSettings(db, user.id);
    const journal = await readJournal(db, getContentStore(), user.id, {
      before,
      days,
      timeZone: tz,
      sources: settings.sources,
    });
    return c.json(JournalResponseSchema.parse(journal));
  } catch (err) {
    if (err instanceof InvalidTimeZoneError)
      return errorResponse(c, 400, err.message, "BAD_REQUEST");
    throw err;
  }
});

// ── Content reports ────────────────────────────────────────────────────
// A member's own reports only; the admin queue is admin-quiz-reports.ts.

quizRoutes.post("/reports", zJsonBody(CreateReportBodySchema), async (c) => {
  const user = c.get("user");
  const body = c.req.valid("json");
  try {
    const result = await createOrUpdateReport(getDb(), getContentStore(), user.id, body);
    if (!result.updated) {
      logActivity(user.id, "quiz-report", { targetId: body.target.id, issue: body.issue });
    }
    return c.json(CreateReportResponseSchema.parse(result), result.updated ? 200 : 201);
  } catch (err) {
    if (err instanceof ReportTargetNotFoundError) {
      return errorResponse(c, 404, "question or article not found", "NOT_FOUND");
    }
    throw err;
  }
});

quizRoutes.get("/reports/mine", async (c) => {
  const user = c.get("user");
  return c.json(
    MyReportsResponseSchema.parse(await myReports(getDb(), getContentStore(), user.id)),
  );
});

quizRoutes.post("/reports/mine/seen", zJsonBody(MarkReportsSeenBodySchema), async (c) => {
  const user = c.get("user");
  const { ids } = c.req.valid("json");
  const db = getDb();
  await markSeen(db, user.id, ids);
  return c.json(MyReportsResponseSchema.parse(await myReports(db, getContentStore(), user.id)));
});

quizRoutes.delete("/reports/:id", async (c) => {
  const user = c.get("user");
  const parsed = ReportIdParamSchema.safeParse({ id: c.req.param("id") });
  if (!parsed.success) return errorResponse(c, 400, "bad report id", "BAD_REQUEST");
  const db = getDb();
  if (!(await withdrawReport(db, user.id, parsed.data.id))) {
    return errorResponse(c, 404, "no open report of yours with that id", "NOT_FOUND");
  }
  return c.json(MyReportsResponseSchema.parse(await myReports(db, getContentStore(), user.id)));
});

// ── Game misses ────────────────────────────────────────────────────────

quizRoutes.get("/games/recent-misses", zQuery(RecentMissesQuerySchema), async (c) => {
  const user = c.get("user");
  const { limit } = c.req.valid("query");
  const store = getContentStore();
  const cutoff = new Date(Date.now() - RECENT_MISS_DAYS * 86_400_000).toISOString();
  const { rows } = await getDb().execute({
    sql: `SELECT card_id, reviewed_at, outcome_json FROM trainer_reviews
           WHERE user_id = ? AND deck = ? AND source = 'game' AND grade = 'again'
             AND reviewed_at >= ?
           ORDER BY id DESC`,
    args: [user.id, QUIZ_DECK, cutoff],
  });
  // Newest miss first; one entry per question carrying its latest room and the tally.
  const byQuestion = new Map<
    string,
    { reviewedAt: string; roomCode: string | null; missCount: number }
  >();
  for (const r of parseRows(MissRowSchema, rows, "trainer_reviews.misses")) {
    const prev = byQuestion.get(r.card_id);
    if (prev) prev.missCount++;
    else {
      let roomCode: string | null = null;
      try {
        roomCode = MissOutcomeSchema.parse(JSON.parse(r.outcome_json)).roomCode ?? null;
      } catch {}
      byQuestion.set(r.card_id, { reviewedAt: r.reviewed_at, roomCode, missCount: 1 });
    }
  }
  const misses: RecentMisses["misses"] = [];
  for (const [questionId, m] of byQuestion) {
    if (misses.length >= limit) break;
    const q = store.getFact(questionId);
    if (!q) continue;
    misses.push({ questionId, articleId: q.articleId, domain: q.domain, ...m });
  }
  return c.json(RecentMissesResponseSchema.parse({ misses }));
});
