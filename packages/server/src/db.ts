import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { type Client, createClient } from "@libsql/client";

let db: Client | null = null;

export function getDb(): Client {
  if (!db) {
    throw new Error("Database not initialized. Call initDb() first.");
  }
  return db;
}

export function getDbConnectionConfig(): { url: string; authToken: string | undefined } {
  const url = process.env.TURSO_DATABASE_URL ?? "file:./data/boardgames.db";
  const authToken = process.env.TURSO_AUTH_TOKEN;
  return { url, authToken };
}

export async function initDb(): Promise<Client> {
  const { url, authToken } = getDbConnectionConfig();

  if (url.startsWith("file:")) {
    const filePath = url.slice("file:".length);
    const dir = dirname(filePath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }

  db = createClient({ url, authToken });

  if (url.startsWith("file:")) {
    await db.execute("PRAGMA foreign_keys = ON");
  }

  await migrate(db);
  return db;
}

async function migrate(db: Client): Promise<void> {
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
      `CREATE INDEX IF NOT EXISTS idx_tournaments_slug ON tournaments(game_slug)`,
      `CREATE INDEX IF NOT EXISTS idx_tournaments_status ON tournaments(status)`,
      `CREATE INDEX IF NOT EXISTS idx_tournament_games_tid ON tournament_games(tournament_id, game_index)`,
      `CREATE INDEX IF NOT EXISTS idx_game_results_slug ON game_results(game_slug)`,
      `CREATE INDEX IF NOT EXISTS idx_session_replays_slug ON session_replays(game_slug, created_at DESC)`,
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
}
