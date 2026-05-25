// Migration 0001 — baseline.
//
// This is the EXACT schema that production ran on the day the migration system
// was introduced. It is transcribed column-for-column from the live database
// (PRAGMA table_info + sqlite_master), including the four tables better-auth
// owns (`user`, `account`, `session`, `verification`) and every column that was
// previously bolted on via ad-hoc `ALTER TABLE` in the old boot-time migrate().
//
// Two execution paths (see migrator.ts):
//   • Fresh database  → these statements run, producing a schema byte-identical
//     to production. better-auth needs no separate CLI step anymore; its tables
//     live here.
//   • Existing database → these statements DO NOT run. The runner verifies every
//     table/column below already exists, then records this migration as applied.
//     Zero DDL touches production data.
//
// Because the baseline can be STAMPED without executing, it must describe the
// real production schema precisely — `BASELINE_TABLES` below is the contract the
// runner checks before stamping. If you find a discrepancy with production, fix
// it here; never "patch" production to match.

import type { Migration } from "./types.ts";

// ── better-auth tables ──────────────────────────────────────────────────
// Reproduced verbatim from production (the output of better-auth's own Kysely
// migrator) with `IF NOT EXISTS` added. `internal` and `guest` on `user` are
// app-owned additions (auth/config.ts additionalFields) and are folded in at
// their production column positions.

const CREATE_USER = `CREATE TABLE IF NOT EXISTS "user" (
  "id" text not null primary key,
  "name" text not null,
  "email" text not null unique,
  "emailVerified" integer not null,
  "image" text,
  "createdAt" date not null,
  "updatedAt" date not null,
  "role" text,
  "banned" integer,
  "banReason" text,
  "banExpires" date,
  "onlineEnabled" integer,
  "internal" integer not null default 0,
  "guest" integer not null default 0
)`;

const CREATE_ACCOUNT = `CREATE TABLE IF NOT EXISTS "account" (
  "id" text not null primary key,
  "accountId" text not null,
  "providerId" text not null,
  "userId" text not null references "user" ("id") on delete cascade,
  "accessToken" text,
  "refreshToken" text,
  "idToken" text,
  "accessTokenExpiresAt" date,
  "refreshTokenExpiresAt" date,
  "scope" text,
  "password" text,
  "createdAt" date not null,
  "updatedAt" date not null
)`;

const CREATE_SESSION = `CREATE TABLE IF NOT EXISTS "session" (
  "id" text not null primary key,
  "expiresAt" date not null,
  "token" text not null unique,
  "createdAt" date not null,
  "updatedAt" date not null,
  "ipAddress" text,
  "userAgent" text,
  "userId" text not null references "user" ("id") on delete cascade,
  "impersonatedBy" text
)`;

const CREATE_VERIFICATION = `CREATE TABLE IF NOT EXISTS "verification" (
  "id" text not null primary key,
  "identifier" text not null,
  "value" text not null,
  "expiresAt" date not null,
  "createdAt" date not null,
  "updatedAt" date not null
)`;

// ── Application tables ──────────────────────────────────────────────────

const CREATE_TOURNAMENTS = `CREATE TABLE IF NOT EXISTS tournaments (
  id TEXT PRIMARY KEY,
  game_slug TEXT NOT NULL,
  config_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  result_json TEXT,
  progress_completed INTEGER DEFAULT 0,
  progress_total INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
)`;

const CREATE_TOURNAMENT_GAMES = `CREATE TABLE IF NOT EXISTS tournament_games (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  game_index INTEGER NOT NULL,
  log_json TEXT NOT NULL
)`;

const CREATE_GAME_RESULTS = `CREATE TABLE IF NOT EXISTS game_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_slug TEXT NOT NULL,
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  client_id TEXT
)`;

const CREATE_SESSION_REPLAYS = `CREATE TABLE IF NOT EXISTS session_replays (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_slug TEXT NOT NULL,
  ai_engine TEXT,
  replay_json TEXT NOT NULL,
  score_p0 INTEGER,
  score_p1 INTEGER,
  winner TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  scores_json TEXT,
  player_count INTEGER
)`;

const CREATE_USER_AVAILABILITY = `CREATE TABLE IF NOT EXISTS user_availability (
  user_id TEXT PRIMARY KEY,
  availability_json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
)`;

const CREATE_USER_INVENTORY = `CREATE TABLE IF NOT EXISTS user_inventory (
  user_id TEXT PRIMARY KEY,
  game_slugs_json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
)`;

const CREATE_PENDING_INVENTORY = `CREATE TABLE IF NOT EXISTS pending_inventory (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  game_slugs_json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
)`;

