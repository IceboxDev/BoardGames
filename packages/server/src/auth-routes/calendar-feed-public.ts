// Public iCalendar feed endpoint. Auth via path token (see auth/feed-token.ts).
// Response is `text/calendar; charset=utf-8` with ETag/Last-Modified caching;
// `If-None-Match` returns 304. The feed enumerates every locked date the
// viewer has a relationship with in the [today-90d, today+365d] window, plus
// recent tombstones (cancelled events). Each VEVENT carries a per-(user,date)
// SEQUENCE that monotonically bumps when content materially changes — required
// for Outlook to apply updates.

import { createHash } from "node:crypto";
import { getBggBySlug } from "@boardgames/core/bgg";
import { buildIcs, type IcsEvent } from "@boardgames/core/ical/builder";
import {
  buildDndDescription,
  buildDndSummary,
  type DndPartyMember,
  isDndFeedNight,
} from "@boardgames/core/ical/dnd";
import { buildSummary, deriveSummaryPrefix } from "@boardgames/core/ical/personalization";
import { redactToken } from "@boardgames/core/ical/token";
import { Hono } from "hono";
import { z } from "zod";
import { requireFeedToken } from "../auth/feed-token.ts";
import type { FeedEnv } from "../auth/types.ts";
import { getDb } from "../db.ts";
import {
  type AvailableGamesView,
  computeAvailableGamesPayload,
  getTombstone,
  listLockedDatesForViewer,
  maxSqliteDatetime,
  type TombstoneRow,
} from "../lib/available-games.ts";
import { parseRow } from "../lib/db-rows.ts";

/** `SELECT state_digest, sequence FROM calendar_feed_event_versions`. */
const FeedEventVersionRowSchema = z.object({
  state_digest: z.string(),
  sequence: z.number(),
});

const TZID = process.env.ICAL_TZID ?? "Europe/Berlin";
const UID_DOMAIN = process.env.ICAL_UID_DOMAIN ?? "boardgames.local";
const PROD_ID = "-//boardgames//Calendar Sync 1.0//EN";
const CAL_NAME = "Game Nights";
const CAL_DESC = "Your personal game-night feed: hosts, picks, what to bring.";
const DEFAULT_DURATION_HOURS = 4;
const PAST_DAYS = 90;
const FUTURE_DAYS = 365;
const TOMBSTONE_TTL_DAYS = 30;

export const calendarFeedPublicRoutes = new Hono<FeedEnv>();

calendarFeedPublicRoutes.use("/feed/:token/*", requireFeedToken);
calendarFeedPublicRoutes.use("/feed/:token", requireFeedToken);

calendarFeedPublicRoutes.get("/feed/:token/calendar.ics", async (c) => {
  const viewerId = c.get("feedUserId");
  const now = new Date();

  const fromInclusive = formatDateKey(addDays(now, -PAST_DAYS));
  const toExclusive = formatDateKey(addDays(now, FUTURE_DAYS + 1));
  const tombstoneCutoff = sqliteDatetime(addDays(now, -TOMBSTONE_TTL_DAYS));

  let refs: Awaited<ReturnType<typeof listLockedDatesForViewer>>;
  try {
    refs = await listLockedDatesForViewer({
      db: getDb(),
      viewerId,
      fromInclusive,
      toExclusive,
      tombstoneCutoff,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[ical-feed] list-dates failed: ${redactToken(msg)}`);
    return c.text("Internal error.", 500);
  }

  // Stable emit order: chronological by date, with locked-then-tombstone for
  // any (rare) collision where a tombstone hasn't been deleted by a re-lock.
  refs.sort((a, b) => {
    if (a.dateKey !== b.dateKey) return a.dateKey < b.dateKey ? -1 : 1;
    if (a.source !== b.source) return a.source === "locked" ? -1 : 1;
    return 0;
  });
  const seenDates = new Set<string>();
  const uniqueRefs = refs.filter((r) => {
    if (seenDates.has(r.dateKey)) return false;
    seenDates.add(r.dateKey);
    return true;
  });

  const events: IcsEvent[] = [];
  for (const ref of uniqueRefs) {
    try {
      const ev =
        ref.source === "locked"
          ? await buildEventForLockedDate(viewerId, ref.dateKey)
          : await buildEventForTombstone(viewerId, ref.dateKey);
      if (ev) events.push(ev);
    } catch (err) {
      // One malformed date shouldn't bring down the whole subscription.
      // Log and skip — calendar clients will just not see this event.
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[ical-feed] event ${ref.dateKey} (${ref.source}) failed: ${redactToken(msg)}`);
    }
  }

  const body = buildIcs({
    prodId: PROD_ID,
    calName: CAL_NAME,
    calDesc: CAL_DESC,
    tzid: TZID,
    events,
  });

  const etag = `"${createHash("sha256").update(body, "utf-8").digest("hex").slice(0, 16)}"`;
  const lastModified = httpDate(latestLastModified(events) ?? now);

  // Honor If-None-Match → 304. Saves the calendar app a body read on every
  // poll, which Apple and Outlook do often. Note: this comparison is
  // structural — clients quote the ETag, we do too.
  const inm = c.req.header("if-none-match");
  if (inm && inm === etag) {
    c.header("ETag", etag);
    c.header("Cache-Control", "private, max-age=300, must-revalidate");
    c.header("Last-Modified", lastModified);
    return c.body(null, 304);
  }

  c.header("Content-Type", "text/calendar; charset=utf-8");
  c.header("Content-Disposition", `inline; filename="game-nights.ics"`);
  c.header("Cache-Control", "private, max-age=300, must-revalidate");
  c.header("ETag", etag);
  c.header("Last-Modified", lastModified);
  return c.body(body);
});

