/**
 * Copy the farm's state from production into staging. The farm works on prod
 * (see the README's "Database" note), while a laptop dev server reads staging:
 * run this to see the farm's latest results and queue there. Production is
 * only read. Staging gets every prod evaluation of the current spec it doesn't
 * have, or has older (by `created_at`), and its job queue becomes a copy of
 * prod's (so the trainer's ETAs read the real queue; jobs a staging trainer
 * asked for are dropped, as the farm never sees them). Safe to run any number
 * of times.
 *
 *   pnpm --filter @boardgames/server exec tsx src/scripts/chess-farm/sync-evals-to-staging.ts
 *
 * Needs both pairs in `.env`: `TURSO_*` (staging) and `PROD_TURSO_*`.
 */
import "dotenv/config";
import { BEST_MOVE_SPEC } from "@boardgames/core/games/chess/trainer/eval-policy";
import { createClient, type InStatement } from "@libsql/client";
import { z } from "zod";
import { getDb } from "../../db.ts";
import { parseRows } from "../../lib/db-rows.ts";
import { connectDbTarget } from "../../lib/db-target.ts";

await connectDbTarget({ writes: true, purpose: "copy the farm's results from production" });
const staging = getDb();
const prodUrl = process.env.PROD_TURSO_DATABASE_URL;
if (!prodUrl)
  throw new Error("PROD_TURSO_DATABASE_URL is required (see packages/server/.env.example)");
const prod = createClient({ url: prodUrl, authToken: process.env.PROD_TURSO_AUTH_TOKEN });

const RowSchema = z.object({
  fen_key: z.string(),
  spec: z.string(),
  kind: z.string(),
  best: z.string(),
  depth: z.number(),
  source: z.string(),
  engine: z.string(),
  result_json: z.string(),
  created_at: z.string(),
});

const PAGE = 1000;
let copied = 0;
for (let offset = 0; ; offset += PAGE) {
  const res = await prod.execute({
    sql: `SELECT fen_key, spec, kind, best, depth, source, engine, result_json, created_at
            FROM chess_position_evals WHERE spec = ? ORDER BY fen_key, kind LIMIT ? OFFSET ?`,
    args: [BEST_MOVE_SPEC, PAGE, offset],
  });
  const rows = parseRows(RowSchema, res.rows, "chess_position_evals");
  if (rows.length === 0) break;
  const statements: InStatement[] = rows.map((r) => ({
    sql: `INSERT INTO chess_position_evals (fen_key, spec, kind, best, depth, source, engine, result_json, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT (fen_key, spec, kind) DO UPDATE SET
            best = excluded.best, depth = excluded.depth, source = excluded.source,
            engine = excluded.engine, result_json = excluded.result_json, created_at = excluded.created_at
          WHERE excluded.created_at > chess_position_evals.created_at`,
    args: [
      r.fen_key,
      r.spec,
      r.kind,
      r.best,
      r.depth,
      r.source,
      r.engine,
      r.result_json,
      r.created_at,
    ],
  }));
  const results = await staging.batch(statements, "write");
  copied += results.reduce((t, x) => t + x.rowsAffected, 0);
  if (rows.length < PAGE) break;
}
console.log(`[sync-evals] ${copied} evaluations new or newer in staging (${BEST_MOVE_SPEC})`);

// The queue: replaced whole, in the columns both databases have.
const columnsOf = async (db: Pick<typeof prod, "execute">) =>
  (await db.execute("PRAGMA table_info(chess_eval_jobs)")).rows.map((r) => String(r.name));
const prodCols = await columnsOf(prod);
const cols = (await columnsOf(staging)).filter((c) => prodCols.includes(c));
const jobs = (await prod.execute(`SELECT ${cols.join(", ")} FROM chess_eval_jobs`)).rows;
const insert = `INSERT INTO chess_eval_jobs (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`;
const statements: InStatement[] = [{ sql: "DELETE FROM chess_eval_jobs", args: [] }];
for (const row of jobs) statements.push({ sql: insert, args: cols.map((c) => row[c] ?? null) });
await staging.batch(statements, "write");
console.log(`[sync-evals] staging's farm queue now mirrors prod's: ${jobs.length} jobs`);
prod.close();
