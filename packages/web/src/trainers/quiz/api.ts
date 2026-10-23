// Typed access to `/api/trainers/quiz/*`. Every call goes through `apiFetch` with
// the protocol schemas, and React Query keys live in `lib/query-keys.ts`.

import {
  AdminReportsResponseSchema,
  ArticleHistoryResponseSchema,
  BulkReviewsBodySchema,
  BulkReviewsResponseSchema,
  type CreateReportBody,
  CreateReportBodySchema,
  CreateReportResponseSchema,
  JournalResponseSchema,
  MarkReportsSeenBodySchema,
  MyReportsResponseSchema,
  QuizSettingsSchema,
  RecentMissesResponseSchema,
  ReopenReportResponseSchema,
  type ResolveReportsBody,
  ResolveReportsBodySchema,
  ResolveReportsResponseSchema,
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

const BASE = "/api/trainers/quiz";

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
  domain?: string;
  limit?: number;
  includeLeeches?: boolean;
}) => jsonQuery(`${BASE}/trainer/queue${qs(opts)}`, TrainerQueueResponseSchema);

export const statesQuery = (ids: readonly string[]) =>
  jsonQuery(`${BASE}/trainer/states${qs({ ids: ids.join(",") })}`, TrainerStatesResponseSchema);

export const historyQuery = (today: string, days = 90) =>
  jsonQuery(`${BASE}/trainer/history${qs({ today, days })}`, TrainerHistoryResponseSchema);

/** Every fact the caller has studied — the pins of their personal timeline. */
export const pinsQuery = () => jsonQuery(`${BASE}/trainer/pins`, TimelinePinsResponseSchema);

export const settingsQuery = () => jsonQuery(`${BASE}/settings`, QuizSettingsSchema);

export const searchQuery = (opts: {
  q: string;
  lang: "en" | "de" | "ru";
  limit?: number;
  domain?: string;
}) => jsonQuery(`${BASE}/search${qs(opts)}`, SearchResponseSchema);

export const wikiReadsQuery = () => jsonQuery(`${BASE}/wiki/reads`, WikiReadsResponseSchema);

/** An article's changelog and retired facts (read from the server; never bundled). */
export const articleHistoryQuery = (articleId: string) =>
  jsonQuery(`${BASE}/articles/${articleId}/history`, ArticleHistoryResponseSchema);

/** One page of the journal: `days` active days strictly before `before` (none = newest). */
export const journalQuery = (opts: { before?: string; days?: number; tz: string }) =>
  jsonQuery(`${BASE}/journal${qs(opts)}`, JournalResponseSchema);

export const recentMissesQuery = (limit = 30) =>
  jsonQuery(`${BASE}/games/recent-misses${qs({ limit })}`, RecentMissesResponseSchema);

/**
 * Grade one fact. Accepts the schema's INPUT shape; `keepalive` lets the
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
  { request: QuizSettingsSchema, response: QuizSettingsSchema },
  { method: "PUT" },
);

/** Wipes the caller's schedule, review history and wiki reads (settings stay). */
export const resetProgress = jsonMutation(`${BASE}/trainer/reset`, {
  request: TrainerResetBodySchema,
  response: TrainerResetResponseSchema,
});

/** Answers with the caller's full read list (idempotent per article). */
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

// ── Content reports ─────────────────────────────────────────────────────

/** File a report, or update your open report of the same issue (201 / 200). */
export const createReport = (body: CreateReportBody) =>
  apiFetch(`${BASE}/reports`, {
    method: "POST",
    body: CreateReportBodySchema.parse(body),
    request: CreateReportBodySchema,
    response: CreateReportResponseSchema,
  });

export const myReportsQuery = () => jsonQuery(`${BASE}/reports/mine`, MyReportsResponseSchema);

export const markReportsSeen = jsonMutation(`${BASE}/reports/mine/seen`, {
  request: MarkReportsSeenBodySchema,
  response: MyReportsResponseSchema,
});

/** Withdraw your own open report; answers with your remaining reports. */
export const withdrawReport = (id: number) =>
  apiFetch(`${BASE}/reports/${id}`, { method: "DELETE", response: MyReportsResponseSchema });

// Admin queue (`/api/admin/quiz-reports`, admins only).

export const adminReportsQuery = (status: "open" | "fixed" | "declined" | "all") =>
  jsonQuery(`/api/admin/quiz-reports${qs({ status })}`, AdminReportsResponseSchema);

export const resolveReports = (body: ResolveReportsBody) =>
  apiFetch("/api/admin/quiz-reports/resolve", {
    method: "POST",
    body: ResolveReportsBodySchema.parse(body),
    request: ResolveReportsBodySchema,
    response: ResolveReportsResponseSchema,
  });

export const reopenReport = (id: number) =>
  apiFetch(`/api/admin/quiz-reports/${id}/reopen`, {
    method: "POST",
    response: ReopenReportResponseSchema,
  });
