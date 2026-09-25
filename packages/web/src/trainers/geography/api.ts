// Typed access to `/api/trainers/geography/*` through the protocol schemas.

import {
  GeoBulkReviewsBodySchema,
  GeoBulkReviewsResponseSchema,
  GeoHistoryResponseSchema,
  GeoOverviewResponseSchema,
  GeoResetBodySchema,
  GeoResetResponseSchema,
  type GeoReviewBody,
  GeoReviewBodySchema,
  GeoReviewResponseSchema,
  GeoSettingsSchema,
} from "@boardgames/core/protocol";
import { jsonMutation, jsonQuery } from "../../lib/typed-query";

const BASE = "/api/trainers/geography";

export const overviewQuery = (today: string) =>
  jsonQuery(`${BASE}/overview?today=${today}`, GeoOverviewResponseSchema);

export const historyQuery = (today: string, days = 90) =>
  jsonQuery(`${BASE}/history?today=${today}&days=${days}`, GeoHistoryResponseSchema);

const reviewMutation = jsonMutation(`${BASE}/reviews`, {
  request: GeoReviewBodySchema,
  response: GeoReviewResponseSchema,
});

export const submitReview = (body: GeoReviewBody) =>
  reviewMutation(GeoReviewBodySchema.parse(body));

const bulkMutation = jsonMutation(`${BASE}/reviews/bulk`, {
  request: GeoBulkReviewsBodySchema,
  response: GeoBulkReviewsResponseSchema,
});

export const submitReviewsBulk = (reviews: GeoReviewBody[]) =>
  bulkMutation(GeoBulkReviewsBodySchema.parse({ reviews }));

export const putSettings = jsonMutation(
  `${BASE}/settings`,
  { request: GeoSettingsSchema, response: GeoSettingsSchema },
  { method: "PUT" },
);

/** Wipes the caller's geography schedule and history (settings stay). */
export const resetProgress = jsonMutation(`${BASE}/reset`, {
  request: GeoResetBodySchema,
  response: GeoResetResponseSchema,
});
