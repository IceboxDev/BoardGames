// Trainer persistence: the per-question schedule rows (`quiztopia_srs`),
// the append-only review log (`quiztopia_reviews`) and the settings row.
//
// The write path of a review (`recordReview`):
//   1. the question must exist in the content store and `localDate` must
//      sit inside [UTC today − 30 d, UTC today + 1 d] — the client is the
//      clock, but not an unbounded one;
//   2. a review whose `(user_id, client_id)` is already logged is a REPLAY
//      (offline queue flush, retried request): nothing is graded twice, the
//      current state comes back with `existed: true`;
//   3. otherwise the row is logged, then the schedule advances through the
//      shared `applyReview` under a compare-and-set on `reps`, retried once
//      when a concurrent grade of the same question won the race.
// Two kinds of review are logged with `applied = 0` and leave the schedule
// alone: a replay OLDER than the row's last review (an offline grade that
// arrived after a newer one), and a table-game answer while the member has
// not opted into `gameReviewsAffectSrs`.

import {
  applyReview,
  daysBetween,
  isLeech,
  newState,
  type SrsState,
} from "@boardgames/core/games/quiztopia/srs";
import {
  DEFAULT_QUIZTOPIA_SETTINGS,
  QuiztopiaLanguageSchema,
  type QuiztopiaSettings,
  QuiztopiaSettingsSchema,
  type ReviewBodySchema,
  SrsStateKindSchema,
  type SrsStateWire,
} from "@boardgames/core/protocol";
import type { Client } from "@libsql/client";
import { z } from "zod";
import { jsonColumn, parseRow, parseRows } from "../db-rows.ts";
import type { ContentStore } from "./content-store.ts";

// ── Row projections ────────────────────────────────────────────────────

export const SrsRowSchema = z.object({
  question_id: z.string(),
  category: z.number().int(),
  state: SrsStateKindSchema,
  ease: z.number(),
  interval_days: z.number().int(),
  due_date: z.string(),
  reps: z.number().int(),
  lapses: z.number().int(),
  last_reviewed_at: z.string().nullable(),
});
export type SrsRow = z.infer<typeof SrsRowSchema>;

export const SRS_COLUMNS =
  "question_id, category, state, ease, interval_days, due_date, reps, lapses, last_reviewed_at";

export function rowToState(row: SrsRow): SrsState {
  return {
    questionId: row.question_id,
    state: row.state,
    ease: row.ease,
    intervalDays: row.interval_days,
    dueDate: row.due_date,
    reps: row.reps,
    lapses: row.lapses,
    lastReviewedAt: row.last_reviewed_at,
  };
}

export function toWireState(state: SrsState): SrsStateWire {
  return { ...state, leech: isLeech(state) };
}

// ── State reads ────────────────────────────────────────────────────────

export async function readState(
  db: Client,
  userId: string,
  questionId: string,
): Promise<SrsState | null> {
  const { rows } = await db.execute({
    sql: `SELECT ${SRS_COLUMNS} FROM quiztopia_srs WHERE user_id = ? AND question_id = ?`,
    args: [userId, questionId],
  });
  if (rows.length === 0) return null;
  return rowToState(parseRow(SrsRowSchema, rows[0], "quiztopia_srs"));
}

const IN_CHUNK = 200;

export async function readStates(
  db: Client,
  userId: string,
  ids: readonly string[],
): Promise<Map<string, SrsState>> {
  const out = new Map<string, SrsState>();
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const chunk = ids.slice(i, i + IN_CHUNK);
    const { rows } = await db.execute({
      sql: `SELECT ${SRS_COLUMNS} FROM quiztopia_srs
             WHERE user_id = ? AND question_id IN (${chunk.map(() => "?").join(", ")})`,
      args: [userId, ...chunk],
    });
    for (const row of parseRows(SrsRowSchema, rows, "quiztopia_srs")) {
      out.set(row.question_id, rowToState(row));
    }
  }
  return out;
}

/** Every state row of the user (optionally one category), with its category. */
export async function readAllStates(
  db: Client,
  userId: string,
  opts: { category?: number; dueBy?: string } = {},
): Promise<{ category: number; state: SrsState }[]> {
  const where = ["user_id = ?"];
  const args: (string | number)[] = [userId];
  if (opts.category !== undefined) {
    where.push("category = ?");
    args.push(opts.category);
  }
  if (opts.dueBy !== undefined) {
    where.push("due_date <= ?");
    args.push(opts.dueBy);
  }
  const { rows } = await db.execute({
    sql: `SELECT ${SRS_COLUMNS} FROM quiztopia_srs WHERE ${where.join(" AND ")}`,
    args,
  });
  return parseRows(SrsRowSchema, rows, "quiztopia_srs").map((row) => ({
    category: row.category,
    state: rowToState(row),
  }));
}