const CREATE_LOCKED_DATES = `CREATE TABLE IF NOT EXISTS locked_dates (
  date_key TEXT PRIMARY KEY,
  locked_by TEXT NOT NULL,
  locked_at TEXT NOT NULL DEFAULT (datetime('now')),
  expected_user_ids_json TEXT NOT NULL DEFAULT '[]',
  host_user_id TEXT,
  host_name TEXT,
  event_time TEXT,
  address TEXT,
  picks_locked_at TEXT,
  host_at_home INTEGER
)`;

const CREATE_RSVPS = `CREATE TABLE IF NOT EXISTS rsvps (
  date_key TEXT NOT NULL,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('yes', 'no')),
  rsvped_at TEXT NOT NULL DEFAULT (datetime('now')),
  auto INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (date_key, user_id)
)`;

const CREATE_GAME_REQUESTS = `CREATE TABLE IF NOT EXISTS game_requests (
  date_key TEXT NOT NULL,
  user_id TEXT NOT NULL,
  game_slug TEXT NOT NULL,
  reaction TEXT NOT NULL CHECK (reaction IN ('hype', 'teach', 'learn')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (date_key, user_id, game_slug, reaction)
)`;

const CREATE_MATCH_RESULTS = `CREATE TABLE IF NOT EXISTS match_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date_key TEXT,
  played_at TEXT NOT NULL DEFAULT (datetime('now')),
  game_slug TEXT,
  game_title TEXT NOT NULL,
  outcome_json TEXT NOT NULL,
  notes TEXT,
  recorded_by TEXT NOT NULL,
  recorded_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT
)`;

const CREATE_BGG_CACHE = `CREATE TABLE IF NOT EXISTS bgg_cache (
  slug TEXT PRIMARY KEY,
  bgg_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  metadata_json TEXT NOT NULL,
  fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT
)`;

const CREATE_CALENDAR_FEED_TOKENS = `CREATE TABLE IF NOT EXISTS calendar_feed_tokens (
  user_id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_accessed_at TEXT,
  last_user_agent TEXT
)`;

const CREATE_CALENDAR_FEED_EVENT_VERSIONS = `CREATE TABLE IF NOT EXISTS calendar_feed_event_versions (
  user_id TEXT NOT NULL,
  date_key TEXT NOT NULL,
  state_digest TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, date_key)
)`;

const CREATE_CALENDAR_UNLOCKED_TOMBSTONES = `CREATE TABLE IF NOT EXISTS calendar_unlocked_tombstones (
  date_key TEXT PRIMARY KEY,
  expected_user_ids_json TEXT NOT NULL DEFAULT '[]',
  host_user_id TEXT,
  host_name TEXT,
  event_time TEXT,
  address TEXT,
  unlocked_at TEXT NOT NULL DEFAULT (datetime('now'))
)`;

// ── Indexes ─────────────────────────────────────────────────────────────
// Names and definitions reproduced from production. `account_*`, `session_*`,
// and `verification_*` are better-auth's; the rest are app-owned.

const INDEXES = [
  `CREATE INDEX IF NOT EXISTS "account_userId_idx" ON "account" ("userId")`,
  `CREATE INDEX IF NOT EXISTS "session_userId_idx" ON "session" ("userId")`,
  `CREATE INDEX IF NOT EXISTS "verification_identifier_idx" ON "verification" ("identifier")`,
  `CREATE INDEX IF NOT EXISTS idx_bgg_cache_bgg_id ON bgg_cache(bgg_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_calendar_feed_tokens_hash ON calendar_feed_tokens(token_hash)`,
  `CREATE INDEX IF NOT EXISTS idx_game_requests_date ON game_requests(date_key)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_game_results_client_id ON game_results(game_slug, client_id)`,
  `CREATE INDEX IF NOT EXISTS idx_game_results_slug ON game_results(game_slug)`,
  `CREATE INDEX IF NOT EXISTS idx_match_results_date_key ON match_results(date_key)`,
  `CREATE INDEX IF NOT EXISTS idx_match_results_game_slug ON match_results(game_slug)`,
  `CREATE INDEX IF NOT EXISTS idx_match_results_played_at ON match_results(played_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_rsvps_date ON rsvps(date_key)`,
  `CREATE INDEX IF NOT EXISTS idx_session_replays_slug ON session_replays(game_slug, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_tournament_games_tid ON tournament_games(tournament_id, game_index)`,
  `CREATE INDEX IF NOT EXISTS idx_tournaments_slug ON tournaments(game_slug)`,
  `CREATE INDEX IF NOT EXISTS idx_tournaments_status ON tournaments(status)`,
];

