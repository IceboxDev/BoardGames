/**
 * Delete the farm's positions no tree can reach any more (`off-tree.ts`):
 * past a move of yours that differs from your choice or the engine's best
 * there — a leftover of a choice that changed. Their evaluations and jobs go
 * (a running job stays: its worker is on it). Your moves are the ones starred
 * in a saved tree (the target's and, against production, staging's too: trees
 * are built on a dev server).
 *
 *   pnpm --filter @boardgames/server exec tsx src/scripts/chess-farm/prune-off-tree.ts [--prod] [--apply]
 *
 * Without --apply it only reports. With it, every deleted row is first written
 * to `scratch/chess-farm/` so it can be put back.
 */
import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { parseFen, positionKey } from "@boardgames/core/games/chess/engine/fen";
import { BEST_MOVE_SPEC } from "@boardgames/core/games/chess/trainer/eval-policy";
import { type HeldPosition, offTreePositions } from "@boardgames/core/games/chess/trainer/off-tree";
import { createClient } from "@libsql/client";
import { getDb } from "../../db.ts";
import { connectDbTarget } from "../../lib/db-target.ts";

const APPLY = process.argv.includes("--apply");
const target = await connectDbTarget({
  writes: APPLY,
  purpose: "delete the chess farm's off-tree positions",
});
const db = getDb();

const evals = (
  await db.execute({
    sql: "SELECT fen_key, kind, best, result_json, depth, source, engine, created_at FROM chess_position_evals WHERE spec = ?",
    args: [BEST_MOVE_SPEC],
  })
).rows;
const jobs = (
  await db.execute({
    sql: "SELECT * FROM chess_eval_jobs WHERE spec = ?",
    args: [BEST_MOVE_SPEC],
  })
).rows;

const best = new Map<string, string>();
const held = new Map<string, HeldPosition>();
for (const r of evals) {
  const kind = r.kind === "user" ? "user" : "opp";
  const fen = String((JSON.parse(String(r.result_json)) as { fen: string }).fen);
  held.set(`${r.fen_key}|${kind}`, { key: String(r.fen_key), fen, kind });
  if (kind === "user") best.set(String(r.fen_key), String(r.best));
}
for (const r of jobs) {
  const kind = r.kind === "user" ? "user" : "opp";
  held.set(`${r.fen_key}|${kind}`, { key: String(r.fen_key), fen: String(r.fen), kind });
}

// Your starred moves, from every saved tree.
const treeDbs = [db];
if (target.kind === "production" && process.env.TURSO_DATABASE_URL) {
  treeDbs.push(
    createClient({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    }),
  );
}
const handpicked = { w: new Map<string, string>(), b: new Map<string, string>() };
for (const tdb of treeDbs) {
  const trees = await tdb.execute(
    "SELECT color, tree_json FROM chess_repertoires WHERE tree_json IS NOT NULL",
  );
  for (const t of trees.rows) {
    const color = t.color === "b" ? "b" : "w";
    const tree = JSON.parse(String(t.tree_json)) as {
      nodes: Record<string, { fen: string; choice?: { source: string; uci?: string } }>;
    };
    for (const n of Object.values(tree.nodes)) {
      if (n.choice?.source === "handpicked" && n.choice.uci) {
        handpicked[color].set(positionKey(parseFen(n.fen)), n.choice.uci);
      }
    }
  }
}

const off: HeldPosition[] = [];
for (const color of ["w", "b"] as const) {
  const choices = handpicked[color];
  const found = offTreePositions({ color, positions: [...held.values()], best, choices });
  console.log(
    `[prune] ${color === "w" ? "White" : "Black"}: ${found.length} off-tree positions` +
      ` (${handpicked[color].size} starred moves)`,
  );
  off.push(...found);
}

const offIds = new Set(off.map((p) => `${p.key}|${p.kind}`));
const evalRows = evals.filter((r) => offIds.has(`${r.fen_key}|${r.kind}`));
const jobRows = jobs.filter((r) => offIds.has(`${r.fen_key}|${r.kind}`));
const running = jobRows.filter((r) => r.status === "running");
const jobsToDelete = jobRows.filter((r) => r.status !== "running");
const by = (rows: typeof jobRows) => {
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(String(r.status), (counts.get(String(r.status)) ?? 0) + 1);
  return [...counts].map(([s, n]) => `${s} ${n}`);
};
console.log(
  `[prune] ${evalRows.length} evaluations, ${jobsToDelete.length} jobs (${by(jobsToDelete).join(", ")})` +
    (running.length > 0 ? `; ${running.length} running jobs left alone` : ""),
);
for (const p of off.slice(0, 20)) console.log(`  ${p.kind.padEnd(4)} ${p.fen}`);
if (off.length > 20) console.log(`  … and ${off.length - 20} more`);

if (APPLY && (evalRows.length > 0 || jobsToDelete.length > 0)) {
  const dir = new URL("../../../../../scratch/chess-farm/", import.meta.url);
  mkdirSync(dir, { recursive: true });
  const file = new URL(`pruned-${target.kind}-${Date.now()}.json`, dir);
  writeFileSync(
    file,
    JSON.stringify({ spec: BEST_MOVE_SPEC, evals: evalRows, jobs: jobsToDelete }),
  );
  console.log(`[prune] backup: ${file.pathname}`);
  // The walk can take long enough for the connection to drop: a fresh try reconnects.
  const deletes = [
    ...evalRows.map((r) => ({
      sql: "DELETE FROM chess_position_evals WHERE fen_key = ? AND spec = ? AND kind = ?",
      args: [String(r.fen_key), BEST_MOVE_SPEC, String(r.kind)],
    })),
    ...jobsToDelete.map((r) => ({
      sql: "DELETE FROM chess_eval_jobs WHERE id = ? AND status <> 'running'",
      args: [Number(r.id)],
    })),
  ];
  for (let attempt = 0; ; attempt++) {
    try {
      await db.batch(deletes, "write");
      break;
    } catch (err) {
      if (attempt >= 3) throw err;
      await new Promise((r) => setTimeout(r, 3_000 * (attempt + 1)));
    }
  }
  console.log("[prune] deleted");
}