// ── State write (CAS) ──────────────────────────────────────────────────

/**
 * Store `next` for the question. `expectReps` is the `reps` the caller
 * READ (null = no row yet); the write only lands if the row still holds
 * it, so two concurrent grades of one question can't overwrite each other.
 * Returns whether it landed.
 */
export async function upsertStateCas(
  db: Client,
  userId: string,
  category: number,
  next: SrsState,
  expectReps: number | null,
): Promise<boolean> {
  if (expectReps === null) {
    const res = await db.execute({
      sql: `INSERT OR IGNORE INTO quiztopia_srs
              (user_id, question_id, category, state, ease, interval_days, due_date, reps, lapses,
               last_reviewed_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      args: [
        userId,
        next.questionId,
        category,
        next.state,
        next.ease,
        next.intervalDays,
        next.dueDate,
        next.reps,
        next.lapses,
        next.lastReviewedAt,
      ],
    });
    return res.rowsAffected === 1;
  }
  const res = await db.execute({
    sql: `UPDATE quiztopia_srs
             SET state = ?, ease = ?, interval_days = ?, due_date = ?, reps = ?, lapses = ?,
                 last_reviewed_at = ?, updated_at = datetime('now')
           WHERE user_id = ? AND question_id = ? AND reps = ?`,
    args: [
      next.state,
      next.ease,
      next.intervalDays,
      next.dueDate,
      next.reps,
      next.lapses,
      next.lastReviewedAt,
      userId,
      next.questionId,
      expectReps,
    ],
  });
  return res.rowsAffected === 1;
}

// ── Review write path ──────────────────────────────────────────────────

export const LOCAL_DATE_PAST_DAYS = 30;
export const LOCAL_DATE_FUTURE_DAYS = 1;

/** `localDate` within [UTC today − 30 d, UTC today + 1 d] at `nowIso`. */
export function localDateInWindow(localDate: string, nowIso: string): boolean {
  const delta = daysBetween(nowIso.slice(0, 10), localDate);
  return delta >= -LOCAL_DATE_PAST_DAYS && delta <= LOCAL_DATE_FUTURE_DAYS;
}

export type ReviewRejection = "UNKNOWN_QUESTION" | "DATE_OUT_OF_RANGE";

export class ReviewRejectedError extends Error {
  constructor(
    public readonly code: ReviewRejection,
    message: string,
  ) {
    super(message);
    this.name = "ReviewRejectedError";
  }
}

export type ReviewInput = z.output<typeof ReviewBodySchema>;

export interface RecordReviewResult {
  /** The `clientId` was already logged; nothing was graded. */
  existed: boolean;
  /** The schedule row advanced (false for replays, stale or opted-out game grades). */
  applied: boolean;
  /** The question's state after this call (null when it has never been graded). */
  state: SrsState | null;
  /** This is the user's first trainer review logged for `localDate`. */
  firstOfDay: boolean;
}

const ReviewFlagsRowSchema = z.object({ applied: z.number().int() });

async function findLoggedReview(
  db: Client,
  userId: string,
  clientId: string,
): Promise<{ applied: boolean } | null> {
  const { rows } = await db.execute({
    sql: "SELECT applied FROM quiztopia_reviews WHERE user_id = ? AND client_id = ?",
    args: [userId, clientId],
  });
  if (rows.length === 0) return null;
  return { applied: parseRow(ReviewFlagsRowSchema, rows[0], "quiztopia_reviews").applied === 1 };
}

export async function recordReview(
  db: Client,
  userId: string,
  body: ReviewInput,
  store: ContentStore,
  opts: { now?: Date } = {},
): Promise<RecordReviewResult> {
  const question = store.getQuestion(body.questionId);
  if (!question) {
    throw new ReviewRejectedError("UNKNOWN_QUESTION", `unknown question ${body.questionId}`);
  }
  const now = opts.now ?? new Date();
  const nowIso = now.toISOString();
  if (!localDateInWindow(body.localDate, nowIso)) {
    throw new ReviewRejectedError(
      "DATE_OUT_OF_RANGE",
      `localDate ${body.localDate} is outside the accepted window around ${nowIso.slice(0, 10)}`,
    );
  }
  const reviewedAt = body.reviewedAt ? new Date(body.reviewedAt).toISOString() : nowIso;

  const logged = await findLoggedReview(db, userId, body.clientId);
  if (logged) {
    return {
      existed: true,
      applied: logged.applied,
      state: await readState(db, userId, body.questionId),
      firstOfDay: false,
    };
  }

  const prev = await readState(db, userId, body.questionId);
  let apply = true;
  if (body.source === "game") {
    apply = (await readSettings(db, userId)).gameReviewsAffectSrs;
  }
  if (apply && prev?.lastReviewedAt && reviewedAt < prev.lastReviewedAt) {
    apply = false; // an older grade arriving after a newer one
  }
  const prevState = prev?.state ?? "new";

  const inserted = await db.execute({
    sql: `INSERT OR IGNORE INTO quiztopia_reviews
            (user_id, client_id, question_id, category, grade, prev_state, source, applied,
             reviewed_at, local_date, duration_ms, room_code)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      userId,
      body.clientId,
      body.questionId,
      question.n,
      body.grade,
      prevState,
      body.source,
      apply ? 1 : 0,
      reviewedAt,
      body.localDate,
      body.durationMs ?? null,
      body.roomCode ?? null,
    ],
  });
  if (inserted.rowsAffected === 0) {
    // Lost a same-clientId race to a concurrent request: that one graded.
    const winner = await findLoggedReview(db, userId, body.clientId);
    return {
      existed: true,
      applied: winner?.applied ?? false,
      state: await readState(db, userId, body.questionId),
      firstOfDay: false,
    };
  }

  let firstOfDay = false;
  if (body.source === "trainer") {
    const { rows } = await db.execute({
      sql: `SELECT 1 FROM quiztopia_reviews
             WHERE user_id = ? AND local_date = ? AND source = 'trainer' AND client_id <> ?
             LIMIT 1`,
      args: [userId, body.localDate, body.clientId],
    });
    firstOfDay = rows.length === 0;
  }
  if (!apply) return { existed: false, applied: false, state: prev, firstOfDay };

  let base = prev;
  for (let attempt = 0; attempt < 2; attempt++) {
    const from = base ?? newState(body.questionId, body.localDate);
    const next = applyReview(from, body.grade, { localDate: body.localDate, now: reviewedAt });
    const landed = await upsertStateCas(db, userId, question.n, next, base ? base.reps : null);
    if (landed) {
      if (from.state !== prevState) {
        // The retry graded from a state another request moved; keep the log honest.
        await db.execute({
          sql: "UPDATE quiztopia_reviews SET prev_state = ? WHERE user_id = ? AND client_id = ?",
          args: [from.state, userId, body.clientId],
        });
      }
      return { existed: false, applied: true, state: next, firstOfDay };
    }
    base = await readState(db, userId, body.questionId);
  }
  throw new Error(`quiztopia review ${body.clientId}: lost the state race twice`);
}