// ── Per-event composition ─────────────────────────────────────────────

async function buildEventForLockedDate(
  viewerId: string,
  dateKey: string,
): Promise<IcsEvent | null> {
  const view = await computeAvailableGamesPayload({ db: getDb(), date: dateKey, viewerId });
  if (!view) return null;
  // DTSTAMP and LAST-MODIFIED both reflect the latest data freshness for
  // this event — not the request clock. Stable across polls when nothing
  // changes, so the ETag matches and 304 fires.
  const stamp = formatUtcFromSqlite(view.latestActivityAt);

  // A sealed D&D night takes over the whole entry: themed title + quest copy,
  // no other-game references — mirroring the web's D&D-night panel. Every other
  // night keeps the generic "Game Night / Top picks / bring X" shape.
  let summary: string;
  let description: string;
  if (isDndFeedNight(view.lock.picksLockedAt, view.wire.topSlugs[0])) {
    ({ summary, description } = buildDndEvent(view, viewerId, dateKey));
  } else {
    // Resolve the viewer's bring slugs into display titles (for the title's
    // [Bring: …] prefix and the description body).
    const bringingTitles = resolveSlugTitles(view.viewer.bringing);
    const topPickTitles = resolveSlugTitles(view.wire.topSlugs);

    const prefix = deriveSummaryPrefix({
      expectedUserIds: view.lock.expectedUserIds,
      picksLockedAt: view.lock.picksLockedAt,
      viewerId,
      viewerRsvp: view.viewer.rsvp,
      viewerManuallyRsvped: view.viewer.rsvpManual,
      viewerHyped: view.viewer.hyped,
      viewerBringing: bringingTitles,
    });
    summary = buildSummary(prefix, view.lock.hostName);
    description = buildDescription({ view, topPickTitles, bringingTitles, dateKey });
  }

  const { start, end } = buildEventTimes(dateKey, view.lock.eventTime);
  const sequence = await bumpSequence(viewerId, dateKey, view, "CONFIRMED");
  return {
    uid: buildUid(dateKey, viewerId),
    start,
    ...(end ? { end } : {}),
    summary,
    description,
    location: view.lock.address,
    status: "CONFIRMED",
    sequence,
    lastModified: stamp,
    dtstamp: stamp,
    url: buildDeepLink(dateKey),
  };
}

async function buildEventForTombstone(viewerId: string, dateKey: string): Promise<IcsEvent | null> {
  const t = await getTombstone(getDb(), dateKey);
  if (!t) return null;
  // Emit a CANCELLED event so calendars that already absorbed the original
  // remove it. The body is sparse — host name and address as they were at
  // unlock time, plus a single line explaining the state. DTSTAMP/LAST-
  // MODIFIED both come from `unlocked_at` so polls don't churn.
  const stamp = formatUtcFromSqlite(maxSqliteDatetime([t.unlockedAt]));
  const summary = buildSummary("[Cancelled]", t.hostName);
  const description = "This game night was unlocked by the host.\nIt's no longer happening.";
  const { start, end } = buildEventTimes(dateKey, t.eventTime);
  // Tombstones don't have view state to digest; we synthesize one that
  // bumps once when the tombstone first appears.
  const sequence = await bumpSequence(viewerId, dateKey, null, "CANCELLED", t.unlockedAt);
  return {
    uid: buildUid(dateKey, viewerId),
    start,
    ...(end ? { end } : {}),
    summary,
    description,
    location: t.address,
    status: "CANCELLED",
    sequence,
    lastModified: stamp,
    dtstamp: stamp,
  };
}

