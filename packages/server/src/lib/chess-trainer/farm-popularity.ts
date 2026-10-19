/**
 * Fills `chess_eval_jobs.popularity` — how many lichess games reached each
 * waiting position — so the farm claims the most played positions first
 * (`claimJobs`). Runs only on a server with a lichess token (the farm's API on
 * ws21), one explorer request at a time through `lichess-explorer.ts`.
 */
import { z } from "zod";
import { getDb } from "../../db.ts";
import { parseRows } from "../db-rows.ts";
import { explorerConfigured, positionGames } from "./lichess-explorer.ts";

const BATCH = 25;
const IDLE_MS = 30_000;
const ERROR_MS = 60_000;

const RowSchema = z.object({ id: z.number(), fen: z.string() });

let started = false;

/** Look up the next few uncounted jobs; how many were counted. */
export async function fillPopularity(): Promise<number> {
  const db = getDb();
  const res = await db.execute({
    sql: `SELECT id, fen FROM chess_eval_jobs
          WHERE popularity IS NULL AND status IN ('queued', 'running')
          ORDER BY id LIMIT ?`,
    args: [BATCH],
  });
  const rows = parseRows(RowSchema, res.rows, "chess_eval_jobs.popularity");
  for (const row of rows) {
    const games = await positionGames(row.fen);
    await db.execute({
      sql: "UPDATE chess_eval_jobs SET popularity = ? WHERE id = ?",
      args: [games, row.id],
    });
  }
  return rows.length;
}

export function startPopularityFiller(): void {
  if (started || !explorerConfigured()) return;
  started = true;
  const tick = async () => {
    let wait = IDLE_MS;
    try {
      if ((await fillPopularity()) > 0) wait = 0;
    } catch (err) {
      console.error("[chess-farm] popularity lookup failed", err);
      wait = ERROR_MS;
    }
    setTimeout(() => void tick(), wait).unref();
  };
  void tick();
  console.log("[chess-farm] popularity filler started");
}
