// Persistence for the generic trainer decks (migration 0043): schedule rows
// in `trainer_srs`, the append-only log in `trainer_reviews`, one settings
// blob per deck in `trainer_settings`. The write path mirrors Quiztopia's
// (`lib/quiztopia/srs-db.ts`): the card must exist in the deck and the
// client's `localDate` must be plausible; a replayed `clientId` grades
// nothing; the schedule advances through the shared `applyReview` under a
// compare-and-set on `reps`. Two kinds of review are logged with
// `applied = 0`: a replay older than the card's last review, and a drill
// answer on a card that was not due.

import { SrsStateKindSchema } from "@boardgames/core/protocol";
import {
  applyReview,
  computeStreak,
  newState,
  type SrsGrade,
  type SrsState,
} from "@boardgames/core/trainers/srs";
import type { Client } from "@libsql/client";
import { z } from "zod";
import { parseRow, parseRows } from "../db-rows.ts";
import { localDateInWindow, ReviewRejectedError } from "../quiztopia/srs-db.ts";

const StateRowSchema = z.object({
  card_id: z.string(),
  state: SrsStateKindSchema,
  ease: z.number(),
  interval_days: z.number().int(),
  due_date: z.string(),
  reps: z.number().int(),
  lapses: z.number().int(),
  last_reviewed_at: z.string().nullable(),
});
type StateRow = z.infer<typeof StateRowSchema>;

const COLUMNS = "card_id, state, ease, interval_days, due_date, reps, lapses, last_reviewed_at";

function rowToState(row: StateRow): SrsState {
  return {
    questionId: row.card_id,
    state: row.state,
    ease: row.ease,
    intervalDays: row.interval_days,
    dueDate: row.due_date,
    reps: row.reps,
    lapses: row.lapses,
    lastReviewedAt: row.last_reviewed_at,
  };
}

export async function readDeckStates(
  db: Client,
  userId: string,
  deck: string,
): Promise<SrsState[]> {
  const { rows } = await db.execute({
    sql: `SELECT ${COLUMNS} FROM trainer_srs WHERE user_id = ? AND deck = ?`,
    args: [userId, deck],
  });
  return parseRows(StateRowSchema, rows, "trainer_srs").map(rowToState);
}

export async function readDeckState(
  db: Client,
  userId: string,
  deck: string,
  cardId: string,
): Promise<SrsState | null> {
  const { rows } = await db.execute({
    sql: `SELECT ${COLUMNS} FROM trainer_srs WHERE user_id = ? AND deck = ? AND card_id = ?`,
    args: [userId, deck, cardId],
  });
  return rows.length === 0 ? null : rowToState(parseRow(StateRowSchema, rows[0], "trainer_srs"));
}

