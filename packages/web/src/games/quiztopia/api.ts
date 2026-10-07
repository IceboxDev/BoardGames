// Typed access to `/api/quiztopia/*`. Every call goes through `apiFetch` with
// the protocol schemas, and React Query keys live in `lib/query-keys.ts`.

import {
  BulkReviewsBodySchema,
  BulkReviewsResponseSchema,
  JournalResponseSchema,
  QuiztopiaSettingsSchema,
  RecentMissesResponseSchema,
  type ReviewBody,
  ReviewBodySchema,
  ReviewResponseSchema,
  SearchResponseSchema,
  TimelinePinsResponseSchema,
  TrainerHistoryResponseSchema,
  TrainerOverviewResponseSchema,
  TrainerQueueResponseSchema,
  TrainerResetBodySchema,
  TrainerResetResponseSchema,
  TrainerStatesResponseSchema,
  WikiReadBodySchema,
  WikiReadsResponseSchema,
} from "@boardgames/core/protocol";
import { apiFetch } from "../../lib/api-fetch";
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

/** Every question the caller has studied — the pins of their personal timeline. */
export const pinsQuery = () => jsonQuery(`${BASE}/trainer/pins`, TimelinePinsResponseSchema);

export const settingsQuery = () => jsonQuery(`${BASE}/settings`, QuiztopiaSettingsSchema);

export const searchQuery = (opts: {
  q: string;
  lang: "en" | "de";
  limit?: number;
  category?: number;
}) => jsonQuery(`${BASE}/search${qs(opts)}`, SearchResponseSchema);

export const wikiReadsQuery = () => jsonQuery(`${BASE}/wiki/reads`, WikiReadsResponseSchema);

/** One page of the journal: `days` active days strictly before `before` (none = newest). */
export const journalQuery = (opts: { before?: string; days?: number; tz: string }) =>
  jsonQuery(`${BASE}/journal${qs(opts)}`, JournalResponseSchema);

export const recentMissesQuery = (limit = 30) =>
  jsonQuery(`${BASE}/games/recent-misses${qs({ limit })}`, RecentMissesResponseSchema);

/**
 * Grade one question. Accepts the schema's INPUT shape; `keepalive` lets the
 * request finish after the page is gone (a grade committed on `pagehide`).
 */
export const submitReview = (body: ReviewBody, opts: { keepalive?: boolean } = {}) =>
  apiFetch(`${BASE}/trainer/reviews`, {
    method: "POST",
    body: ReviewBodySchema.parse(body),
    request: ReviewBodySchema,
    response: ReviewResponseSchema,
    keepalive: opts.keepalive,
  });

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

/** Wipes the caller's schedule, review history and wiki reads (settings stay). */
export const resetProgress = jsonMutation(`${BASE}/trainer/reset`, {
  request: TrainerResetBodySchema,
  response: TrainerResetResponseSchema,
});

/** Answers with the caller's full read list (idempotent per set). */
export const postWikiRead = jsonMutation(`${BASE}/wiki/reads`, {
  request: WikiReadBodySchema,
  response: WikiReadsResponseSchema,
});

/** Unmark a read (a mistaken tap); answers with the remaining list. Idempotent. */
export const deleteWikiRead = jsonMutation(
  `${BASE}/wiki/reads`,
  { request: WikiReadBodySchema, response: WikiReadsResponseSchema },
  { method: "DELETE" },
);
