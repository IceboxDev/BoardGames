// Public user profiles: an aggregate read over existing tables plus the small
// editable `user_profiles` row. Every logged-in member can view every profile
// (no per-section privacy); only the owner may edit their own.
//
//   GET  /api/profiles                 → directory (browse everyone)
//   GET  /api/profiles/:userId         → full aggregated profile
//   GET  /api/profiles/:userId/matches → that user's match history (paginated)
//   PUT  /api/profiles/:userId         → update own editable profile (self only)
//
// Per-user match filtering uses `outcome_json LIKE '%"userId":"<id>"%'` then
// re-validates membership with `extractParticipantIds` (better-auth ids are
// alphanumeric; the re-check makes the rare LIKE over-match harmless). Win/loss
// derivation is the shared core helper so stats and the web's result badges
// never disagree.

import {
  deriveParticipantResult,
  extractParticipantIds,
} from "@boardgames/core/history/participant-results";
import {
  HistoryListResponseSchema,
  ProfileDirectoryResponseSchema,
  type ProfileEditable,
  ProfileEditableSchema,
  ProfileLinkSchema,
  type ProfilePerGameStat,
  ProfileUpdateInputSchema,
  PublicProfileSchema,
  SkillChartSchema,
  SlugListSchema,
} from "@boardgames/core/protocol";
import { z } from "zod";
import { authedApp } from "../auth/index.ts";
import { getDb } from "../db.ts";
import { computeAvailableGamesPayload } from "../lib/available-games.ts";
import { jsonColumn, parseRow, parseRows, RowParseError } from "../lib/db-rows.ts";
import { errorResponse, zJsonBody } from "../lib/error-response.ts";
import {
  findNextNightDateKeysForUsers,
  findNextNightForUser,
  todayDateKey,
} from "../lib/next-night.ts";
import { fetchNameMap, MatchResultRowSchema, rowToMatchRecord } from "./match-history.ts";

export const profileRoutes = authedApp();

const DEFAULT_MATCH_LIMIT = 50;
const MAX_MATCH_LIMIT = 200;
const RECENT_MATCH_COUNT = 10;
const PER_GAME_MAX = 8;

// ── Row projections ────────────────────────────────────────────────────

const UserRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  image: z.string().nullable(),
  role: z.string().nullable(),
  // CAST to TEXT in the SELECT so better-auth's `date` column (string or epoch)
  // arrives as one type regardless of how it was stored.
  created_at: z.string().nullable(),
});

const DirectoryUserRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  image: z.string().nullable(),
});

const ProfileRowSchema = z.object({
  tagline: z.string().nullable(),
  bio: z.string().nullable(),
  pronouns: z.string().nullable(),
  location: z.string().nullable(),
  accent_hex: z.string().nullable(),
  favorite_game_slugs_json: jsonColumn(SlugListSchema),
  wishlist_game_slugs_json: jsonColumn(SlugListSchema),
  links_json: jsonColumn(z.array(ProfileLinkSchema)),
  skill_json: z.string().nullable(),
});

const DirectoryProfileRowSchema = z.object({
  user_id: z.string(),
  tagline: z.string().nullable(),
  accent_hex: z.string().nullable(),
});

const InventoryRowSchema = z.object({
  user_id: z.string(),
  game_slugs_json: jsonColumn(SlugListSchema),
});

const ViewerInventoryRowSchema = z.object({
  game_slugs_json: jsonColumn(SlugListSchema),
});

const EMPTY_EDITABLE: ProfileEditable = {
  tagline: null,
  bio: null,
  pronouns: null,
  location: null,
  accentHex: null,
  favorites: [],
  wishlist: [],
  links: [],
};

// ── Helpers ────────────────────────────────────────────────────────────

/** Normalize better-auth's `createdAt` (string or epoch) to an ISO-8601 string. */
function toIso(value: string | null): string {
  if (!value) return new Date(0).toISOString();
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) {
    const ms = Number(trimmed);
    const d = new Date(ms < 1e12 ? ms * 1000 : ms);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  const d = new Date(trimmed);
  return Number.isNaN(d.getTime()) ? trimmed : d.toISOString();
}

