import { z } from "zod";

// ── Member activity log (admin drawer) ─────────────────────────────────
//
// The envelope keeps `type` an open string and `meta` an open record on
// purpose: web and server deploy separately, so a client can meet an event
// kind it doesn't know yet. The vocabulary — every type and its meta shape —
// lives in `activity-events.ts`; readers narrow a row with
// `parseActivityMeta`.

export const ActivityEntrySchema = z.object({
  id: z.number().int().positive(),
  type: z.string().min(1),
  // Per-type payload (date keys, slugs, target user ids, counts); see
  // `ActivityMetaSchemas`.
  meta: z.record(z.string(), z.unknown()),
  // SQLite `datetime('now')` — UTC, "YYYY-MM-DD HH:MM:SS". Insertion time.
  createdAt: z.string().min(1),
  // When the event happened, epoch ms, stamped by the server as it handled
  // the request (before the fire-and-forget insert) — the trail's sort key.
  // Optional only for a server that predates it; readers fall back to
  // `createdAt`.
  occurredAtMs: z.number().int().nonnegative().optional(),
});
export type ActivityEntry = z.infer<typeof ActivityEntrySchema>;

// `GET /api/admin/users/:userId/activity?before=<id>&limit=<n>` — keyset
// pagination newest-first by (occurredAtMs, id); `before` is the id of the
// last entry of the previous page, and the server resumes after its sort key.
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

// ── Unseen activity (admin users-table bubble) ─────────────────────────
//
// Each admin keeps their own "seen up to id N" marker per member, so the
// bubble next to a name answers "what happened since I last looked" for
// THIS admin — two admins looking at different times see different counts.

// `GET /api/admin/users/unseen-activity` — activity rows newer than the
// calling admin's marker, per member id. Members with nothing new are
// absent (read as 0); a member this admin has never opened counts every row.
export const UnseenActivityResponseSchema = z.object({
  counts: z.record(z.string(), z.number().int().nonnegative()),
});
export type UnseenActivityResponse = z.infer<typeof UnseenActivityResponseSchema>;

// `POST /api/admin/users/:userId/activity/seen` — the newest entry id the
// admin has just been shown. The server keeps the marker monotonic, so a
// stale tab can never move it backwards.
export const ActivitySeenBodySchema = z.object({
  lastSeenId: z.number().int().positive(),
});
export type ActivitySeenBody = z.input<typeof ActivitySeenBodySchema>;

// `POST /api/activity/view` — client-side page-view beacon. `page` is a
// `PageViewPage` (activity-events.ts) on the sending side, but a plain string
// here so a newer web build's page is recorded, not rejected; `detail`
// narrows it (a date key for "night", a game slug for "play"); `via` says
// what opened it (`greeting:spotlight`). The client drops re-render repeats;
// the server just records.
export const PageViewBodySchema = z.object({
  page: z.string().min(1).max(64),
  detail: z.string().min(1).max(100).optional(),
  via: z.string().min(1).max(64).optional(),
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
  /**
   * Stable physical-device hash (platform, rotation-invariant screen, input/
   * CPU/memory class, timezone, language, WebGL renderer) — everything
   * viewport/zoom-dependent is deliberately excluded, so all resolution rows
   * from one device share it. Absent on rows recorded before it existed.
   */
  fingerprint: z.string().min(1).max(32).optional(),
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
