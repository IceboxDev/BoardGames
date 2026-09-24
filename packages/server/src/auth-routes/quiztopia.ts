// Quiztopia trainer, wiki and search — `/api/quiztopia/*`.
//
//   GET  /trainer/overview?today=        hub: streak, today, 12 category tiles
//   GET  /trainer/queue?today=&category= today's study queue
//   GET  /trainer/states?ids=            states for an explicit id list
//   POST /trainer/reviews                grade one question (201; 200 on replay)
//   POST /trainer/reviews/bulk           offline replay / game-over posting
//   GET  /trainer/history?today=&days=   per-day counts for the heatmap
//   GET  /settings, PUT /settings
//   GET  /search?q=&lang=&category=
//   POST /wiki/reads, GET /wiki/reads
//   GET  /games/recent-misses
//
// The client is the clock: every read carries its local `today`, every
// write its `localDate`. The content store is the authority on which
// questions exist; the DB only ever holds ids.

import {
  BulkReviewsBodySchema,
  BulkReviewsResponseSchema,
  QuiztopiaSettingsSchema,
  type RecentMisses,
  RecentMissesQuerySchema,
  RecentMissesResponseSchema,
  ReviewBodySchema,
  ReviewResponseSchema,
  SearchQuerySchema,
  SearchResponseSchema,
  type SrsStateWire,
  TrainerHistoryQuerySchema,
  TrainerHistoryResponseSchema,
  TrainerOverviewQuerySchema,
  TrainerOverviewResponseSchema,
  TrainerQueueQuerySchema,
  TrainerQueueResponseSchema,
  TrainerStatesQuerySchema,
  TrainerStatesResponseSchema,
  WikiReadBodySchema,
  WikiReadsResponseSchema,
} from "@boardgames/core/protocol";
import type { Client } from "@libsql/client";
import { z } from "zod";
import { authedApp } from "../auth/index.ts";
import { getDb } from "../db.ts";
import { logActivity } from "../lib/activity-log.ts";
import { parseRows } from "../lib/db-rows.ts";
import { errorResponse, zJsonBody, zQuery } from "../lib/error-response.ts";
import { getContentStore } from "../lib/quiztopia/content-store.ts";
import {
  type RecordReviewResult,
  ReviewRejectedError,
  readSettings,
  readStates,
  recordReview,
  toWireState,
  writeSettings,
} from "../lib/quiztopia/srs-db.ts";
import { trainerHistory, trainerOverview, trainerQueue } from "../lib/quiztopia/stats.ts";

export const quiztopiaRoutes = authedApp();

const RECENT_MISS_DAYS = 60;

const WikiReadRowSchema = z.object({ set_id: z.string(), read_at: z.string() });
const MissRowSchema = z.object({
  question_id: z.string(),
  reviewed_at: z.string(),
  room_code: z.string().nullable(),
});

async function wikiReads(db: Client, userId: string) {
  const { rows } = await db.execute({
    sql: "SELECT set_id, read_at FROM quiztopia_wiki_reads WHERE user_id = ? ORDER BY read_at DESC",
    args: [userId],
  });
  return WikiReadsResponseSchema.parse({
    reads: parseRows(WikiReadRowSchema, rows, "quiztopia_wiki_reads").map((r) => ({
      setId: r.set_id,
      readAt: r.read_at,
    })),
  });
}

function noteTrainerDay(userId: string, result: RecordReviewResult, localDate: string): void {
  if (result.firstOfDay) logActivity(userId, "quiztopia-train", { localDate });
}

// ── Trainer ────────────────────────────────────────────────────────────

quiztopiaRoutes.get("/trainer/overview", zQuery(TrainerOverviewQuerySchema), async (c) => {
  const user = c.get("user");
  const { today } = c.req.valid("query");
  const db = getDb();
  const store = getContentStore();
  const settings = await readSettings(db, user.id);
  const overview = await trainerOverview(db, user.id, today, store, settings);
  return c.json(TrainerOverviewResponseSchema.parse(overview));
});

quiztopiaRoutes.get("/trainer/queue", zQuery(TrainerQueueQuerySchema), async (c) => {
  const user = c.get("user");
  const { today, category, limit, includeLeeches } = c.req.valid("query");
  const db = getDb();
  const store = getContentStore();
  const settings = await readSettings(db, user.id);
  const queue = await trainerQueue(
    db,
    user.id,
    { today, category, limit, includeLeeches },
    store,
    settings,
  );
  return c.json(TrainerQueueResponseSchema.parse(queue));
});

quiztopiaRoutes.get("/trainer/states", zQuery(TrainerStatesQuerySchema), async (c) => {
  const user = c.get("user");
  const { ids } = c.req.valid("query");
  const states = await readStates(getDb(), user.id, ids);
  return c.json(
    TrainerStatesResponseSchema.parse({
      states: ids.flatMap((id) => {
        const s = states.get(id);
        return s ? [toWireState(s)] : [];
      }),
    }),
  );
});

