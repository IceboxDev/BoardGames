// The quiz trainer's persistence on the generic deck tables (deck "quiz",
// card id = fact id): settings, the review write path and the reset. The
// scheduling and replay rules are the deck layer's (`trainers/deck-db.ts`);
// this adds what is the quiz's own — the fact must exist in the bank, and a
// table-game answer moves the schedule only when the member opted in.

import {
  DEFAULT_QUIZ_SETTINGS,
  type QuizSettings,
  QuizSettingsSchema,
  type ReviewBodySchema,
  type SrsStateWire,
  withNewSources,
} from "@boardgames/core/protocol";
import { isLeech, type SrsState } from "@boardgames/core/quiz/srs";
import type { Client } from "@libsql/client";
import type { z } from "zod";
import {
  type DeckReviewResult,
  readDeckSettings,
  recordDeckReview,
  resetDeck,
  writeDeckSettings,
} from "../trainers/deck-db.ts";
import type { ContentStore } from "./content-store.ts";

export const QUIZ_DECK = "quiz";

export function toWireState(state: SrsState): SrsStateWire {
  return { ...state, leech: isLeech(state) };
}

// A member without a settings row (or with only part of one — migration 0061
// carried just the language across) reads the defaults for what is missing.
// A row saved before `sourcesKnown` existed knew the two first games; any
// game added since joins its sources on read (`withNewSources`).
const StoredSettingsSchema = QuizSettingsSchema.extend({
  language: QuizSettingsSchema.shape.language.default(DEFAULT_QUIZ_SETTINGS.language),
  sourcesKnown: QuizSettingsSchema.shape.sourcesKnown.default(["quiztopia", "trivial-pursuit"]),
});

export async function readSettings(db: Client, userId: string): Promise<QuizSettings> {
  return withNewSources(await readDeckSettings(db, userId, QUIZ_DECK, StoredSettingsSchema));
}

export function writeSettings(db: Client, userId: string, settings: QuizSettings): Promise<void> {
  return writeDeckSettings(db, userId, QUIZ_DECK, QuizSettingsSchema.parse(settings));
}

/**
 * A review to record: a client's trainer grade (the wire body) or a table
 * game's answer the server derived itself at game over (`game-reviews.ts`).
 */
export type ReviewInput = Omit<z.output<typeof ReviewBodySchema>, "source"> & {
  source: "trainer" | "game";
  /** The room a table game was played in (game reviews only). */
  roomCode?: string | null;
};

export async function recordReview(
  db: Client,
  userId: string,
  body: ReviewInput,
  store: ContentStore,
  opts: { now?: Date } = {},
): Promise<DeckReviewResult> {
  const gameApplies =
    body.source === "game" ? (await readSettings(db, userId)).gameReviewsAffectSrs : false;
  return recordDeckReview(
    db,
    userId,
    QUIZ_DECK,
    {
      clientId: body.clientId,
      cardId: body.questionId,
      grade: body.grade,
      localDate: body.localDate,
      durationMs: body.durationMs ?? null,
      reviewedAt: body.reviewedAt,
      source: body.source,
      outcome: body.roomCode ? { roomCode: body.roomCode } : {},
    },
    { cardExists: (id) => store.hasFact(id), now: opts.now, gameApplies },
  );
}

/** Wipes the user's schedule, review history, article reads and read log; settings stay. */
export async function resetProgress(
  db: Client,
  userId: string,
): Promise<{ states: number; reviews: number; reads: number }> {
  const deck = await resetDeck(db, userId, QUIZ_DECK);
  const [reads] = await db.batch(
    [
      { sql: "DELETE FROM quiz_wiki_reads WHERE user_id = ?", args: [userId] },
      { sql: "DELETE FROM quiz_wiki_read_log WHERE user_id = ?", args: [userId] },
    ],
    "write",
  );
  return { ...deck, reads: reads.rowsAffected };
}