// ── D&D-night entry ───────────────────────────────────────────────────

function buildDndEvent(
  view: AvailableGamesView,
  viewerId: string,
  dateKey: string,
): { summary: string; description: string } {
  const attendees = view.wire.attendees;
  // Dungeon Master: a definite admin runs the table; the host takes over when no
  // admin is in the party. Mirrors `DndNightPanel`.
  const dm =
    attendees.find((a) => a.isAdmin && a.status === "definite") ??
    attendees.find((a) => a.isHost) ??
    null;
  const dmName = dm?.name ?? view.lock.hostName ?? null;

  // On a sealed D&D night only [Not going] / [RSVP!] still apply — there's no
  // voting and nothing to bring, so force the bring list empty (kills the
  // [Bring: …] branch) and let [Vote?] fall away naturally (picks are locked).
  const prefix = deriveSummaryPrefix({
    expectedUserIds: view.lock.expectedUserIds,
    picksLockedAt: view.lock.picksLockedAt,
    viewerId,
    viewerRsvp: view.viewer.rsvp,
    viewerManuallyRsvped: view.viewer.rsvpManual,
    viewerHyped: view.viewer.hyped,
    viewerBringing: [],
  });
  const summary = buildDndSummary(prefix, dmName);

  const definiteCount = attendees.filter((a) => a.status === "definite").length;
  const party: DndPartyMember[] = attendees.map((a) => ({
    name: a.name,
    role: a.userId === dm?.userId ? "dm" : a.isHost ? "host" : "player",
    tentative: a.status === "tentative",
  }));

  const description = buildDndDescription({
    partyCount: definiteCount,
    tentativeCount: attendees.length - definiteCount,
    party,
    personalNudge: dndPersonalNudge(view),
    deepLink: buildDeepLink(dateKey) ?? null,
  });
  return { summary, description };
}

/** Themed equivalent of the generic decline / RSVP nudge lines. */
function dndPersonalNudge(view: AvailableGamesView): string | null {
  if (view.viewer.rsvp === "no") return "You're sitting this quest out.";
  if (view.viewer.inExpectedSet && view.viewer.rsvp !== "yes" && !view.viewer.rsvpManual) {
    return "Answer the call — RSVP in the planner.";
  }
  return null;
}

function buildDescription(opts: {
  view: AvailableGamesView;
  topPickTitles: string[];
  bringingTitles: string[];
  dateKey: string;
}): string {
  const { view, topPickTitles, bringingTitles, dateKey } = opts;
  // Address and time are intentionally NOT repeated here — they already ride
  // on dedicated ICS properties (LOCATION and DTSTART;TZID), which every
  // calendar client renders in its own UI slots. Repeating them in the body
  // is just visual duplication in apps that show description + location +
  // time stacked together.
  const lines: string[] = [];

  if (topPickTitles.length > 0) {
    const head = topPickTitles.slice(0, 3).join(", ");
    const more = topPickTitles.length > 3 ? ` (${topPickTitles.length - 3} more)` : "";
    lines.push(`Top picks: ${head}${more}`);
  }
  if (bringingTitles.length > 0) {
    lines.push(`You're bringing: ${bringingTitles.join(", ")}`);
  }

  // Personal action items. Each line mirrors a title-prefix branch in
  // `deriveSummaryPrefix`, in the same priority order: declined → RSVP gap
  // → voting gap. Each is mutually exclusive in practice but we emit them
  // independently here because the description is allowed to surface more
  // than one nudge at once.
  const isViewerExpected = view.viewer.inExpectedSet;
  const isViewerDefinite = view.viewer.rsvp === "yes" || isViewerExpected;
  if (view.viewer.rsvp === "no") {
    lines.push("You declined this one.");
  } else if (isViewerExpected && view.viewer.rsvp !== "yes" && !view.viewer.rsvpManual) {
    lines.push("You still need to RSVP — open the planner.");
  } else if (isViewerDefinite && view.lock.picksLockedAt === null && !view.viewer.hyped) {
    lines.push("You still need to vote on games — open the planner.");
  }

  if (lines.length > 0) lines.push("");

  const attendees = view.wire.attendees;
  const definiteCount = attendees.filter((a) => a.status === "definite").length;
  const tentativeCount = attendees.length - definiteCount;
  if (attendees.length > 0) {
    const parts = [`${definiteCount} confirmed`];
    if (tentativeCount > 0) parts.push(`${tentativeCount} maybe`);
    lines.push(`Attendees (${parts.join(", ")}):`);
    for (const a of attendees) {
      const bringingForLine = resolveSlugTitles(a.bringing);
      lines.push(
        truncate(
          formatAttendeeLine({
            name: a.name,
            isHost: a.isHost,
            status: a.status,
            bringing: bringingForLine,
          }),
          80,
        ),
      );
    }
  }

  const webOrigin = primaryWebOrigin();
  if (webOrigin) {
    lines.push("");
    lines.push(`Open: ${webOrigin}/offline?date=${dateKey}`);
  }

  return lines.join("\n");
}

