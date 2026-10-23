import { MAX_BULK_REVIEWS, type ReviewBody, ReviewBodySchema } from "@boardgames/core/protocol";
import { ReviewOutbox, useReviewOutbox } from "../../lib/review-outbox";
import { submitReview, submitReviewsBulk } from "./api";

// The trainer's durable outbox (see `lib/review-outbox.ts` for the
// guarantees). One instance per page: every screen that grades or shows
// "N waiting to sync" talks to this same queue.

export const PENDING_REVIEWS_KEY = "quiz.pendingReviews.v1";

export const quizReviewOutbox = new ReviewOutbox<ReviewBody>({
  storageKey: PENDING_REVIEWS_KEY,
  parse: (raw) => {
    const r = ReviewBodySchema.safeParse(raw);
    return r.success ? r.data : null;
  },
  idOf: (review) => review.clientId,
  sendOne: submitReview,
  sendBatch: (reviews) => submitReviewsBulk({ reviews: [...reviews] }),
  maxBatch: MAX_BULK_REVIEWS,
});

/** Live pending count + `enqueue`; mounting it keeps the outbox replaying. */
export function useQuizOutbox() {
  return useReviewOutbox(quizReviewOutbox);
}
