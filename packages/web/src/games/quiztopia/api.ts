// Typed access to `/api/quiztopia/*`. Every call goes through `apiFetch` with
// the protocol schemas, and React Query keys live in `lib/query-keys.ts`.

import {
  BulkReviewsBodySchema,
  BulkReviewsResponseSchema,
  QuiztopiaSettingsSchema,
  RecentMissesResponseSchema,
  type ReviewBody,
  ReviewBodySchema,
  ReviewResponseSchema,
  SearchResponseSchema,
  TrainerHistoryResponseSchema,
  TrainerOverviewResponseSchema,
  TrainerQueueResponseSchema,
  TrainerStatesResponseSchema,
  WikiReadBodySchema,
  WikiReadsResponseSchema,
} from "@boardgames/core/protocol";
import { dateKey } from "../../lib/offline-availability";
import { jsonMutation, jsonQuery } from "../../lib/typed-query";

const BASE = "/api/quiztopia";

/** The client's local date key — the trainer's notion of "today". */
export function todayKey(): string {
  return dateKey(new Date());
}

function qs(params: Record<string, string | number | boolean | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) sp.set(k, String(v));
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export const overviewQuery = (today: string) =>
  jsonQuery(`${BASE}/trainer/overview${qs({ today })}`, TrainerOverviewResponseSchema);

export const queueQuery = (opts: {
  today: string;
  category?: number;
  limit?: number;
  includeLeeches?: boolean;
}) => jsonQuery(`${BASE}/trainer/queue${qs(opts)}`, TrainerQueueResponseSchema);

export const statesQuery = (ids: readonly string[]) =>
  jsonQuery(`${BASE}/trainer/states${qs({ ids: ids.join(",") })}`, TrainerStatesResponseSchema);

export const historyQuery = (today: string, days = 90) =>
  jsonQuery(`${BASE}/trainer/history${qs({ today, days })}`, TrainerHistoryResponseSchema);

export const settingsQuery = () => jsonQuery(`${BASE}/settings`, QuiztopiaSettingsSchema);

export const searchQuery = (opts: {
  q: string;
  lang: "en" | "de";
  limit?: number;
  category?: number;
}) => jsonQuery(`${BASE}/search${qs(opts)}`, SearchResponseSchema);

export const wikiReadsQuery = () => jsonQuery(`${BASE}/wiki/reads`, WikiReadsResponseSchema);

export const recentMissesQuery = (limit = 30) =>
  jsonQuery(`${BASE}/games/recent-misses${qs({ limit })}`, RecentMissesResponseSchema);

const reviewMutation = jsonMutation(`${BASE}/trainer/reviews`, {
  request: ReviewBodySchema,
  response: ReviewResponseSchema,
});

/** Accepts the schema's INPUT shape (`source` may be omitted → "trainer"). */
export const submitReview = (body: ReviewBody) => reviewMutation(ReviewBodySchema.parse(body));

const bulkMutation = jsonMutation(`${BASE}/trainer/reviews/bulk`, {
  request: BulkReviewsBodySchema,
  response: BulkReviewsResponseSchema,
});

export const submitReviewsBulk = (body: { reviews: ReviewBody[] }) =>
  bulkMutation(BulkReviewsBodySchema.parse(body));

export const putSettings = jsonMutation(
  `${BASE}/settings`,
  { request: QuiztopiaSettingsSchema, response: QuiztopiaSettingsSchema },
  { method: "PUT" },
);

/** Answers with the caller's full read list (idempotent per set). */
export const postWikiRead = jsonMutation(`${BASE}/wiki/reads`, {
  request: WikiReadBodySchema,
  response: WikiReadsResponseSchema,
});
