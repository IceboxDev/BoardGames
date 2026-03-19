/**
 * Extract games where Strict (ismcts-v4) lost from the tournament database.
 * Outputs JSON file paths to stdout, one per line.
 */
import Database from "better-sqlite3";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DB_PATH = join(ROOT, "packages/server/data/boardgames.db");
const OUTPUT_DIR = join(ROOT, "replays/strict-losses");

const STRICT_ID = "ismcts-v4";

interface TournamentRow {
  id: string;
  config_json: string;
  game_index: number;
  log_json: string;
}

interface TournamentConfig {
  strategyAId: string;
  strategyBId: string;
}

interface GameLog {
  strategyA: string;
  strategyB: string;
  scoreA: number;
  scoreB: number;
  [key: string]: unknown;
}

function isStrictLoss(config: TournamentConfig, log: GameLog): boolean {
  if (config.strategyAId === STRICT_ID && log.scoreA < log.scoreB) return true;
  if (config.strategyBId === STRICT_ID && log.scoreB < log.scoreA) return true;
  return false;
}

async function main() {
  if (!existsSync(DB_PATH)) {
    console.error("Database not found:", DB_PATH);
    process.exit(1);
  }

  const db = new Database(DB_PATH, { readonly: true });
  const rows = db.prepare(`
    SELECT t.id, t.config_json, tg.game_index, tg.log_json
    FROM tournaments t
    JOIN tournament_games tg ON tg.tournament_id = t.id
    WHERE t.game_slug = 'lost-cities' AND t.status = 'completed'
  `).all() as TournamentRow[];

  db.close();

  const strictLosses: { path: string; tournamentId: string; gameIndex: number }[] = [];

  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  for (const row of rows) {
    const config = JSON.parse(row.config_json) as TournamentConfig;
    const log = JSON.parse(row.log_json) as GameLog;

    if (isStrictLoss(config, log)) {
      const filename = `${row.id}-game-${row.game_index}.json`;
      const filePath = join(OUTPUT_DIR, filename);
      writeFileSync(filePath, row.log_json, "utf-8");
      strictLosses.push({ path: filePath, tournamentId: row.id, gameIndex: row.game_index });
    }
  }

  for (const { path } of strictLosses) {
    console.log(path);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