quiztopiaRoutes.post("/trainer/reviews", zJsonBody(ReviewBodySchema), async (c) => {
  const user = c.get("user");
  const body = c.req.valid("json");
  let result: RecordReviewResult;
  try {
    result = await recordReview(getDb(), user.id, body, getContentStore());
  } catch (err) {
    if (err instanceof ReviewRejectedError) {
      return err.code === "UNKNOWN_QUESTION"
        ? errorResponse(c, 404, "question not found", "NOT_FOUND")
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

quiztopiaRoutes.post("/trainer/reviews/bulk", zJsonBody(BulkReviewsBodySchema), async (c) => {
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

quiztopiaRoutes.get("/trainer/history", zQuery(TrainerHistoryQuerySchema), async (c) => {
  const user = c.get("user");
  const { today, days } = c.req.valid("query");
  const history = await trainerHistory(getDb(), user.id, today, days);
  return c.json(TrainerHistoryResponseSchema.parse(history));
});

// ── Settings ───────────────────────────────────────────────────────────

quiztopiaRoutes.get("/settings", async (c) => {
  const user = c.get("user");
  return c.json(QuiztopiaSettingsSchema.parse(await readSettings(getDb(), user.id)));
});

quiztopiaRoutes.put("/settings", zJsonBody(QuiztopiaSettingsSchema), async (c) => {
  const user = c.get("user");
  const settings = c.req.valid("json");
  await writeSettings(getDb(), user.id, settings);
  logActivity(user.id, "quiztopia-settings", {
    language: settings.language,
    newPerDay: settings.newPerDay,
    gameReviewsAffectSrs: settings.gameReviewsAffectSrs,
  });
  return c.json(QuiztopiaSettingsSchema.parse(settings));
});

// ── Search ─────────────────────────────────────────────────────────────

quiztopiaRoutes.get("/search", zQuery(SearchQuerySchema), (c) => {
  const { q, lang, limit, category } = c.req.valid("query");
  const hits = getContentStore().search({ q, lang, limit, category });
  return c.json(SearchResponseSchema.parse({ hits }));
});

// ── Wiki reads ─────────────────────────────────────────────────────────

quiztopiaRoutes.post("/wiki/reads", zJsonBody(WikiReadBodySchema), async (c) => {
  const user = c.get("user");
  const { setId } = c.req.valid("json");
  if (!getContentStore().getTitles(setId)) {
    return errorResponse(c, 404, "article not found", "NOT_FOUND");
  }
  const db = getDb();
  await db.execute({
    sql: `INSERT INTO quiztopia_wiki_reads (user_id, set_id, read_at)
          VALUES (?, ?, ?)
          ON CONFLICT(user_id, set_id) DO UPDATE SET read_at = excluded.read_at`,
    args: [user.id, setId, new Date().toISOString()],
  });
  return c.json(await wikiReads(db, user.id));
});

quiztopiaRoutes.get("/wiki/reads", async (c) => {
  const user = c.get("user");
  return c.json(await wikiReads(getDb(), user.id));
});

// ── Game misses ────────────────────────────────────────────────────────

quiztopiaRoutes.get("/games/recent-misses", zQuery(RecentMissesQuerySchema), async (c) => {
  const user = c.get("user");
  const { limit } = c.req.valid("query");
  const store = getContentStore();
  const cutoff = new Date(Date.now() - RECENT_MISS_DAYS * 86_400_000).toISOString();
  const { rows } = await getDb().execute({
    sql: `SELECT question_id, reviewed_at, room_code FROM quiztopia_reviews
           WHERE user_id = ? AND source = 'game' AND grade = 'again' AND reviewed_at >= ?
           ORDER BY id DESC`,
    args: [user.id, cutoff],
  });
  // Newest miss first; one entry per question carrying its latest room and the tally.
  const byQuestion = new Map<
    string,
    { reviewedAt: string; roomCode: string | null; missCount: number }
  >();
  for (const r of parseRows(MissRowSchema, rows, "quiztopia_reviews.misses")) {
    const prev = byQuestion.get(r.question_id);
    if (prev) prev.missCount++;
    else
      byQuestion.set(r.question_id, {
        reviewedAt: r.reviewed_at,
        roomCode: r.room_code,
        missCount: 1,
      });
  }
  const misses: RecentMisses["misses"] = [];
  for (const [questionId, m] of byQuestion) {
    if (misses.length >= limit) break;
    const q = store.getQuestion(questionId);
    if (!q) continue;
    misses.push({ questionId, setId: q.setId, cardId: q.cardId, category: q.n, ...m });
  }
  return c.json(RecentMissesResponseSchema.parse({ misses }));
});
