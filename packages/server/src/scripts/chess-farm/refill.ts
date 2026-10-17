/**
 * Queue every follow-up the farm's finished positions should have and don't:
 * after a rule change (the trainer's reply padding, 2026-10-15), positions
 * finished by older worker code, or a cleared queue. Runs the workers' own
 * `followUps` over each finished position of the current spec; already queued
 * or known positions are left alone, so it is safe to run any number of times.
 *
 *   pnpm --filter @boardgames/server exec tsx src/scripts/chess-farm/refill.ts [--apply]
 *
 * Reads the staging database (`.env`); needs `LICHESS_TOKEN` for the padding.
 */
import "dotenv/config";
import { parseFen } from "@boardgames/core/games/chess/engine/fen";
import { BEST_MOVE_SPEC } from "@boardgames/core/games/chess/trainer/eval-policy";
import {
  legalPrefix,
  otherColor,
  PositionIndex,
  type TrainerGame,
} from "@boardgames/core/games/chess/trainer/position-index";
import { type FarmJob, PositionEvalSchema } from "@boardgames/core/protocol";
import { getDb } from "../../db.ts";
import { type EvalRequest, requestEvals } from "../../lib/chess-trainer/farm-store.ts";
import { popularMoves } from "../../lib/chess-trainer/lichess-explorer.ts";
import { readGamesPage } from "../../lib/chess-trainer/store.ts";
import { connectDbTarget } from "../../lib/db-target.ts";
import { followUps, needsPopular } from "./follow-ups.ts";

const APPLY = process.argv.includes("--apply");
await connectDbTarget({ writes: APPLY, purpose: "refill the chess farm's follow-ups" });
const db = getDb();

/** The database drops a long-running connection now and then: try a read again. */
async function retried<T>(read: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await read();
    } catch (err) {
      if (attempt >= 4) throw err;
      await new Promise((r) => setTimeout(r, 5_000 * (attempt + 1)));
    }
  }
}

const indexes = new Map<string, PositionIndex>();
async function gamesIndex(user: string, color: "w" | "b"): Promise<PositionIndex> {
  const key = `${user}:${color}`;
  const hit = indexes.get(key);
  if (hit) return hit;
  const games: TrainerGame[] = [];
  let cursor: string | undefined;
  do {
    const page = await retried(() => readGamesPage(db, user, color, cursor));
    for (const g of page.games)
      games.push({ id: g.id, moves: legalPrefix(g.uci), result: g.result });
    cursor = page.next ?? undefined;
  } while (cursor);
  const index = PositionIndex.build(games);
  indexes.set(key, index);
  return index;
}

const rows = await retried(() =>
  db.execute({
    sql: `SELECT j.id, j.fen, j.kind, j.reach, j.attempts, j.requested_by, j.stage, e.result_json
        FROM chess_eval_jobs j JOIN chess_position_evals e
          ON e.fen_key = j.fen_key AND e.spec = j.spec AND e.kind = j.kind
        WHERE j.spec = ? AND j.status = 'done' AND j.requested_by IS NOT NULL`,
    args: [BEST_MOVE_SPEC],
  }),
);

let queued = 0;
let positions = 0;
let skipped = 0;
for (const r of rows.rows) {
  const job: FarmJob = {
    id: Number(r.id),
    fen: String(r.fen),
    kind: r.kind === "opp" ? "opp" : "user",
    reach: Number(r.reach),
    spec: BEST_MOVE_SPEC,
    attempts: Number(r.attempts),
    requestedBy: String(r.requested_by),
    stage: Number(r.stage ?? 0),
  };
  const result = PositionEvalSchema.parse(JSON.parse(String(r.result_json)));
  const side = parseFen(job.fen).turn;
  const color = job.kind === "user" ? side : otherColor(side);
  let popular: string[] = [];
  if (needsPopular(job)) {
    try {
      popular = (await popularMoves(job.fen)).map((m) => m.uci);
    } catch (err) {
      // Padded on the next run; one position never stops the rest.
      console.warn(`#${job.id}: explorer failed (${err instanceof Error ? err.message : err})`);
      skipped++;
      continue;
    }
  }
  const items: EvalRequest[] = followUps(
    job,
    result,
    await gamesIndex(String(r.requested_by), color),
    popular,
  );
  if (items.length === 0) continue;
  positions++;
  if (APPLY) {
    const res = await retried(() =>
      requestEvals(db, String(r.requested_by), BEST_MOVE_SPEC, items),
    );
    queued += res.queued;
  }
}
console.log(
  `${rows.rows.length} finished positions; ${positions} with follow-ups` +
    (APPLY ? `; ${queued} queued (new or already waiting)` : " (dry run: --apply to queue)") +
    (skipped > 0 ? `; ${skipped} skipped (explorer failed)` : ""),
);
process.exit(0);