// ── Settings ───────────────────────────────────────────────────────────

const SettingsJsonSchema = QuiztopiaSettingsSchema.pick({
  newPerDayByCategory: true,
  includeLeeches: true,
  gameReviewsAffectSrs: true,
  newCardOrder: true,
});

const SettingsRowSchema = z.object({
  language: QuiztopiaLanguageSchema,
  new_per_day: z.number().int(),
  settings_json: jsonColumn(SettingsJsonSchema),
});

export async function readSettings(db: Client, userId: string): Promise<QuiztopiaSettings> {
  const { rows } = await db.execute({
    sql: "SELECT language, new_per_day, settings_json FROM quiztopia_settings WHERE user_id = ?",
    args: [userId],
  });
  if (rows.length === 0) return DEFAULT_QUIZTOPIA_SETTINGS;
  const row = parseRow(SettingsRowSchema, rows[0], "quiztopia_settings");
  return QuiztopiaSettingsSchema.parse({
    language: row.language,
    newPerDay: row.new_per_day,
    ...row.settings_json,
  });
}

export async function writeSettings(
  db: Client,
  userId: string,
  settings: QuiztopiaSettings,
): Promise<void> {
  const json = JSON.stringify(
    SettingsJsonSchema.parse({
      newPerDayByCategory: settings.newPerDayByCategory,
      includeLeeches: settings.includeLeeches,
      gameReviewsAffectSrs: settings.gameReviewsAffectSrs,
      newCardOrder: settings.newCardOrder,
    }),
  );
  await db.execute({
    sql: `INSERT INTO quiztopia_settings (user_id, language, new_per_day, settings_json, updated_at)
          VALUES (?, ?, ?, ?, datetime('now'))
          ON CONFLICT(user_id) DO UPDATE SET
            language = excluded.language,
            new_per_day = excluded.new_per_day,
            settings_json = excluded.settings_json,
            updated_at = excluded.updated_at`,
    args: [userId, settings.language, settings.newPerDay, json],
  });
}

/** The daily new-card cap for category `n`: the per-category override or the default. */
export function newPerDayFor(settings: QuiztopiaSettings, n: number): number {
  return settings.newPerDayByCategory[String(n)] ?? settings.newPerDay;
}