async function upsertStateCas(
  db: Client,
  userId: string,
  deck: string,
  next: SrsState,
  expectReps: number | null,
): Promise<boolean> {
  const values = [
    next.state,
    next.ease,
    next.intervalDays,
    next.dueDate,
    next.reps,
    next.lapses,
    next.lastReviewedAt,
  ];
  if (expectReps === null) {
    const res = await db.execute({
      sql: `INSERT OR IGNORE INTO trainer_srs
              (user_id, deck, card_id, state, ease, interval_days, due_date, reps, lapses,
               last_reviewed_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      args: [userId, deck, next.questionId, ...values],
    });
    return res.rowsAffected === 1;
  }
  const res = await db.execute({
    sql: `UPDATE trainer_srs
             SET state = ?, ease = ?, interval_days = ?, due_date = ?, reps = ?, lapses = ?,
                 last_reviewed_at = ?, updated_at = datetime('now')
           WHERE user_id = ? AND deck = ? AND card_id = ? AND reps = ?`,
    args: [...values, userId, deck, next.questionId, expectReps],
  });
  return res.rowsAffected === 1;
}

// ── Reviews ────────────────────────────────────────────────────────────

export interface DeckReviewInput {
  clientId: string;
  cardId: string;
  grade: SrsGrade;
  localDate: string;
  durationMs?: number | null;
  reviewedAt?: string;
  source: "trainer" | "drill";
  /** What the answer was; stored as JSON for later analysis. */
  outcome: unknown;
}

export interface DeckReviewResult {
  existed: boolean;
  applied: boolean;
  state: SrsState | null;
  /** The user's first trainer review of this deck on `localDate`. */
  firstOfDay: boolean;
}

const AppliedRowSchema = z.object({ applied: z.number().int() });

async function findLogged(db: Client, userId: string, deck: string, clientId: string) {
  const { rows } = await db.execute({
    sql: "SELECT applied FROM trainer_reviews WHERE user_id = ? AND deck = ? AND client_id = ?",
    args: [userId, deck, clientId],
  });
  if (rows.length === 0) return null;
  return { applied: parseRow(AppliedRowSchema, rows[0], "trainer_reviews").applied === 1 };
}

export async function recordDeckReview(
  db: Client,
  userId: string,
  deck: string,
  body: DeckReviewInput,
  opts: { cardExists: (id: string) => boolean; now?: Date },
): Promise<DeckReviewResult> {
  if (!opts.cardExists(body.cardId)) {
    throw new ReviewRejectedError("UNKNOWN_QUESTION", `unknown card ${body.cardId}`);
  }
  const nowIso = (opts.now ?? new Date()).toISOString();
  if (!localDateInWindow(body.localDate, nowIso)) {
    throw new ReviewRejectedError(
      "DATE_OUT_OF_RANGE",
      `localDate ${body.localDate} is outside the accepted window around ${nowIso.slice(0, 10)}`,
    );
  }
  const reviewedAt = body.reviewedAt ? new Date(body.reviewedAt).toISOString() : nowIso;

  const logged = await findLogged(db, userId, deck, body.clientId);
  if (logged) {
    return {
      existed: true,
      applied: logged.applied,
      state: await readDeckState(db, userId, deck, body.cardId),
      firstOfDay: false,
    };
  }

  const prev = await readDeckState(db, userId, deck, body.cardId);
  let apply = true;
  if (body.source === "drill") apply = prev !== null && prev.dueDate <= body.localDate;
  if (apply && prev?.lastReviewedAt && reviewedAt < prev.lastReviewedAt) apply = false;
  const prevState = prev?.state ?? "new";

  const inserted = await db.execute({
    sql: `INSERT OR IGNORE INTO trainer_reviews
            (user_id, deck, client_id, card_id, grade, prev_state, source, applied, outcome_json,
             reviewed_at, local_date, duration_ms)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      userId,
      deck,
      body.clientId,
      body.cardId,
      body.grade,
      prevState,
      body.source,
      apply ? 1 : 0,
      JSON.stringify(body.outcome ?? {}),
      reviewedAt,
      body.localDate,
      body.durationMs ?? null,
    ],
  });
  if (inserted.rowsAffected === 0) {
    const winner = await findLogged(db, userId, deck, body.clientId);
    return {
      existed: true,
      applied: winner?.applied ?? false,
      state: await readDeckState(db, userId, deck, body.cardId),
      firstOfDay: false,
    };
  }

  let firstOfDay = false;
  if (body.source === "trainer") {
    const { rows } = await db.execute({
      sql: `SELECT 1 FROM trainer_reviews
             WHERE user_id = ? AND deck = ? AND local_date = ? AND source = 'trainer'
               AND client_id <> ?
             LIMIT 1`,
      args: [userId, deck, body.localDate, body.clientId],
    });
    firstOfDay = rows.length === 0;
  }
  if (!apply) return { existed: false, applied: false, state: prev, firstOfDay };

  let base = prev;
  for (let attempt = 0; attempt < 2; attempt++) {
    const from = base ?? newState(body.cardId, body.localDate);
    const next = applyReview(from, body.grade, { localDate: body.localDate, now: reviewedAt });
    if (await upsertStateCas(db, userId, deck, next, base ? base.reps : null)) {
      if (from.state !== prevState) {
        await db.execute({
          sql: `UPDATE trainer_reviews SET prev_state = ?
                 WHERE user_id = ? AND deck = ? AND client_id = ?`,
          args: [from.state, userId, deck, body.clientId],
        });
      }
      return { existed: false, applied: true, state: next, firstOfDay };
    }
    base = await readDeckState(db, userId, deck, body.cardId);
  }
  throw new Error(`${deck} review ${body.clientId}: lost the state race twice`);
}

// ── Settings ───────────────────────────────────────────────────────────

const SettingsRowSchema = z.object({ settings_json: z.string() });

export async function readDeckSettings<T>(
  db: Client,
  userId: string,
  deck: string,
  schema: z.ZodType<T>,
): Promise<T> {
  const { rows } = await db.execute({
    sql: "SELECT settings_json FROM trainer_settings WHERE user_id = ? AND deck = ?",
    args: [userId, deck],
  });
  let raw: unknown = {};
  if (rows.length > 0) {
    try {
      raw = JSON.parse(parseRow(SettingsRowSchema, rows[0], "trainer_settings").settings_json);
    } catch {
      raw = {};
    }
  }
  const parsed = schema.safeParse(raw);
  return parsed.success ? parsed.data : schema.parse({});
}

