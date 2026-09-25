// World Geography trainer — `/api/trainers/geography/*`.
//
//   GET  /overview?today=          every card state + today's counts, streak, settings
//   POST /reviews                  grade one card (201; 200 on replay)
//   POST /reviews/bulk             offline replay
//   GET  /history?today=&days=     per-day counts for the heatmap
//   GET  /settings, PUT /settings
//   POST /reset                    wipe schedule + log (settings stay)
//
// The deck is small (≈ 1,550 cards), so the client builds its session from
// the full state list; the server stays the authority on the schedule and
// re-applies every grade itself. The client is the clock: reads carry
// `today`, writes `localDate`.

import {
  GeoBulkReviewsBodySchema,
  GeoBulkReviewsResponseSchema,
  GeoHistoryQuerySchema,
  GeoHistoryResponseSchema,
  GeoOverviewQuerySchema,
  GeoOverviewResponseSchema,
  GeoResetBodySchema,
  GeoResetResponseSchema,
  GeoReviewBodySchema,
  GeoReviewResponseSchema,
  GeoSettingsSchema,
  type GeoSrsStateWire,
} from "@boardgames/core/protocol";
import { DECK_ID, parseCardId } from "@boardgames/core/trainers/geography/catalog";
import { geoCatalog } from "@boardgames/core/trainers/geography/deck";
import { addDays, isLeech, type SrsState } from "@boardgames/core/trainers/srs";
import type { z } from "zod";
import { authedApp } from "../auth/index.ts";
import { getDb } from "../db.ts";
import { logActivity } from "../lib/activity-log.ts";
import { errorResponse, zJsonBody, zQuery } from "../lib/error-response.ts";
import { ReviewRejectedError } from "../lib/quiztopia/srs-db.ts";
import {
  type DeckReviewResult,
  deckHistory,
  deckIntroducedOn,
  deckRetention,
  deckStreak,
  readDeckSettings,
  readDeckStates,
  recordDeckReview,
  resetDeck,
  writeDeckSettings,
} from "../lib/trainers/deck-db.ts";

export const geographyRoutes = authedApp();

const RETENTION_DAYS = 30;

function toWire(s: SrsState): GeoSrsStateWire {
  return { ...s, leech: isLeech(s) };
}

function cardExists(id: string): boolean {
  return geoCatalog().hasCard(id);
}

function noteDay(userId: string, result: DeckReviewResult, localDate: string): void {
  if (result.firstOfDay) logActivity(userId, "geography-train", { localDate });
}

type ReviewBody = z.output<typeof GeoReviewBodySchema>;

function record(userId: string, body: ReviewBody): Promise<DeckReviewResult> {
  return recordDeckReview(getDb(), userId, DECK_ID, body, { cardExists });
}

geographyRoutes.get("/overview", zQuery(GeoOverviewQuerySchema), async (c) => {
  const user = c.get("user");
  const { today } = c.req.valid("query");
  const db = getDb();
  const [states, introduced, streak, history, retention30, settings] = await Promise.all([
    readDeckStates(db, user.id, DECK_ID),
    deckIntroducedOn(db, user.id, DECK_ID, today),
    deckStreak(db, user.id, DECK_ID, today),
    deckHistory(db, user.id, DECK_ID, today),
    deckRetention(db, user.id, DECK_ID, addDays(today, -RETENTION_DAYS)),
    readDeckSettings(db, user.id, DECK_ID, GeoSettingsSchema),
  ]);
  const catalog = geoCatalog();
  const todayRow = history.find((d) => d.date === today);
  // A place is new the day its stage 1 is first answered; its later stages aren't new places.
  // Continents come as a set outside the budget, so only countries and cities count.
  const places = introduced.filter((id) => {
    const card = parseCardId(id);
    return card?.stage === 1 && !card.placeId.startsWith("ct:");
  }).length;
  return c.json(
    GeoOverviewResponseSchema.parse({
      contentVersion: catalog.version,
      // Cards the current deck no longer knows are dropped, not served.
      states: states.filter((s) => catalog.hasCard(s.questionId)).map(toWire),
      introducedToday: { places, names: 0 },
      today: { reviews: todayRow?.reviews ?? 0, correct: todayRow?.good ?? 0 },
      streak,
      retention30,
      settings,
    }),
  );
});

geographyRoutes.post("/reviews", zJsonBody(GeoReviewBodySchema), async (c) => {
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
  noteDay(user.id, result, body.localDate);
  return c.json(
    GeoReviewResponseSchema.parse({
      ok: true,
      existed: result.existed,
      applied: result.applied,
      state: result.state ? toWire(result.state) : null,
    }),
    result.existed ? 200 : 201,
  );
});

geographyRoutes.post("/reviews/bulk", zJsonBody(GeoBulkReviewsBodySchema), async (c) => {
  const user = c.get("user");
  const { reviews } = c.req.valid("json");
  let applied = 0;
  let skipped = 0;
  const states = new Map<string, GeoSrsStateWire>();
  for (const review of reviews) {
    try {
      const result = await record(user.id, review);
      noteDay(user.id, result, review.localDate);
      if (result.applied && !result.existed) applied++;
      else skipped++;
      if (result.state) states.set(review.cardId, toWire(result.state));
    } catch (err) {
      if (!(err instanceof ReviewRejectedError)) throw err;
      skipped++;
    }
  }
  return c.json(
    GeoBulkReviewsResponseSchema.parse({
      ok: true,
      applied,
      skipped,
      states: [...states.values()],
    }),
  );
});

geographyRoutes.get("/history", zQuery(GeoHistoryQuerySchema), async (c) => {
  const user = c.get("user");
  const { today, days } = c.req.valid("query");
  const rows = await deckHistory(getDb(), user.id, DECK_ID, addDays(today, -(days - 1)));
  return c.json(GeoHistoryResponseSchema.parse({ days: rows }));
});

geographyRoutes.get("/settings", async (c) => {
  const user = c.get("user");
  return c.json(await readDeckSettings(getDb(), user.id, DECK_ID, GeoSettingsSchema));
});

geographyRoutes.put("/settings", zJsonBody(GeoSettingsSchema), async (c) => {
  const user = c.get("user");
  const settings = c.req.valid("json");
  await writeDeckSettings(getDb(), user.id, DECK_ID, settings);
  logActivity(user.id, "geography-settings", settings);
  return c.json(GeoSettingsSchema.parse(settings));
});

geographyRoutes.post("/reset", zJsonBody(GeoResetBodySchema), async (c) => {
  const user = c.get("user");
  const deleted = await resetDeck(getDb(), user.id, DECK_ID);
  logActivity(user.id, "geography-reset", deleted);
  return c.json(GeoResetResponseSchema.parse({ ok: true, deleted }));
});
