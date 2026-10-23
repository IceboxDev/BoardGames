// Chess opening drill — `/api/trainers/chess/drill/*`: spaced repetition of
// your own moves, one shared-trainer deck per colour (`chess-w`, `chess-b`;
// migration 0043's tables, `lib/trainers/deck-db.ts`).
//
//   GET  /:color/overview?today   the deck's schedule rows, today's counts, streak, retention
//   POST /reviews                 one graded card (idempotent by clientId)
//   POST /reviews/bulk            the offline outbox's backlog
//
// A card is a position key from the member's own tree, which lives in the
// browser's build; the server only checks the key's shape. A key the tree no
// longer holds simply stops being dealt.

import {
  ChessCardIdSchema,
  ChessColorSchema,
  ChessDrillBulkReviewsBodySchema,
  ChessDrillBulkReviewsResponseSchema,
  ChessDrillOverviewQuerySchema,
  ChessDrillOverviewResponseSchema,
  ChessDrillReviewBodySchema,
  ChessDrillReviewResponseSchema,
  type ChessDrillStateWire,
} from "@boardgames/core/protocol";
import { addDays, isLeech, type SrsState } from "@boardgames/core/trainers/srs";
import type { z } from "zod";
import { authedApp } from "../auth/index.ts";
import { getDb } from "../db.ts";
import { errorResponse, zJsonBody, zQuery } from "../lib/error-response.ts";
import {
  type DeckReviewResult,
  deckHistory,
  deckIntroducedOn,
  deckRetention,
  deckStreak,
  readDeckStates,
  recordDeckReview,
} from "../lib/trainers/deck-db.ts";
import { ReviewRejectedError } from "../lib/trainers/review-guards.ts";

export const chessDrillRoutes = authedApp();

const RETENTION_DAYS = 30;

export const drillDeck = (color: "w" | "b") => `chess-${color}`;

function toWire(s: SrsState): ChessDrillStateWire {
  return { ...s, leech: isLeech(s) };
}

const cardExists = (id: string) => ChessCardIdSchema.safeParse(id).success;

type ReviewBody = z.output<typeof ChessDrillReviewBodySchema>;

function record(userId: string, body: ReviewBody): Promise<DeckReviewResult> {
  const { color, ...review } = body;
  return recordDeckReview(getDb(), userId, drillDeck(color), review, { cardExists });
}

chessDrillRoutes.get("/:color/overview", zQuery(ChessDrillOverviewQuerySchema), async (c) => {
  const color = ChessColorSchema.safeParse(c.req.param("color"));
  if (!color.success) return errorResponse(c, 404, "unknown colour", "NOT_FOUND");
  const user = c.get("user");
  const { today } = c.req.valid("query");
  const db = getDb();
  const deck = drillDeck(color.data);
  const [states, introduced, streak, history, retention30] = await Promise.all([
    readDeckStates(db, user.id, deck),
    deckIntroducedOn(db, user.id, deck, today),
    deckStreak(db, user.id, deck, today),
    deckHistory(db, user.id, deck, today),
    deckRetention(db, user.id, deck, addDays(today, -RETENTION_DAYS)),
  ]);
  const todayRow = history.find((d) => d.date === today);
  return c.json(
    ChessDrillOverviewResponseSchema.parse({
      states: states.filter((s) => cardExists(s.questionId)).map(toWire),
      today: { reviews: todayRow?.reviews ?? 0, correct: todayRow?.good ?? 0 },
      introducedToday: introduced.length,
      streak,
      retention30,
    }),
  );
});

chessDrillRoutes.post("/reviews", zJsonBody(ChessDrillReviewBodySchema), async (c) => {
  const user = c.get("user");
  const body = c.req.valid("json");
  let result: DeckReviewResult;
  try {
    result = await record(user.id, body);
  } catch (err) {
    if (err instanceof ReviewRejectedError) {
      return err.code === "UNKNOWN_QUESTION"
        ? errorResponse(c, 404, "card not found", "NOT_FOUND")
        : errorResponse(c, 400, err.message, "BAD_REQUEST");
    }
    throw err;
  }
  return c.json(
    ChessDrillReviewResponseSchema.parse({
      ok: true,
      existed: result.existed,
      applied: result.applied,
      state: result.state ? toWire(result.state) : null,
    }),
    result.existed ? 200 : 201,
  );
});

chessDrillRoutes.post("/reviews/bulk", zJsonBody(ChessDrillBulkReviewsBodySchema), async (c) => {
  const user = c.get("user");
  const { reviews } = c.req.valid("json");
  let applied = 0;
  let skipped = 0;
  const states = new Map<string, ChessDrillStateWire>();
  for (const review of reviews) {
    try {
      const result = await record(user.id, review);
      if (result.applied && !result.existed) applied++;
      else skipped++;
      if (result.state) states.set(`${review.color}|${review.cardId}`, toWire(result.state));
    } catch (err) {
      if (!(err instanceof ReviewRejectedError)) throw err;
      skipped++;
    }
  }
  return c.json(
    ChessDrillBulkReviewsResponseSchema.parse({
      ok: true,
      applied,
      skipped,
      states: [...states.values()],
    }),
  );
});