function clampLimit(raw: string | undefined): number {
  const n = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, MAX_MATCH_LIMIT) : DEFAULT_MATCH_LIMIT;
}

/** `accent_hex` is validated on write; coerce anything unexpected to null. */
function safeAccent(value: string | null): string | null {
  return value && /^#[0-9a-fA-F]{6}$/.test(value) ? value : null;
}

function likePattern(userId: string): string {
  return `%"userId":"${userId}"%`;
}

function readEditableRow(row: z.infer<typeof ProfileRowSchema>): {
  editable: ProfileEditable;
  skill: z.infer<typeof SkillChartSchema>;
} {
  let skill: z.infer<typeof SkillChartSchema> = null;
  if (row.skill_json) {
    try {
      skill = SkillChartSchema.parse(JSON.parse(row.skill_json));
    } catch {
      skill = null; // generated later by a trusted job; tolerate bad/absent data
    }
  }
  return {
    editable: {
      tagline: row.tagline,
      bio: row.bio,
      pronouns: row.pronouns,
      location: row.location,
      accentHex: safeAccent(row.accent_hex),
      favorites: row.favorite_game_slugs_json,
      wishlist: row.wishlist_game_slugs_json,
      links: row.links_json,
    },
    skill,
  };
}

function normalizeEditable(input: ProfileEditable): ProfileEditable {
  const trimToNull = (s: string | null): string | null => {
    if (s === null) return null;
    const t = s.trim();
    return t.length === 0 ? null : t;
  };
  const dedupe = (slugs: string[]): string[] => [...new Set(slugs)];
  return {
    tagline: trimToNull(input.tagline),
    bio: trimToNull(input.bio),
    pronouns: trimToNull(input.pronouns),
    location: trimToNull(input.location),
    accentHex: input.accentHex,
    favorites: dedupe(input.favorites),
    wishlist: dedupe(input.wishlist),
    links: input.links,
  };
}

// ── GET /api/profiles  (directory) ─────────────────────────────────────

profileRoutes.get("/", async (c) => {
  const db = getDb();
  const userResult = await db.execute(
    `SELECT id, name, image FROM "user"
     WHERE internal = 0 AND guest = 0
     ORDER BY name COLLATE NOCASE ASC`,
  );
  const users = parseRows(DirectoryUserRowSchema, userResult.rows, "user");
  const ids = users.map((u) => u.id);

  const [profileResult, inventoryResult, nextByUser] = await Promise.all([
    db.execute("SELECT user_id, tagline, accent_hex FROM user_profiles"),
    db.execute("SELECT user_id, game_slugs_json FROM user_inventory"),
    findNextNightDateKeysForUsers(db, ids),
  ]);

  const profileByUser = new Map<string, { tagline: string | null; accent: string | null }>();
  for (const row of parseRows(DirectoryProfileRowSchema, profileResult.rows, "user_profiles")) {
    profileByUser.set(row.user_id, { tagline: row.tagline, accent: safeAccent(row.accent_hex) });
  }
  const ownedByUser = new Map<string, number>();
  for (const row of inventoryResult.rows) {
    try {
      const inv = parseRow(InventoryRowSchema, row, "user_inventory");
      ownedByUser.set(inv.user_id, inv.game_slugs_json.length);
    } catch (err) {
      if (!(err instanceof RowParseError)) throw err;
    }
  }

  const players = users.map((u) => ({
    id: u.id,
    name: u.name,
    image: u.image,
    tagline: profileByUser.get(u.id)?.tagline ?? null,
    accentHex: profileByUser.get(u.id)?.accent ?? null,
    gamesOwned: ownedByUser.get(u.id) ?? 0,
    nextNightDateKey: nextByUser.get(u.id) ?? null,
  }));
  return c.json(ProfileDirectoryResponseSchema.parse({ players }));
});

// ── GET /api/profiles/:userId/matches  (paginated) ─────────────────────