export const baseline: Migration = {
  version: 1,
  name: "baseline",
  statements: [
    // Parents before children so the schema reads top-down; SQLite doesn't
    // require it for CREATE, but it keeps FK references unambiguous.
    CREATE_USER,
    CREATE_ACCOUNT,
    CREATE_SESSION,
    CREATE_VERIFICATION,
    CREATE_TOURNAMENTS,
    CREATE_TOURNAMENT_GAMES,
    CREATE_GAME_RESULTS,
    CREATE_SESSION_REPLAYS,
    CREATE_USER_AVAILABILITY,
    CREATE_USER_INVENTORY,
    CREATE_PENDING_INVENTORY,
    CREATE_LOCKED_DATES,
    CREATE_RSVPS,
    CREATE_GAME_REQUESTS,
    CREATE_MATCH_RESULTS,
    CREATE_BGG_CACHE,
    CREATE_CALENDAR_FEED_TOKENS,
    CREATE_CALENDAR_FEED_EVENT_VERSIONS,
    CREATE_CALENDAR_UNLOCKED_TOMBSTONES,
    ...INDEXES,
  ],
};

/**
 * Every table the baseline defines, with its full column set, exactly as it
 * exists in production. The runner uses this to VERIFY an existing database
 * before stamping the baseline as applied — if any table or column below is
 * missing, the runner refuses to stamp (rather than silently declaring a
 * non-conforming database "migrated"). Keep this in sync with the CREATE
 * statements above.
 */
export const BASELINE_TABLES: Readonly<Record<string, readonly string[]>> = {
  user: [
    "id",
    "name",
    "email",
    "emailVerified",
    "image",
    "createdAt",
    "updatedAt",
    "role",
    "banned",
    "banReason",
    "banExpires",
    "onlineEnabled",
    "internal",
    "guest",
  ],
  account: [
    "id",
    "accountId",
    "providerId",
    "userId",
    "accessToken",
    "refreshToken",
    "idToken",
    "accessTokenExpiresAt",
    "refreshTokenExpiresAt",
    "scope",
    "password",
    "createdAt",
    "updatedAt",
  ],
  session: [
    "id",
    "expiresAt",
    "token",
    "createdAt",
    "updatedAt",
    "ipAddress",
    "userAgent",
    "userId",
    "impersonatedBy",
  ],
  verification: ["id", "identifier", "value", "expiresAt", "createdAt", "updatedAt"],
  tournaments: [
    "id",
    "game_slug",
    "config_json",
    "status",
    "result_json",
    "progress_completed",
    "progress_total",
    "created_at",
    "completed_at",
  ],
  tournament_games: ["id", "tournament_id", "game_index", "log_json"],
  game_results: ["id", "game_slug", "result_json", "created_at", "client_id"],
  session_replays: [
    "id",
    "game_slug",
    "ai_engine",
    "replay_json",
    "score_p0",
    "score_p1",
    "winner",
    "created_at",
    "scores_json",
    "player_count",
  ],
  user_availability: ["user_id", "availability_json", "updated_at"],
  user_inventory: ["user_id", "game_slugs_json", "updated_at"],
  pending_inventory: ["id", "game_slugs_json", "updated_at"],
  locked_dates: [
    "date_key",
    "locked_by",
    "locked_at",
    "expected_user_ids_json",
    "host_user_id",
    "host_name",
    "event_time",
    "address",
    "picks_locked_at",
    "host_at_home",
  ],
  rsvps: ["date_key", "user_id", "status", "rsvped_at", "auto"],
  game_requests: ["date_key", "user_id", "game_slug", "reaction", "created_at"],
  match_results: [
    "id",
    "date_key",
    "played_at",
    "game_slug",
    "game_title",
    "outcome_json",
    "notes",
    "recorded_by",
    "recorded_at",
    "updated_at",
  ],
  bgg_cache: ["slug", "bgg_id", "name", "metadata_json", "fetched_at", "updated_at"],
  calendar_feed_tokens: [
    "user_id",
    "token_hash",
    "created_at",
    "last_accessed_at",
    "last_user_agent",
  ],
  calendar_feed_event_versions: ["user_id", "date_key", "state_digest", "sequence", "updated_at"],
  calendar_unlocked_tombstones: [
    "date_key",
    "expected_user_ids_json",
    "host_user_id",
    "host_name",
    "event_time",
    "address",
    "unlocked_at",
  ],
};

/**
 * Sentinel table whose presence means "this is an existing (pre-migration-
 * system) database that already has the baseline schema." Chosen because it is
 * app-owned (so it can only exist if the old boot-time migrate() ran) and
 * central. Used by the runner to decide stamp-vs-execute for the baseline.
 */
export const BASELINE_SENTINEL_TABLE = "rsvps";
