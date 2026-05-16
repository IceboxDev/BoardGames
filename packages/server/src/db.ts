import { type Client, createClient } from "@libsql/client";

let db: Client | null = null;

export function getDb(): Client {
  if (!db) {
    throw new Error("Database not initialized. Call initDb() first.");
  }
  return db;
}

export function getDbConnectionConfig(): { url: string; authToken: string | undefined } {
  const url = process.env.TURSO_DATABASE_URL;
  if (!url) {
    throw new Error("TURSO_DATABASE_URL is required. Set it in packages/server/.env");
  }
  const authToken = process.env.TURSO_AUTH_TOKEN;
  return { url, authToken };
}

export async function initDb(): Promise<Client> {
  const { url, authToken } = getDbConnectionConfig();
  db = createClient({ url, authToken });
  await migrate(db);
  return db;
}

async function migrate(db: Client): Promise<void> {
  // Pre-batch: an earlier iteration of `bgg_cache` had a different shape
  // (PK on bgg_id; columns: bgg_id, data_json, fetched_at). The current
  // shape is keyed by slug. Drop the legacy table so the CREATE in the
  // batch below recreates it correctly. Safe — table is just a cache.
  const bggCacheCols = await db.execute("PRAGMA table_info(bgg_cache)");
  if (bggCacheCols.rows.length > 0 && !bggCacheCols.rows.some((r) => r.name === "slug")) {
    await db.execute("DROP TABLE bgg_cache");
  }

  // Use db.batch (single-statement-per-entry) instead of db.executeMultiple —
  // the latter doesn't work reliably over Turso's HTTP wire and returns 400.
  await db.batch(
    [
      `CREATE TABLE IF NOT EXISTS tournaments (
        id TEXT PRIMARY KEY,
        game_slug TEXT NOT NULL,
        config_json TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        result_json TEXT,
        progress_completed INTEGER DEFAULT 0,
        progress_total INTEGER DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        completed_at TEXT
      )`,
      `CREATE TABLE IF NOT EXISTS tournament_games (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
        game_index INTEGER NOT NULL,
        log_json TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS game_results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game_slug TEXT NOT NULL,
        result_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS session_replays (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game_slug TEXT NOT NULL,
        ai_engine TEXT,
        replay_json TEXT NOT NULL,
        score_p0 INTEGER,
        score_p1 INTEGER,
        winner TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS user_availability (
        user_id TEXT PRIMARY KEY,
        availability_json TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS user_inventory (
        user_id TEXT PRIMARY KEY,
        game_slugs_json TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS pending_inventory (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        game_slugs_json TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS locked_dates (
        date_key TEXT PRIMARY KEY,
        locked_by TEXT NOT NULL,
        locked_at TEXT NOT NULL DEFAULT (datetime('now')),
        expected_user_ids_json TEXT NOT NULL DEFAULT '[]'
      )`,
      `CREATE TABLE IF NOT EXISTS rsvps (
        date_key TEXT NOT NULL,
        user_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('yes', 'no')),
        rsvped_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (date_key, user_id)
      )`,
      `CREATE INDEX IF NOT EXISTS idx_rsvps_date ON rsvps(date_key)`,
      // PK includes `reaction` so a single user can hold multiple reactions
      // on the same game (e.g. hype + teach). All reactions are positive
      // signals; absence of a row implies "no opinion / skip".
      `CREATE TABLE IF NOT EXISTS game_requests (
        date_key TEXT NOT NULL,
        user_id TEXT NOT NULL,
        game_slug TEXT NOT NULL,
        reaction TEXT NOT NULL CHECK (reaction IN ('hype', 'teach', 'learn')),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (date_key, user_id, game_slug, reaction)
      )`,
      `CREATE INDEX IF NOT EXISTS idx_game_requests_date ON game_requests(date_key)`,
      `CREATE TABLE IF NOT EXISTS match_results (
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
      )`,
      `CREATE INDEX IF NOT EXISTS idx_match_results_played_at ON match_results(played_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_match_results_date_key ON match_results(date_key)`,
      `CREATE INDEX IF NOT EXISTS idx_match_results_game_slug ON match_results(game_slug)`,
      `CREATE TABLE IF NOT EXISTS bgg_cache (
        slug TEXT PRIMARY KEY,
        bgg_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        metadata_json TEXT NOT NULL,
        fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT
      )`,
      `CREATE INDEX IF NOT EXISTS idx_bgg_cache_bgg_id ON bgg_cache(bgg_id)`,
      `CREATE INDEX IF NOT EXISTS idx_tournaments_slug ON tournaments(game_slug)`,
      `CREATE INDEX IF NOT EXISTS idx_tournaments_status ON tournaments(status)`,
      `CREATE INDEX IF NOT EXISTS idx_tournament_games_tid ON tournament_games(tournament_id, game_index)`,
      `CREATE INDEX IF NOT EXISTS idx_game_results_slug ON game_results(game_slug)`,
      `CREATE INDEX IF NOT EXISTS idx_session_replays_slug ON session_replays(game_slug, created_at DESC)`,
      // Personal iCalendar (ICS) subscription support. The raw token is shown
      // to the user once at generation and never persisted — we store only
      // `sha256(raw)` hex so an offline DB dump can't be used to subscribe.
      // ON DELETE CASCADE is omitted intentionally: better-auth manages the
      // user table separately and SQLite doesn't enforce FKs by default; we
      // rely on application-layer cleanup.
      `CREATE TABLE IF NOT EXISTS calendar_feed_tokens (
        user_id TEXT PRIMARY KEY,
        token_hash TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        last_accessed_at TEXT,
        last_user_agent TEXT
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_calendar_feed_tokens_hash
        ON calendar_feed_tokens(token_hash)`,
      // Per-(user, date) SEQUENCE version table for the iCalendar feed.
      // RFC 5545 requires SEQUENCE to monotonically increase whenever a
      // VEVENT's material state changes (Outlook silently ignores updates
      // that don't bump it). We canonicalize the state into a sha256 digest;
      // on every feed render we compare-and-bump.
      `CREATE TABLE IF NOT EXISTS calendar_feed_event_versions (
        user_id TEXT NOT NULL,
        date_key TEXT NOT NULL,
        state_digest TEXT NOT NULL,
        sequence INTEGER NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (user_id, date_key)
      )`,
      // Tombstones for nights an admin unlocked. Without these, a subscriber
      // whose calendar already saw the event has no way to know it was
      // unlocked — calendars only act on what they see. We keep a tombstone
      // row for 30 days so the next poll emits STATUS:CANCELLED.
      `CREATE TABLE IF NOT EXISTS calendar_unlocked_tombstones (
        date_key TEXT PRIMARY KEY,
        expected_user_ids_json TEXT NOT NULL DEFAULT '[]',
        host_user_id TEXT,
        host_name TEXT,
        event_time TEXT,
        address TEXT,
        unlocked_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
    ],
    "write",
  );

  const grCols = await db.execute("PRAGMA table_info(game_results)");
  if (!grCols.rows.some((r) => r.name === "client_id")) {
    await db.batch(
      [
        `ALTER TABLE game_results ADD COLUMN client_id TEXT`,
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_game_results_client_id ON game_results(game_slug, client_id)`,
      ],
      "write",
    );
  }

  const srCols = await db.execute("PRAGMA table_info(session_replays)");
  if (!srCols.rows.some((r) => r.name === "scores_json")) {
    await db.batch(
      [
        `ALTER TABLE session_replays ADD COLUMN scores_json TEXT`,
        `ALTER TABLE session_replays ADD COLUMN player_count INTEGER`,
      ],
      "write",
    );
  }

  const ldCols = await db.execute("PRAGMA table_info(locked_dates)");
  if (!ldCols.rows.some((r) => r.name === "host_user_id")) {
    await db.batch(
      [
        `ALTER TABLE locked_dates ADD COLUMN host_user_id TEXT`,
        `ALTER TABLE locked_dates ADD COLUMN host_name TEXT`,
        `ALTER TABLE locked_dates ADD COLUMN event_time TEXT`,
        `ALTER TABLE locked_dates ADD COLUMN address TEXT`,
      ],
      "write",
    );
  }

  // Re-read columns after the host migration may have run, so we don't miss
  // adding the picks-lock column on a fresh DB that already had host_user_id
  // present in this same `migrate()` invocation.
  const ldCols2 = await db.execute("PRAGMA table_info(locked_dates)");
  if (!ldCols2.rows.some((r) => r.name === "picks_locked_at")) {
    await db.execute(`ALTER TABLE locked_dates ADD COLUMN picks_locked_at TEXT`);
  }

  // `host_at_home` flags whether the host's game collection is on-site. NULL
  // is the legacy state and is treated as `1` (uncapped host) by the read
  // path so historical lock-ins keep their existing behavior. New lock-ins
  // emit an explicit 0/1.
  const ldCols3 = await db.execute("PRAGMA table_info(locked_dates)");
  if (!ldCols3.rows.some((r) => r.name === "host_at_home")) {
    await db.execute(`ALTER TABLE locked_dates ADD COLUMN host_at_home INTEGER`);
  }

  // `auto = 1` flags rows that were created by an automated mechanism (the
  // lock-time cans-snapshot batch, or the RSVP modal's first-open useEffect)
  // rather than by an explicit "Going" / "Not going" button click. The
  // attendees view uses this to render a "Hasn't RSVP'd yet" pill so the
  // host knows who still needs a real-life ping.
  const rsvpCols = await db.execute("PRAGMA table_info(rsvps)");
  if (!rsvpCols.rows.some((r) => r.name === "auto")) {
    await db.execute(`ALTER TABLE rsvps ADD COLUMN auto INTEGER NOT NULL DEFAULT 0`);
  }
  // Idempotent backfill: rows whose `rsvped_at` lands within a few seconds
  // of their lock's `locked_at` were almost certainly written by the
  // cans-snapshot batch (or its retries). Flag them auto so the attendees
  // view stops claiming they manually clicked. Re-running this is a no-op
  // for rows already at auto=1, so we don't gate it on the column-add.
  await db.execute(
    `UPDATE rsvps SET auto = 1 WHERE status = 'yes' AND auto = 0 AND EXISTS (
      SELECT 1 FROM locked_dates l
      WHERE l.date_key = rsvps.date_key
        AND ABS(strftime('%s', l.locked_at) - strftime('%s', rsvps.rsvped_at)) <= 2
    )`,
  );

  // `internal = 1` flags accounts used for development/QA so they're hidden
  // from the admin user list. Set automatically for emails containing
  // `+internal` (Gmail alias trick) in the auth before-create hook.
  // `guest = 1` flags admin-created stubs (first/last name only) that exist
  // so match-history can credit a player who never signed up. Set
  // automatically for `@guest.local` synthetic emails in the same hook.
  const userCols = await db.execute("PRAGMA table_info(user)");
  if (userCols.rows.length > 0 && !userCols.rows.some((r) => r.name === "internal")) {
    await db.execute(`ALTER TABLE user ADD COLUMN internal INTEGER NOT NULL DEFAULT 0`);
  }
  if (userCols.rows.length > 0 && !userCols.rows.some((r) => r.name === "guest")) {
    await db.execute(`ALTER TABLE user ADD COLUMN guest INTEGER NOT NULL DEFAULT 0`);
  }
}