function formatAttendeeLine(a: {
  name: string;
  isHost: boolean;
  status: "definite" | "tentative";
  bringing: string[];
}): string {
  let line = `• ${a.name}`;
  if (a.isHost) line += " (host)";
  else if (a.status === "tentative") line += " (maybe)";
  if (a.bringing.length > 0) {
    // Bring list is already slugs; for the description we want titles, but
    // we already only have slugs here. Caller passed `attendees` from the
    // payload which carries `bringing` as slugs — so we resolve via the
    // bgg snapshot. To keep this function pure we just format the slug.
    line += ` — bringing ${a.bringing.join(", ")}`;
  }
  return line;
}

// ── SEQUENCE versioning ───────────────────────────────────────────────

async function bumpSequence(
  viewerId: string,
  dateKey: string,
  view: AvailableGamesView | null,
  status: "CONFIRMED" | "CANCELLED",
  tombstoneStamp?: string,
): Promise<number> {
  const digestPayload = view
    ? canonicalizeView(view, status)
    : JSON.stringify({ status, tombstoneStamp });
  const digest = createHash("sha256").update(digestPayload).digest("hex");

  const { rows } = await getDb().execute({
    sql: "SELECT state_digest, sequence FROM calendar_feed_event_versions WHERE user_id = ? AND date_key = ?",
    args: [viewerId, dateKey],
  });
  const row = rows[0]
    ? parseRow(FeedEventVersionRowSchema, rows[0], "calendar_feed_event_versions")
    : null;
  if (row && row.state_digest === digest) {
    return row.sequence;
  }
  const nextSequence = (row?.sequence ?? -1) + 1;
  await getDb().execute({
    sql: `INSERT INTO calendar_feed_event_versions
            (user_id, date_key, state_digest, sequence, updated_at)
          VALUES (?, ?, ?, ?, datetime('now'))
          ON CONFLICT(user_id, date_key) DO UPDATE SET
            state_digest = excluded.state_digest,
            sequence = excluded.sequence,
            updated_at = excluded.updated_at`,
    args: [viewerId, dateKey, digest, nextSequence],
  });
  return nextSequence;
}

function canonicalizeView(view: AvailableGamesView, status: "CONFIRMED" | "CANCELLED"): string {
  // Stable JSON for state-digest comparison. Sort everything that could
  // arrive in any order so two semantically-equal views yield equal digests.
  return JSON.stringify({
    status,
    address: view.lock.address,
    eventTime: view.lock.eventTime,
    hostUserId: view.lock.hostUserId,
    picksLockedAt: view.lock.picksLockedAt,
    topSlugs: [...view.wire.topSlugs].sort(),
    viewerBringing: [...view.viewer.bringing].sort(),
    viewerRsvp: view.viewer.rsvp ?? null,
    viewerRsvpManual: view.viewer.rsvpManual,
    viewerHyped: view.viewer.hyped,
    attendeeIds: view.wire.attendees.map((a) => a.userId).sort(),
    expectedUserIds: [...view.lock.expectedUserIds].sort(),
  });
}

// ── Encoding helpers ──────────────────────────────────────────────────

function buildUid(dateKey: string, viewerId: string): string {
  // Per-user UID keeps the same event stable across the viewer's
  // subscription lifetime — same UID on next render = update, not a new
  // event. 4-char hex slice avoids leaking the full user id in the file
  // body while still disambiguating UIDs across feeds.
  const shortId = createHash("sha256").update(viewerId).digest("hex").slice(0, 8);
  return `${dateKey}-${shortId}@${UID_DOMAIN}`;
}

