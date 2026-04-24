import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    throw new Error("Database not initialized. Call initDb() first.");
  }
  return db;
}

export function initDb(dbPath: string): Database.Database {
  const dir = dirname(dbPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  migrate(db);
  return db;
}

function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tournaments (
      id TEXT PRIMARY KEY,
      game_slug TEXT NOT NULL,
      config_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      result_json TEXT,
      progress_completed INTEGER DEFAULT 0,
      progress_total INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS tournament_games (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
      game_index INTEGER NOT NULL,
      log_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS game_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_slug TEXT NOT NULL,
      result_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS session_replays (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_slug TEXT NOT NULL,
      ai_engine TEXT,
      replay_json TEXT NOT NULL,
      score_p0 INTEGER,
      score_p1 INTEGER,
      winner TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_tournaments_slug ON tournaments(game_slug);
    CREATE INDEX IF NOT EXISTS idx_tournaments_status ON tournaments(status);
    CREATE INDEX IF NOT EXISTS idx_tournament_games_tid ON tournament_games(tournament_id, game_index);
    CREATE INDEX IF NOT EXISTS idx_game_results_slug ON game_results(game_slug);
    CREATE INDEX IF NOT EXISTS idx_session_replays_slug ON session_replays(game_slug, created_at DESC);
  `);

  const columns = db.prepare("PRAGMA table_info(game_results)").all() as { name: string }[];
  if (!columns.some((c) => c.name === "client_id")) {
    db.exec(`
      ALTER TABLE game_results ADD COLUMN client_id TEXT;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_game_results_client_id
        ON game_results(game_slug, client_id);
    `);
  }

  const replayColumns = db.prepare("PRAGMA table_info(session_replays)").all() as {
    name: string;
  }[];
  if (!replayColumns.some((c) => c.name === "scores_json")) {
    db.exec(`
      ALTER TABLE session_replays ADD COLUMN scores_json TEXT;
      ALTER TABLE session_replays ADD COLUMN player_count INTEGER;
    `);
  }
}
