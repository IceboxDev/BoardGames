// Site hibernation state: one row (`site_state`, migration 0069) saying
// whether the whole site is asleep, plus the group's totals frozen at that
// moment for the goodbye screen.
//
// The gate consults this on every request, so it is served from memory. This
// is a single-process server and every write goes through `hibernate` /
// `wake` here, which update the cache in the same breath; the 30 s re-read is
// only a safety net (a manual DB edit, a second process in dev).
//
// Hibernating writes nothing but this row and its log line. Nights, RSVPs,
// accounts and feed tokens are untouched, so waking is a full restore: the
// calendar feed reads the flag and emits upcoming nights as cancelled while
// asleep (see `calendar-feed-public.ts`).

import { getBggBySlug } from "@boardgames/core/bgg";
import { type Memorial, MemorialSchema, nightDate } from "@boardgames/core/protocol";
import { z } from "zod";
import { getDb } from "../db.ts";
import { parseRow, parseRows } from "./db-rows.ts";

export interface SiteState {
  /** ISO time the site went to sleep; null while awake. */
  hibernatedAt: string | null;
  memorial: Memorial | null;
}

const AWAKE: SiteState = { hibernatedAt: null, memorial: null };
const REFRESH_MS = 30_000;

let cache: SiteState = AWAKE;
let loadedAt = 0;
let loading: Promise<void> | null = null;

const StateRowSchema = z.object({
  hibernated_at: z.string().nullable(),
  memorial_json: z.string().nullable(),
});

async function load(): Promise<void> {
  const { rows } = await getDb().execute(
    "SELECT hibernated_at, memorial_json FROM site_state WHERE id = 1",
  );
  const row = rows[0] ? parseRow(StateRowSchema, rows[0], "site_state") : null;
  cache = row?.hibernated_at
    ? {
        hibernatedAt: row.hibernated_at,
        memorial: row.memorial_json ? parseMemorial(row.memorial_json) : null,
      }
    : AWAKE;
  loadedAt = Date.now();
}

function parseMemorial(json: string): Memorial | null {
  try {
    return MemorialSchema.parse(JSON.parse(json));
  } catch (err) {
    console.error("[site-state] unreadable memorial_json:", err);
    return null;
  }
}

/**
 * The current state. Fresh enough for a request gate: re-read from the DB at
 * most every 30 s, and immediately after this process changes it. A failed
 * read keeps the last known state (a DB hiccup must not wake or freeze the
 * site), so the very first read failing reads as awake.
 */
export async function getSiteState(): Promise<SiteState> {
  if (Date.now() - loadedAt >= REFRESH_MS) {
    loading ??= load()
      .catch((err) => console.error("[site-state] refresh failed:", err))
      .finally(() => {
        loading = null;
      });
    await loading;
  }
  return cache;
}

/** Test seam: forget the cached state so the next read goes to the DB. */
export function resetSiteStateCache(): void {
  cache = AWAKE;
  loadedAt = 0;
  loading = null;
}

// ── Memorial ──────────────────────────────────────────────────────────

const CountRowSchema = z.object({ n: z.number() });
const KeyRowSchema = z.object({ date_key: z.string() });
const OfflinePlaysRowSchema = z.object({
  game_slug: z.string().nullable(),
  game_title: z.string(),
  n: z.number(),
});
const OnlinePlaysRowSchema = z.object({ game_slug: z.string(), n: z.number() });

const TOP_GAMES = 5;

/** Today as YYYY-MM-DD in the site's time zone (nights are local dates). */
export function todayKey(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: process.env.ICAL_TZID ?? "Europe/Berlin",
  }).format(now);
}