profileRoutes.get("/:userId/matches", async (c) => {
  const userId = c.req.param("userId");
  const limit = clampLimit(c.req.query("limit"));
  const before = c.req.query("before");
  const db = getDb();

  const cols = `id, date_key, played_at, game_slug, game_title, outcome_json, notes,
                recorded_by, recorded_at, updated_at, sort_order`;
  const sql = before
    ? `SELECT ${cols} FROM match_results
       WHERE outcome_json LIKE ? AND played_at < ?
       ORDER BY played_at DESC, id DESC LIMIT ?`
    : `SELECT ${cols} FROM match_results
       WHERE outcome_json LIKE ?
       ORDER BY played_at DESC, id DESC LIMIT ?`;
  const args = before ? [likePattern(userId), before, limit + 1] : [likePattern(userId), limit + 1];

  const { rows } = await db.execute({ sql, args });
  const parsed = parseRows(MatchResultRowSchema, rows, "match_results").filter((r) =>
    extractParticipantIds(r.outcome_json).includes(userId),
  );
  const hasMore = parsed.length > limit;
  const page = hasMore ? parsed.slice(0, limit) : parsed;

  const nameIds = new Set<string>();
  for (const r of page) for (const id of extractParticipantIds(r.outcome_json)) nameIds.add(id);
  const nameById = await fetchNameMap(db, nameIds);
  const matches = page.map((r) => rowToMatchRecord(r, nameById));
  const nextBefore = hasMore && matches.length > 0 ? matches[matches.length - 1].playedAt : null;

  return c.json(HistoryListResponseSchema.parse({ matches, nextBefore }));
});

// ── GET /api/profiles/:userId  (full aggregate) ────────────────────────

profileRoutes.get("/:userId", async (c) => {
  const userId = c.req.param("userId");
  const db = getDb();
  const today = todayDateKey();

  const [
    userResult,
    profileResult,
    inventoryResult,
    matchResult,
    nightsResult,
    nightsTotalResult,
    nextRef,
  ] = await Promise.all([
    db.execute({
      sql: `SELECT id, name, image, role, CAST(createdAt AS TEXT) AS created_at
              FROM "user" WHERE id = ? LIMIT 1`,
      args: [userId],
    }),
    db.execute({
      sql: `SELECT tagline, bio, pronouns, location, accent_hex,
                     favorite_game_slugs_json, wishlist_game_slugs_json, links_json, skill_json
              FROM user_profiles WHERE user_id = ? LIMIT 1`,
      args: [userId],
    }),
    db.execute({
      sql: "SELECT game_slugs_json FROM user_inventory WHERE user_id = ?",
      args: [userId],
    }),
    db.execute({
      sql: `SELECT id, date_key, played_at, game_slug, game_title, outcome_json, notes,
                     recorded_by, recorded_at, updated_at, sort_order
              FROM match_results
              WHERE outcome_json LIKE ?
              ORDER BY played_at DESC, id DESC`,
      args: [likePattern(userId)],
    }),
    db.execute({
      sql: `SELECT COUNT(*) AS n FROM rsvps r
              JOIN locked_dates l ON l.date_key = r.date_key
              WHERE r.user_id = ? AND r.status = 'yes' AND r.date_key < ?`,
      args: [userId, today],
    }),
    db.execute({
      sql: "SELECT COUNT(*) AS n FROM locked_dates WHERE date_key < ?",
      args: [today],
    }),
    findNextNightForUser(db, userId, today),
  ]);

  if (userResult.rows.length === 0) {
    return errorResponse(c, 404, "user not found", "NOT_FOUND");
  }
  const userRow = parseRow(UserRowSchema, userResult.rows[0], "user");

  const { editable, skill } = profileResult.rows[0]
    ? readEditableRow(parseRow(ProfileRowSchema, profileResult.rows[0], "user_profiles"))
    : { editable: EMPTY_EDITABLE, skill: null };

  const library = inventoryResult.rows[0]
    ? parseRow(ViewerInventoryRowSchema, inventoryResult.rows[0], "user_inventory").game_slugs_json
    : [];

  // Stats + recent matches from the user's matches (membership re-checked).
  const matchRows = parseRows(MatchResultRowSchema, matchResult.rows, "match_results").filter((r) =>
    extractParticipantIds(r.outcome_json).includes(userId),
  );
  let wins = 0;
  let losses = 0;
  const distinctSlugs = new Set<string>();
  const playsBySlug = new Map<string, { title: string; plays: number; wins: number }>();
  for (const r of matchRows) {
    const result = deriveParticipantResult(r.outcome_json, userId);
    if (result === "win") wins += 1;
    else if (result === "loss") losses += 1;
    if (r.game_slug) {
      distinctSlugs.add(r.game_slug);
      let agg = playsBySlug.get(r.game_slug);
      if (!agg) {
        agg = { title: r.game_title, plays: 0, wins: 0 };
        playsBySlug.set(r.game_slug, agg);
      }
      agg.plays += 1;
      if (result === "win") agg.wins += 1;
    }
  }
  const perGame: ProfilePerGameStat[] = [...playsBySlug.entries()]
    .map(([slug, a]) => ({ slug, title: a.title, plays: a.plays, wins: a.wins }))
    .sort((x, y) => y.plays - x.plays || y.wins - x.wins || x.slug.localeCompare(y.slug))
    .slice(0, PER_GAME_MAX);

  const recent = matchRows.slice(0, RECENT_MATCH_COUNT);
  const nameIds = new Set<string>();
  for (const r of recent) for (const id of extractParticipantIds(r.outcome_json)) nameIds.add(id);
  const nameById = await fetchNameMap(db, nameIds);
  const recentMatches = recent.map((r) => rowToMatchRecord(r, nameById));

  // Enrich the next night with headcount/host via the shared calendar payload.
  let nextNight = null;
  if (nextRef) {
    const view = await computeAvailableGamesPayload({
      db,
      date: nextRef.dateKey,
      viewerId: userId,
    });
    nextNight = {
      dateKey: nextRef.dateKey,
      eventTime: view?.lock.eventTime ?? null,
      address: view?.lock.address ?? null,
      hostName: view?.lock.hostName ?? null,
      status: nextRef.status,
      attendeeCount: view ? view.wire.definiteCount + view.wire.tentativeCount : 0,
    };
  }

  const stats = {
    gamesPlayed: matchRows.length,
    wins,
    losses,
    winRate: wins + losses > 0 ? wins / (wins + losses) : null,
    gamesOwned: library.length,
    distinctGames: distinctSlugs.size,
    nightsAttended: Number(nightsResult.rows[0]?.n ?? 0),
    nightsTotal: Number(nightsTotalResult.rows[0]?.n ?? 0),
    favoriteGameSlug: perGame[0]?.slug ?? null,
    perGame,
  };

  return c.json(
    PublicProfileSchema.parse({
      user: {
        id: userRow.id,
        name: userRow.name,
        image: userRow.image,
        role: userRow.role,
        memberSince: toIso(userRow.created_at),
      },
      profile: editable,
      library,
      skill,
      stats,
      recentMatches,
      nextNight,
    }),
  );
});

