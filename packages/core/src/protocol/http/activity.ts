import { z } from "zod";

// ── Member activity log (admin drawer) ─────────────────────────────────
//
// `type` is deliberately an open string, not an enum: the vocabulary is
// owned by the server's `lib/activity-log.ts` and grows with new features.
// The client keeps a label map for known types and falls back to a generic
// rendering for anything it doesn't recognize, so old clients never choke
// on a new event kind.

export const ActivityEntrySchema = z.object({
  id: z.number().int().positive(),
  type: z.string().min(1),
  // Per-type payload (date keys, slugs, target user ids, counts). Rendered
  // client-side; unknown keys are ignored there.
  meta: z.record(z.string(), z.unknown()),
  // SQLite `datetime('now')` — UTC, "YYYY-MM-DD HH:MM:SS".
  createdAt: z.string().min(1),
});
export type ActivityEntry = z.infer<typeof ActivityEntrySchema>;

// `GET /api/admin/users/:userId/activity?before=<id>&limit=<n>` — keyset
// pagination newest-first; `before` is the smallest id of the previous page.
export const ActivityLogQuerySchema = z.object({
  before: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type ActivityLogQuery = z.input<typeof ActivityLogQuerySchema>;

export const ActivityLogResponseSchema = z.object({
  entries: z.array(ActivityEntrySchema),
  // id to pass as `before` for the next page; null when this page is the end.
  nextBefore: z.number().int().positive().nullable(),
});
export type ActivityLogResponse = z.infer<typeof ActivityLogResponseSchema>;

// `POST /api/activity/view` — client-side page-view beacon. `page` is a
// client-owned vocabulary ("calendar", "night", "games", "players", "play",
// …); `detail` optionally narrows it (a date key for "night", a game slug
// for "play"). The client deduplicates per session; the server just records.
export const PageViewBodySchema = z.object({
  page: z.string().min(1).max(64),
  detail: z.string().min(1).max(100).optional(),
});
export type PageViewBody = z.input<typeof PageViewBodySchema>;