function buildEventTimes(
  dateKey: string,
  eventTime: string | null,
): { start: IcsEvent["start"]; end?: IcsEvent["end"] } {
  if (!eventTime) {
    // All-day: emit a DATE-typed DTSTART, no DTEND, no TZID.
    return { start: { date: dateKey.replace(/-/g, "") } };
  }
  const [hh, mm] = eventTime.split(":");
  const startStamp = `${dateKey.replace(/-/g, "")}T${hh}${mm}00`;
  // Default DEFAULT_DURATION_HOURS-hour game night.
  const endStamp = addHoursToLocalStamp(startStamp, DEFAULT_DURATION_HOURS);
  return {
    start: { dateTime: startStamp, tzid: TZID },
    end: { dateTime: endStamp, tzid: TZID },
  };
}

function addHoursToLocalStamp(stamp: string, hours: number): string {
  // Parse YYYYMMDDTHHMMSS, treat as floating, add hours in-place. We
  // deliberately do not convert to UTC — the time is wall-clock local.
  const y = Number.parseInt(stamp.slice(0, 4), 10);
  const m = Number.parseInt(stamp.slice(4, 6), 10) - 1;
  const d = Number.parseInt(stamp.slice(6, 8), 10);
  const hh = Number.parseInt(stamp.slice(9, 11), 10);
  const mm = Number.parseInt(stamp.slice(11, 13), 10);
  const ss = Number.parseInt(stamp.slice(13, 15), 10);
  const date = new Date(Date.UTC(y, m, d, hh + hours, mm, ss));
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return (
    pad(date.getUTCFullYear(), 4) +
    pad(date.getUTCMonth() + 1) +
    pad(date.getUTCDate()) +
    "T" +
    pad(date.getUTCHours()) +
    pad(date.getUTCMinutes()) +
    pad(date.getUTCSeconds())
  );
}

function buildDeepLink(dateKey: string): string | undefined {
  const origin = primaryWebOrigin();
  if (!origin) return undefined;
  return `${origin}/offline?date=${dateKey}`;
}

function primaryWebOrigin(): string | null {
  const raw = process.env.WEB_ORIGIN?.split(",")[0]?.trim().replace(/\/+$/, "");
  if (!raw) return null;
  if (/^https?:\/\//.test(raw)) return raw;
  return `https://${raw}`;
}

function resolveSlugTitles(slugs: readonly string[]): string[] {
  // The payload only carries slugs. Resolve to BGG titles for display; fall
  // back to the raw slug when the snapshot doesn't know it. The title is
  // for human display only — not stability, not identity.
  return slugs.map((slug) => getBggBySlug(slug)?.name ?? slug);
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

function latestLastModified(events: IcsEvent[]): Date | null {
  let latest: number | null = null;
  for (const ev of events) {
    const t = parseIcsUtcStamp(ev.lastModified);
    if (t != null && (latest == null || t > latest)) latest = t;
  }
  return latest == null ? null : new Date(latest);
}

function parseIcsUtcStamp(stamp: string): number | null {
  // "YYYYMMDDTHHMMSSZ"
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(stamp);
  if (!m) return null;
  return Date.UTC(
    Number.parseInt(m[1] ?? "0", 10),
    Number.parseInt(m[2] ?? "1", 10) - 1,
    Number.parseInt(m[3] ?? "0", 10),
    Number.parseInt(m[4] ?? "0", 10),
    Number.parseInt(m[5] ?? "0", 10),
    Number.parseInt(m[6] ?? "0", 10),
  );
}

function httpDate(d: Date): string {
  // RFC 1123 — `toUTCString` produces exactly the expected format.
  return d.toUTCString();
}

/** Convert a SQLite "YYYY-MM-DD HH:MM:SS" (UTC-ish) to RFC 5545
 *  "YYYYMMDDTHHMMSSZ". SQLite's datetime('now') is UTC by default. */
function formatUtcFromSqlite(stamp: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(stamp);
  if (!m) return "19700101T000000Z";
  return `${m[1]}${m[2]}${m[3]}T${m[4]}${m[5]}${m[6]}Z`;
}

function formatDateKey(d: Date): string {
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function sqliteDatetime(d: Date): string {
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return (
    `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`
  );
}

function addDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}

// Silence unused-symbol warnings for typed re-exports we keep for clarity.
export type { TombstoneRow };