// ── PUT /api/profiles/:userId  (self only) ─────────────────────────────

profileRoutes.put("/:userId", zJsonBody(ProfileUpdateInputSchema), async (c) => {
  const userId = c.req.param("userId");
  const user = c.get("user");
  if (user.id !== userId) {
    return errorResponse(c, 403, "cannot edit another user's profile", "FORBIDDEN");
  }
  const normalized = normalizeEditable(c.req.valid("json"));

  await getDb().execute({
    sql: `INSERT INTO user_profiles
            (user_id, tagline, bio, pronouns, location, accent_hex,
             favorite_game_slugs_json, wishlist_game_slugs_json, links_json, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
          ON CONFLICT(user_id) DO UPDATE SET
            tagline = excluded.tagline,
            bio = excluded.bio,
            pronouns = excluded.pronouns,
            location = excluded.location,
            accent_hex = excluded.accent_hex,
            favorite_game_slugs_json = excluded.favorite_game_slugs_json,
            wishlist_game_slugs_json = excluded.wishlist_game_slugs_json,
            links_json = excluded.links_json,
            updated_at = datetime('now')`,
    args: [
      userId,
      normalized.tagline,
      normalized.bio,
      normalized.pronouns,
      normalized.location,
      normalized.accentHex,
      JSON.stringify(normalized.favorites),
      JSON.stringify(normalized.wishlist),
      JSON.stringify(normalized.links),
    ],
  });

  return c.json(ProfileEditableSchema.parse(normalized));
});
