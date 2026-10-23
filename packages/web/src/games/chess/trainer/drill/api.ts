// Typed access to `/api/trainers/chess/drill/*` (spaced repetition of your moves).

import {
  ChessDrillBulkReviewsBodySchema,
  ChessDrillBulkReviewsResponseSchema,
  ChessDrillOverviewResponseSchema,
  type ChessDrillReviewBody,
  ChessDrillReviewBodySchema,
  ChessDrillReviewResponseSchema,
} from "@boardgames/core/protocol";
import { apiFetch } from "../../../../lib/api-fetch";
import { dateKey } from "../../../../lib/offline-availability";
import { jsonQuery } from "../../../../lib/typed-query";

const BASE = "/api/trainers/chess/drill";

/** The browser's local date: the drill's notion of "today". */
export const todayKey = () => dateKey(new Date());

export const drillKeys = {
  overview: (color: "w" | "b", today: string) => ["chess-trainer", "drill", color, today] as const,
};

export const drillOverviewQuery = (color: "w" | "b", today: string) =>
  jsonQuery(`${BASE}/${color}/overview?today=${today}`, ChessDrillOverviewResponseSchema);

export const submitDrillReview = (review: ChessDrillReviewBody) =>
  apiFetch(`${BASE}/reviews`, {
    method: "POST",
    body: review,
    request: ChessDrillReviewBodySchema,
    response: ChessDrillReviewResponseSchema,
  });

export const submitDrillReviews = (reviews: ChessDrillReviewBody[]) =>
  apiFetch(`${BASE}/reviews/bulk`, {
    method: "POST",
    body: { reviews },
    request: ChessDrillBulkReviewsBodySchema,
    response: ChessDrillBulkReviewsResponseSchema,
  });
