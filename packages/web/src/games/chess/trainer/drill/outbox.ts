import {
  type ChessDrillReviewBody,
  ChessDrillReviewBodySchema,
  MAX_CHESS_DRILL_BULK,
} from "@boardgames/core/protocol";
import { ReviewOutbox, useReviewOutbox } from "../../../../lib/review-outbox";
import { submitDrillReview, submitDrillReviews } from "./api";

// The chess drill's durable outbox: the trainers' shared machinery
// (`lib/review-outbox.ts`: cross-tab locks, removal by id, only definitive
// rejections dropped) under its own storage key.

export const drillOutbox = new ReviewOutbox<ChessDrillReviewBody>({
  storageKey: "chess-drill.pendingReviews.v1",
  parse: (raw) => {
    const r = ChessDrillReviewBodySchema.safeParse(raw);
    return r.success ? r.data : null;
  },
  idOf: (review) => review.clientId,
  sendOne: submitDrillReview,
  sendBatch: (reviews) => submitDrillReviews([...reviews]),
  maxBatch: MAX_CHESS_DRILL_BULK,
});

/** Live pending count + `enqueue`; mounting it keeps the outbox replaying. */
export function useDrillOutbox() {
  return useReviewOutbox(drillOutbox);
}
