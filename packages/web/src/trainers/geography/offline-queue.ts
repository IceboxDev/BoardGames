import {
  type GeoReviewBody,
  GeoReviewBodySchema,
  MAX_GEO_BULK_REVIEWS,
} from "@boardgames/core/protocol";
import { ReviewOutbox, useReviewOutbox } from "../../lib/review-outbox";
import { submitReview, submitReviewsBulk } from "./api";

// The Geography trainer's durable outbox — the same machinery as
// Quiztopia's (`lib/review-outbox.ts`: cross-tab locks, removal by id,
// only definitive rejections dropped), under its own storage key. The key
// is unchanged from the earlier queue, so reviews already waiting carry over.

export const GEO_PENDING_KEY = "geography.pendingReviews.v1";

export const geoReviewOutbox = new ReviewOutbox<GeoReviewBody>({
  storageKey: GEO_PENDING_KEY,
  parse: (raw) => {
    const r = GeoReviewBodySchema.safeParse(raw);
    return r.success ? r.data : null;
  },
  idOf: (review) => review.clientId,
  sendOne: submitReview,
  sendBatch: (reviews) => submitReviewsBulk([...reviews]),
  maxBatch: MAX_GEO_BULK_REVIEWS,
});

/** Live pending count + `enqueue`; mounting it keeps the outbox replaying. */
export function useGeoOfflineQueue() {
  return useReviewOutbox(geoReviewOutbox);
}
