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

// ── Device / viewport telemetry ────────────────────────────────────────
//
// `POST /api/activity/device` — everything needed to REPRODUCE a member's
// rendering environment locally: CSS viewport, screen resolution,
// devicePixelRatio (retina and/or browser zoom), a desktop zoom estimate
// (outerWidth/innerWidth), and mobile pinch scale. Upserted per device
// signature server-side, so each distinct device/viewport shows once with
// first/last-seen rather than flooding the activity trail.

export const DeviceInfoSchema = z.object({
  deviceType: z.enum(["phone", "tablet", "desktop"]),
  /** CSS-pixel viewport (window.innerWidth/Height) — what layouts respond to. */
  viewportWidth: z.number().int().min(1).max(20000),
  viewportHeight: z.number().int().min(1).max(20000),
  /** CSS-pixel screen size (screen.width/height). */
  screenWidth: z.number().int().min(1).max(20000),
  screenHeight: z.number().int().min(1).max(20000),
  /** window.devicePixelRatio — retina density and/or browser zoom. */
  devicePixelRatio: z.number().min(0.1).max(10),
  /** Desktop browser-zoom estimate in % (outerWidth/innerWidth); absent on mobile. */
  zoomPercent: z.number().int().min(10).max(1000).optional(),
  /** visualViewport.scale at report time — mobile pinch zoom. */
  pinchScale: z.number().min(0.1).max(10).optional(),
  orientation: z.enum(["portrait", "landscape"]),
  browser: z.string().min(1).max(40).optional(),
  os: z.string().min(1).max(40).optional(),
});
export type DeviceInfo = z.infer<typeof DeviceInfoSchema>;

export const AdminDeviceSchema = z.object({
  id: z.number().int().positive(),
  info: DeviceInfoSchema,
  firstSeen: z.string().min(1),
  lastSeen: z.string().min(1),
  /** Times this signature reported (≈ sessions/resizes on this setup). */
  hits: z.number().int().positive(),
});
export type AdminDevice = z.infer<typeof AdminDeviceSchema>;

// `GET /api/admin/users/:id/devices` — most recently seen first.
export const AdminDevicesResponseSchema = z.object({
  devices: z.array(AdminDeviceSchema),
});
export type AdminDevicesResponse = z.infer<typeof AdminDevicesResponseSchema>;
