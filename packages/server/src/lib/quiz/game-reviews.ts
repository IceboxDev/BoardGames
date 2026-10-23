// Table-game answers → trainer reviews, written by the SERVER at game over.
// The replay log the session just persisted says which questions were
// judged and how; the session's seats say which account sat where. Every
// human seat gets a `source: "game"` review per question it is graded on
// (policy and ids: `core/games/quiztopia/game-reviews.ts`). Whether a game
// review moves the member's schedule is still their `gameReviewsAffectSrs`
// setting, applied inside `recordReview`.
//
// Ids are `game:<sessionId>:<turn>` — the session id is an unguessable UUID,
// so ids are unique per game and a re-run is a no-op (reviews are
// idempotent per member and id).

import { GameReviewLogSchema, gameReviews } from "@boardgames/core/games/quiztopia/game-reviews";
import type { Client } from "@libsql/client";
import { todayDateKey } from "../next-night.ts";
import { ReviewRejectedError } from "../trainers/review-guards.ts";
import type { ContentStore } from "./content-store.ts";
import { recordReview } from "./srs-db.ts";

export interface FinishedTable {
  /** The session's id: the namespace of the reviews' ids. */
  sessionId: string;
  roomCode: string | null;
  /** Account per seat index; `null` for an AI seat. */
  seatUserIds: readonly (string | null)[];
  /** The persisted replay log (`spec.getReplayLog`), parsed here. */
  replayLog: unknown;
  endedAt: Date;
}

export interface GameReviewsSummary {
  recorded: number;
  /** Facts the content store doesn't know (fixture content, a retired fact). */
  skipped: number;
}

/**
 * Record the table's reviews. One failing write (a deleted account, a DB
 * hiccup) never stops the others; failures are thrown together at the end
 * so the caller logs them.
 */
export async function recordGameReviews(
  db: Client,
  store: ContentStore,
  table: FinishedTable,
): Promise<GameReviewsSummary> {
  const log = GameReviewLogSchema.parse(table.replayLog);
  // Table games happen at the group's table: its calendar day is the
  // members' local day (the same clock the rest of the server uses).
  const localDate = todayDateKey(table.endedAt);
  const reviewedAt = table.endedAt.toISOString();
  let recorded = 0;
  let skipped = 0;
  const failures: unknown[] = [];
  for (const review of gameReviews(log, table.sessionId, table.seatUserIds.length)) {
    const userId = table.seatUserIds[review.seat];
    if (!userId) continue;
    try {
      await recordReview(
        db,
        userId,
        {
          clientId: review.clientId,
          questionId: review.questionId,
          grade: review.grade,
          localDate,
          reviewedAt,
          source: "game",
          roomCode: table.roomCode,
        },
        store,
        { now: table.endedAt },
      );
      recorded++;
    } catch (err) {
      if (err instanceof ReviewRejectedError) skipped++;
      else failures.push(err);
    }
  }
  if (failures.length > 0) {
    const first = failures[0];
    throw new AggregateError(
      failures,
      `${failures.length} game review(s) of ${table.sessionId} failed (${recorded} recorded): ${
        first instanceof Error ? first.message : String(first)
      }`,
    );
  }
  return { recorded, skipped };
}