/** The group's totals as of now. */
export async function computeMemorial(now = new Date()): Promise<Memorial> {
  const db = getDb();
  const [locks, matches, online, members, offlinePlays, onlinePlays] = await db.batch(
    [
      "SELECT date_key FROM locked_dates",
      "SELECT COUNT(*) AS n FROM match_results",
      "SELECT COUNT(*) AS n FROM session_replays",
      `SELECT COUNT(*) AS n FROM "user" WHERE COALESCE(guest, 0) = 0`,
      `SELECT game_slug, game_title, COUNT(*) AS n FROM match_results
        GROUP BY game_slug, game_title`,
      "SELECT game_slug, COUNT(*) AS n FROM session_replays GROUP BY game_slug",
    ],
    "read",
  );
  const today = todayKey(now);
  const held = parseRows(KeyRowSchema, locks?.rows ?? [], "locked_dates")
    .map((r) => nightDate(r.date_key))
    .filter((d) => d < today);
  const days = [...new Set(held)].sort();

  // Offline and online plays together, keyed by slug (or by title for a
  // hand-recorded game outside the catalog).
  const plays = new Map<string, { slug: string | null; title: string; plays: number }>();
  const add = (slug: string | null, title: string, n: number) => {
    const key = slug ?? `title:${title}`;
    const prev = plays.get(key);
    if (prev) prev.plays += n;
    else plays.set(key, { slug, title, plays: n });
  };
  for (const r of parseRows(OfflinePlaysRowSchema, offlinePlays?.rows ?? [], "match_results")) {
    add(r.game_slug, (r.game_slug && getBggBySlug(r.game_slug)?.name) || r.game_title, r.n);
  }
  for (const r of parseRows(OnlinePlaysRowSchema, onlinePlays?.rows ?? [], "session_replays")) {
    add(r.game_slug, getBggBySlug(r.game_slug)?.name ?? r.game_slug, r.n);
  }
  const topGames = [...plays.values()]
    .sort((a, b) => b.plays - a.plays || a.title.localeCompare(b.title))
    .slice(0, TOP_GAMES);

  const count = (rs: typeof matches) =>
    rs?.rows[0] ? parseRow(CountRowSchema, rs.rows[0], "count").n : 0;
  return {
    nights: held.length,
    matches: count(matches),
    onlineGames: count(online),
    members: count(members),
    firstNight: days[0] ?? null,
    lastNight: days.at(-1) ?? null,
    topGames,
  };
}

// ── Hibernate / wake ──────────────────────────────────────────────────

/**
 * Put the site to sleep. Idempotent: hibernating a sleeping site changes
 * nothing and logs nothing (the UPDATE is guarded on `hibernated_at IS NULL`,
 * and the log line only lands when that UPDATE did).
 */
export async function hibernate(adminId: string, now = new Date()): Promise<SiteState> {
  const memorial = await computeMemorial(now);
  const at = now.toISOString();
  await getDb().batch(
    [
      {
        sql: `UPDATE site_state SET hibernated_at = ?, hibernated_by = ?, memorial_json = ?
               WHERE id = 1 AND hibernated_at IS NULL`,
        args: [at, adminId, JSON.stringify(memorial)],
      },
      {
        sql: `INSERT INTO site_state_log (at, action, by_user_id)
              SELECT ?, 'hibernate', ? WHERE changes() > 0`,
        args: [at, adminId],
      },
    ],
    "write",
  );
  await load();
  return cache;
}

/** Wake the site. Idempotent like {@link hibernate}. The memorial is kept
 *  in the row (overwritten by the next hibernation) — it is history. */
export async function wake(adminId: string, now = new Date()): Promise<SiteState> {
  const at = now.toISOString();
  await getDb().batch(
    [
      {
        sql: `UPDATE site_state SET hibernated_at = NULL, hibernated_by = NULL, woken_at = ?
               WHERE id = 1 AND hibernated_at IS NOT NULL`,
        args: [at],
      },
      {
        sql: `INSERT INTO site_state_log (at, action, by_user_id)
              SELECT ?, 'wake', ? WHERE changes() > 0`,
        args: [at, adminId],
      },
    ],
    "write",
  );
  await load();
  return cache;
}

const LogRowSchema = z.object({
  at: z.string(),
  action: z.enum(["hibernate", "wake"]),
  by_name: z.string().nullable(),
});

/** The latest hibernate / wake entries, newest first. */
export async function siteLog(limit = 20) {
  const { rows } = await getDb().execute({
    sql: `SELECT l.at, l.action, u.name AS by_name
            FROM site_state_log l LEFT JOIN "user" u ON u.id = l.by_user_id
           ORDER BY l.id DESC LIMIT ?`,
    args: [limit],
  });
  return parseRows(LogRowSchema, rows, "site_state_log").map((r) => ({
    at: r.at,
    action: r.action,
    byName: r.by_name,
  }));
}