export async function writeDeckSettings(
  db: Client,
  userId: string,
  deck: string,
  settings: unknown,
): Promise<void> {
  await db.execute({
    sql: `INSERT INTO trainer_settings (user_id, deck, settings_json, updated_at)
          VALUES (?, ?, ?, datetime('now'))
          ON CONFLICT(user_id, deck) DO UPDATE SET
            settings_json = excluded.settings_json,
            updated_at = excluded.updated_at`,
    args: [userId, deck, JSON.stringify(settings)],
  });
}

// ── Stats ──────────────────────────────────────────────────────────────

const DateRowSchema = z.object({ local_date: z.string() });
const CardRowSchema = z.object({ card_id: z.string() });
const DayRowSchema = z.object({
  local_date: z.string(),
  reviews: z.number().int(),
  again: z.number().int(),
  fresh: z.number().int(),
});
const RetentionRowSchema = z.object({ total: z.number().int(), kept: z.number().nullable() });

export async function deckStreak(db: Client, userId: string, deck: string, today: string) {
  const { rows } = await db.execute({
    sql: `SELECT DISTINCT local_date FROM trainer_reviews
           WHERE user_id = ? AND deck = ? AND source = 'trainer'`,
    args: [userId, deck],
  });
  const dates = new Set(parseRows(DateRowSchema, rows, "trainer_reviews").map((r) => r.local_date));
  return computeStreak(dates, today);
}

/** Cards first answered on `today` (their row was new before the review). */
export async function deckIntroducedOn(
  db: Client,
  userId: string,
  deck: string,
  today: string,
): Promise<string[]> {
  const { rows } = await db.execute({
    sql: `SELECT DISTINCT card_id FROM trainer_reviews
           WHERE user_id = ? AND deck = ? AND local_date = ? AND prev_state = 'new' AND applied = 1`,
    args: [userId, deck, today],
  });
  return parseRows(CardRowSchema, rows, "trainer_reviews").map((r) => r.card_id);
}

export async function deckHistory(
  db: Client,
  userId: string,
  deck: string,
  fromDate: string,
): Promise<
  { date: string; reviews: number; good: number; again: number; newIntroduced: number }[]
> {
  const { rows } = await db.execute({
    sql: `SELECT local_date,
                 COUNT(*) AS reviews,
                 SUM(CASE WHEN grade = 'again' THEN 1 ELSE 0 END) AS again,
                 SUM(CASE WHEN prev_state = 'new' THEN 1 ELSE 0 END) AS fresh
            FROM trainer_reviews
           WHERE user_id = ? AND deck = ? AND local_date >= ?
           GROUP BY local_date ORDER BY local_date`,
    args: [userId, deck, fromDate],
  });
  return parseRows(DayRowSchema, rows, "trainer_reviews").map((r) => ({
    date: r.local_date,
    reviews: r.reviews,
    good: r.reviews - r.again,
    again: r.again,
    newIntroduced: r.fresh,
  }));
}

/** Share of review-state answers that were not "again", since `fromDate`. */
export async function deckRetention(
  db: Client,
  userId: string,
  deck: string,
  fromDate: string,
): Promise<number | null> {
  const { rows } = await db.execute({
    sql: `SELECT COUNT(*) AS total, SUM(CASE WHEN grade <> 'again' THEN 1 ELSE 0 END) AS kept
            FROM trainer_reviews
           WHERE user_id = ? AND deck = ? AND local_date >= ? AND prev_state = 'review'`,
    args: [userId, deck, fromDate],
  });
  const r = parseRow(RetentionRowSchema, rows[0], "trainer_reviews");
  return r.total > 0 ? (r.kept ?? 0) / r.total : null;
}

/** Wipes the user's schedule and review log for one deck; settings stay. */
export async function resetDeck(
  db: Client,
  userId: string,
  deck: string,
): Promise<{ states: number; reviews: number }> {
  const [states, reviews] = await db.batch(
    [
      { sql: "DELETE FROM trainer_srs WHERE user_id = ? AND deck = ?", args: [userId, deck] },
      { sql: "DELETE FROM trainer_reviews WHERE user_id = ? AND deck = ?", args: [userId, deck] },
    ],
    "write",
  );
  return { states: states.rowsAffected, reviews: reviews.rowsAffected };
}
