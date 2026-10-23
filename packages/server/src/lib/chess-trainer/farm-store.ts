/**
 * The chess analysis farm's tables (migration 0056): the shared evaluation
 * cache, the job queue a worker claims from, and worker check-ins.
 */
import { parseFen, positionKey } from "@boardgames/core/games/chess/engine/fen";
import { legalMoves } from "@boardgames/core/games/chess/engine/movegen";
import { moveToUci } from "@boardgames/core/games/chess/engine/uci";
import { finalDepth, pickBest } from "@boardgames/core/games/chess/trainer/eval-policy";
import {
  type EvalKind,
  FARM_HEAVY_PREFIX,
  FARM_NODE_LIMIT_PREFIX,
  type FarmJob,
  heavyEstimate,
  heavyMark,
  type PositionEval,
  PositionEvalSchema,
} from "@boardgames/core/protocol";
import type { Client, InStatement } from "@libsql/client";
import { z } from "zod";
import { jsonColumn, parseRows } from "../db-rows.ts";

/**
 * A claim this old (ms) may be taken by another worker. A single-thread
 * depth-50 search has no time limit and can run for days, and a stopped worker
 * releases its job, so this only covers a machine that died outright. (At 24 h
 * live 30–40 h searches were handed to a second lane, whose claim then made
 * the first lane's result unsaveable.) A restarted worker takes its own
 * running jobs back at once.
 */
export const LEASE_MS = 7 * 24 * 3600_000;
/** Jobs failing this often stay failed. */
const MAX_ATTEMPTS = 3;
const WORKER_SEEN_MS = 10 * 60_000;

/** The cache key of a FEN: `positionKey`, or `null` for a FEN that doesn't parse. */
export function fenKey(fen: string): string | null {
  try {
    return positionKey(parseFen(fen));
  } catch {
    return null;
  }
}

const EvalRowSchema = z.object({
  fen_key: z.string(),
  kind: z.enum(["user", "opp"]),
  result_json: jsonColumn(PositionEvalSchema),
});

export interface EvalRequest {
  readonly fen: string;
  readonly kind: EvalKind;
  readonly reach: number;
  /** 0 on a game line; 1–3 a line end's extension (`EvalStageSchema`). */
  readonly stage?: number;
}

/**
 * Known results for `items` (keyed by their FEN), and queue the rest. A
 * position asked for again keeps its highest reach; a failed one that may be
 * retried goes back in the queue.
 */
export async function requestEvals(
  db: Client,
  userId: string | null,
  spec: string,
  items: readonly EvalRequest[],
): Promise<{ results: Record<string, PositionEval>; queued: number }> {
  const keyed = items.flatMap((i) => {
    const key = fenKey(i.fen);
    return key ? [{ ...i, key }] : [];
  });
  const results: Record<string, PositionEval> = {};
  if (keyed.length === 0) return { results, queued: 0 };

  const found = new Map<string, PositionEval>();
  for (let i = 0; i < keyed.length; i += 200) {
    const chunk = keyed.slice(i, i + 200);
    const res = await db.execute({
      sql: `SELECT fen_key, kind, result_json FROM chess_position_evals
            WHERE spec = ? AND (fen_key, kind) IN (VALUES ${chunk.map(() => "(?, ?)").join(", ")})`,
      args: [spec, ...chunk.flatMap((c) => [c.key, c.kind])],
    });
    for (const row of parseRows(EvalRowSchema, res.rows, "chess_position_evals")) {
      found.set(`${row.fen_key}|${row.kind}`, row.result_json);
    }
  }

  const missing: typeof keyed = [];
  // Stored but short of its final depth (an older farm's capped search, an older
  // tier): not an answer — searched again, and replaced when the full one lands.
  const shallow: typeof keyed = [];
  const known: typeof keyed = [];
  for (const item of keyed) {
    const hit = found.get(`${item.key}|${item.kind}`);
    if (hit && hit.depth >= finalDepth(item.kind, item.reach)) {
      results[item.fen] = hit;
      if ((item.stage ?? 0) === 0) known.push(item);
    } else {
      missing.push(item);
      if (hit) shallow.push(item);
    }
  }
  const statements: InStatement[] = missing.map((m) => ({
    sql: `INSERT INTO chess_eval_jobs (fen_key, spec, kind, fen, reach, requested_by, stage)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT (fen_key, spec, kind) DO UPDATE SET
            reach = MAX(chess_eval_jobs.reach, excluded.reach),
            stage = MIN(chess_eval_jobs.stage, excluded.stage),
            status = CASE
              WHEN chess_eval_jobs.status = 'failed' AND chess_eval_jobs.attempts < ${MAX_ATTEMPTS}
                THEN 'queued' ELSE chess_eval_jobs.status END,
            updated_at = datetime('now')`,
    args: [m.key, spec, m.kind, m.fen, m.reach, userId, m.stage ?? 0],
  }));
  for (const m of known) {
    // Now on one of your games' lines: its follow-ups are a game line's.
    statements.push({
      sql: "UPDATE chess_eval_jobs SET stage = 0 WHERE fen_key = ? AND spec = ? AND kind = ? AND stage > 0",
      args: [m.key, spec, m.kind],
    });
  }
  for (const m of shallow) {
    statements.push({
      sql: `UPDATE chess_eval_jobs SET status = 'queued', attempts = 0, error = NULL,
              worker = NULL, claimed_at_ms = NULL, updated_at = datetime('now')
            WHERE fen_key = ? AND spec = ? AND kind = ? AND status IN ('done', 'failed')`,
      args: [m.key, spec, m.kind],
    });
  }
  if (statements.length > 0) await db.batch(statements, "write");
  return { results, queued: missing.length };
}

const StatsRowSchema = z.object({
  status: z.string(),
  n: z.number(),
});

export async function farmStats(db: Client) {
  const [counts, avg, seen, heavy] = await Promise.all([
    db.execute("SELECT status, COUNT(*) AS n FROM chess_eval_jobs GROUP BY status"),
    db.execute(`SELECT AVG(seconds) AS s FROM chess_eval_jobs
                WHERE status = 'done' AND seconds IS NOT NULL AND updated_at > datetime('now', '-1 day')`),
    db.execute("SELECT MAX(last_seen_ms) AS t FROM chess_farm_workers"),
    db.execute({
      sql: `SELECT status, COUNT(*) AS n FROM chess_eval_jobs
            WHERE error LIKE ? AND status IN ('queued', 'running') GROUP BY status`,
      args: [`${FARM_HEAVY_PREFIX}%`],
    }),
  ]);
  const by = Object.fromEntries(
    parseRows(StatsRowSchema, counts.rows, "chess_eval_jobs.stats").map((r) => [r.status, r.n]),
  );
  const heavyBy = Object.fromEntries(
    parseRows(StatsRowSchema, heavy.rows, "chess_eval_jobs.heavy").map((r) => [r.status, r.n]),
  );
  const avgSeconds = avg.rows[0]?.s;
  const lastSeen = seen.rows[0]?.t;
  return {
    queued: Number(by.queued ?? 0),
    running: Number(by.running ?? 0),
    done: Number(by.done ?? 0),
    failed: Number(by.failed ?? 0),
    avgSeconds: typeof avgSeconds === "number" ? Math.round(avgSeconds * 10) / 10 : null,
    lastSeen: typeof lastSeen === "number" ? new Date(lastSeen).toISOString() : null,
    heavy: { queued: Number(heavyBy.queued ?? 0), running: Number(heavyBy.running ?? 0) },
  };
}

const PlaceRowSchema = z.object({
  fen_key: z.string(),
  kind: z.enum(["user", "opp"]),
  status: z.enum(["queued", "running"]),
});

/**
 * Where `items` stand at the farm, for an ETA: running, or queued with how
 * many jobs come first in the order the farm's lanes claim them (the most
 * popular, then the most reached, then the oldest; `claimJobs`). A position
 * with no live job is left out. `lanes` is the searches running now.
 */
export async function queuePlaces(
  db: Client,
  spec: string,
  items: readonly { fen: string; kind: EvalKind }[],
): Promise<{
  places: Record<string, { status: "queued" | "running"; ahead: number }>;
  lanes: number;
  avgSeconds: number | null;
}> {
  const [res, stats] = await Promise.all([
    db.execute({
      // The heavy lane's jobs aren't in this order and have no ETA: left out.
      sql: `SELECT fen_key, kind, status FROM chess_eval_jobs
             WHERE spec = ? AND status IN ('queued', 'running')
               AND (error IS NULL OR error NOT LIKE ?)
             ORDER BY popularity IS NULL, popularity DESC, reach DESC, id`,
      args: [spec, `${FARM_HEAVY_PREFIX}%`],
    }),
    farmStats(db),
  ]);
  const rank = new Map<string, { status: "queued" | "running"; ahead: number }>();
  let queuedSoFar = 0;
  for (const row of parseRows(PlaceRowSchema, res.rows, "chess_eval_jobs.places")) {
    const id = `${row.fen_key}|${row.kind}`;
    if (row.status === "running") rank.set(id, { status: "running", ahead: 0 });
    else rank.set(id, { status: "queued", ahead: queuedSoFar++ });
  }
  const places: Record<string, { status: "queued" | "running"; ahead: number }> = {};
  for (const item of items) {
    const key = fenKey(item.fen);
    const place = key ? rank.get(`${key}|${item.kind}`) : undefined;
    if (place) places[item.fen] = place;
  }
  return { places, lanes: stats.running, avgSeconds: stats.avgSeconds };
}

/** Whether a worker checked in recently enough to call the farm "running". */
export function workerAlive(lastSeen: string | null, now = Date.now()): boolean {
  return lastSeen !== null && now - Date.parse(lastSeen) < WORKER_SEEN_MS;
}

async function touchWorker(db: Client, worker: string, now: number): Promise<void> {
  await db.execute({
    sql: `INSERT INTO chess_farm_workers (worker, last_seen_ms) VALUES (?, ?)
          ON CONFLICT (worker) DO UPDATE SET last_seen_ms = excluded.last_seen_ms`,
    args: [worker, now],
  });
}

const JobRowSchema = z.object({
  id: z.number(),
  fen: z.string(),
  kind: z.enum(["user", "opp"]),
  reach: z.number(),
  spec: z.string(),
  attempts: z.number(),
  requested_by: z.string().nullable(),
  stage: z.number(),
});

/** Plies from the start, from a FEN's side to move and move number. */
function plyOf(fen: string): number {
  const [, side, , , , full] = fen.split(" ");
  return ((Number(full) || 1) - 1) * 2 + (side === "b" ? 1 : 0);
}

const CandidateRowSchema = z.object({
  id: z.number(),
  fen_key: z.string(),
  fen: z.string(),
  reach: z.number(),
});

/**
 * Lease up to `max` jobs of `kinds` to `worker`. `reach` order: the positions
 * most played on lichess first (`popularity`; not looked up yet waits behind
 * every counted one), then highest reach, then the `prefer`red positions (the
 * worker's follow-ups, whose parent is still in its hash) in their order, then
 * oldest first — the warm hash saves
 * ~5–20 %, too little to spend hours on a one-game line while a main line
 * waits. `deep` order: the preferred positions first, then the deepest waiting
 * position (most reach among equals) — a worker that finishes lines.
 *
 * Jobs handed to the heavy lane (`FARM_HEAVY_PREFIX`) are the `heavy` lane's
 * alone: its own unfinished one first (a restarted heavy worker), then the
 * smallest estimate, so the most results come back soonest and the worst
 * offenders wait for the rest — and never re-leased by age, since
 * one heavy search may run for weeks.
 */
export async function claimJobs(
  db: Client,
  worker: string,
  max: number,
  prefer: readonly string[] = [],
  kinds: readonly EvalKind[] = ["user", "opp"],
  now = Date.now(),
  order: "reach" | "deep" = "reach",
  lane: "normal" | "heavy" = "normal",
): Promise<FarmJob[]> {
  await touchWorker(db, worker, now);
  if (lane === "heavy") return claimHeavy(db, worker, max, kinds, now);
  const keys = prefer.flatMap((fen) => {
    const key = fenKey(fen);
    return key ? [key] : [];
  });
  const rank = (key: string) => {
    const i = keys.indexOf(key);
    return i < 0 ? keys.length : i;
  };
  // Never a job this worker already ran out of nodes on (another worker may
  // finish it), nor one handed to the heavy lane.
  const claimable = `kind IN (${kinds.map(() => "?").join(", ")})
              AND (status = 'queued'
                OR (status = 'running' AND (claimed_at_ms < ? OR worker = ?)))
              AND (error IS NULL OR (error NOT LIKE ? AND error NOT LIKE ?))`;
  const claimableArgs = [
    ...kinds,
    now - LEASE_MS,
    worker,
    `${FARM_NODE_LIMIT_PREFIX}${worker}:%`,
    `${FARM_HEAVY_PREFIX}%`,
  ];

  let pick: { sql: string; args: (string | number)[] };
  if (order === "deep") {
    const res = await db.execute({
      sql: `SELECT id, fen_key, fen, reach FROM chess_eval_jobs WHERE ${claimable}`,
      args: claimableArgs,
    });
    const ids = parseRows(CandidateRowSchema, res.rows, "chess_eval_jobs.candidates")
      .sort(
        (a, b) =>
          rank(a.fen_key) - rank(b.fen_key) ||
          plyOf(b.fen) - plyOf(a.fen) ||
          b.reach - a.reach ||
          a.id - b.id,
      )
      .slice(0, max)
      .map((r) => r.id);
    if (ids.length === 0) return [];
    pick = { sql: ids.map(() => "?").join(", "), args: ids };
  } else {
    const preferOrder =
      keys.length > 0
        ? `CASE fen_key ${keys.map((_, i) => `WHEN ? THEN ${i}`).join(" ")} ELSE ${keys.length} END, `
        : "";
    pick = {
      sql: `SELECT id FROM chess_eval_jobs WHERE ${claimable}
            ORDER BY popularity IS NULL, popularity DESC, reach DESC, ${preferOrder}id LIMIT ?`,
      args: [...claimableArgs, ...keys, max],
    };
  }
  // The claimable test again on the UPDATE: a `deep` pick may have been leased meanwhile.
  const res = await db.execute({
    sql: `UPDATE chess_eval_jobs
          SET status = 'running', worker = ?, claimed_at_ms = ?, attempts = attempts + 1,
              updated_at = datetime('now')
          WHERE id IN (${pick.sql}) AND ${claimable}
          RETURNING id, fen_key, fen, kind, reach, spec, attempts, requested_by, stage, popularity`,
    args: [worker, now, ...pick.args, ...claimableArgs],
  });
  const rows = parseRows(
    JobRowSchema.extend({ fen_key: z.string(), popularity: z.number().nullable() }),
    res.rows,
    "chess_eval_jobs.claim",
  );
  const byOrder =
    order === "deep"
      ? (a: (typeof rows)[number], b: (typeof rows)[number]) =>
          rank(a.fen_key) - rank(b.fen_key) || plyOf(b.fen) - plyOf(a.fen) || b.reach - a.reach
      : (a: (typeof rows)[number], b: (typeof rows)[number]) =>
          (b.popularity ?? -1) - (a.popularity ?? -1) ||
          b.reach - a.reach ||
          rank(a.fen_key) - rank(b.fen_key) ||
          a.id - b.id;
  return rows.sort(byOrder).map((r) => ({
    id: r.id,
    fen: r.fen,
    kind: r.kind,
    reach: r.reach,
    spec: r.spec,
    attempts: r.attempts,
    requestedBy: r.requested_by,
    stage: r.stage,
  }));
}

const HeavyRowSchema = z.object({
  id: z.number(),
  status: z.string(),
  worker: z.string().nullable(),
  error: z.string().nullable(),
});

/** The heavy lane's claim (see `claimJobs`). */
async function claimHeavy(
  db: Client,
  worker: string,
  max: number,
  kinds: readonly EvalKind[],
  now: number,
): Promise<FarmJob[]> {
  const claimable = `kind IN (${kinds.map(() => "?").join(", ")}) AND error LIKE ?
              AND (status = 'queued' OR (status = 'running' AND worker = ?))`;
  const claimableArgs = [...kinds, `${FARM_HEAVY_PREFIX}%`, worker];
  const res = await db.execute({
    sql: `SELECT id, status, worker, error FROM chess_eval_jobs WHERE ${claimable}`,
    args: claimableArgs,
  });
  const ids = parseRows(HeavyRowSchema, res.rows, "chess_eval_jobs.heavy")
    .sort(
      (a, b) =>
        Number(b.status === "running") - Number(a.status === "running") ||
        (heavyEstimate(a.error) ?? 0) - (heavyEstimate(b.error) ?? 0) ||
        a.id - b.id,
    )
    .slice(0, max)
    .map((r) => r.id);
  if (ids.length === 0) return [];
  const leased = await db.execute({
    sql: `UPDATE chess_eval_jobs
          SET status = 'running', worker = ?, claimed_at_ms = ?, attempts = attempts + 1,
              updated_at = datetime('now')
          WHERE id IN (${ids.map(() => "?").join(", ")}) AND ${claimable}
          RETURNING id, fen, kind, reach, spec, attempts, requested_by, stage`,
    args: [worker, now, ...ids, ...claimableArgs],
  });
  const rows = parseRows(JobRowSchema, leased.rows, "chess_eval_jobs.heavy-claim");
  return ids.flatMap((id) => {
    const r = rows.find((x) => x.id === id);
    return r
      ? [
          {
            id: r.id,
            fen: r.fen,
            kind: r.kind,
            reach: r.reach,
            spec: r.spec,
            attempts: r.attempts,
            requestedBy: r.requested_by,
            stage: r.stage,
          },
        ]
      : [];
  });
}

export type CompleteResult = { ok: true } | { ok: false; status: 404 | 409 | 422; message: string };

/** Why a result can't be stored for this FEN, or `null` when it's sound. */
export function resultProblem(fen: string, result: PositionEval): string | null {
  let legal: Set<string>;
  try {
    legal = new Set(legalMoves(parseFen(fen)).map(moveToUci));
  } catch {
    return "unreadable FEN";
  }
  if (!legal.has(result.best)) return `best move ${result.best} is not legal`;
  for (const line of result.lines) {
    if (!legal.has(line.uci)) return `line move ${line.uci} is not legal`;
    if (line.cp === null && line.mate === null) return `line ${line.uci} has no score`;
  }
  for (const t of result.ties) if (!legal.has(t)) return `tie ${t} is not legal`;
  return null;
}

/** Store a finished job's result (the deeper one wins) and close the job. */
/**
 * Your move, decided here from what was searched — Stockfish's highest score,
 * Lc0 only between exactly equal ones (`pickBest`) — so every result follows
 * the current rule whichever worker version sent it.
 */
export function decide(result: PositionEval): PositionEval {
  if (result.kind !== "user" || result.lines.length === 0) return result;
  const pick = pickBest(
    result.lines.map((l) => ({ uci: l.uci, cp: l.cp, mate: l.mate })),
    result.lc0 ?? [],
  );
  return { ...result, best: pick.best, ties: [...pick.ties], contested: pick.contested };
}

export async function completeJob(
  db: Client,
  worker: string,
  id: number,
  sent: PositionEval,
  now = Date.now(),
): Promise<CompleteResult> {
  const result = decide(sent);
  await touchWorker(db, worker, now);
  const res = await db.execute({
    sql: "SELECT fen_key, fen, kind, spec, status, worker, reach FROM chess_eval_jobs WHERE id = ?",
    args: [id],
  });
  const job = res.rows[0];
  if (!job) return { ok: false, status: 404, message: "No such job" };
  if (job.status !== "running" || job.worker !== worker) {
    return { ok: false, status: 409, message: "The job isn't leased to this worker" };
  }
  if (result.kind !== job.kind || result.spec !== job.spec) {
    return { ok: false, status: 422, message: "Result doesn't match the job's kind or spec" };
  }
  const problem = resultProblem(String(job.fen), result);
  if (problem) return { ok: false, status: 422, message: problem };
  const needs = finalDepth(result.kind, Number(job.reach));
  if (result.depth < needs) {
    return { ok: false, status: 422, message: `Depth ${result.depth} is short of ${needs}` };
  }
  await db.batch(
    [
      {
        sql: `INSERT INTO chess_position_evals (fen_key, spec, kind, best, depth, source, engine, result_json)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT (fen_key, spec, kind) DO UPDATE SET
                best = excluded.best, depth = excluded.depth, source = excluded.source,
                engine = excluded.engine, result_json = excluded.result_json,
                created_at = datetime('now')
              WHERE excluded.depth >= chess_position_evals.depth`,
        args: [
          String(job.fen_key),
          result.spec,
          result.kind,
          result.best,
          result.depth,
          result.source,
          result.engine,
          JSON.stringify({ ...result, fen: String(job.fen) }),
        ],
      },
      {
        sql: `UPDATE chess_eval_jobs SET status = 'done', seconds = ?, error = NULL,
                updated_at = datetime('now') WHERE id = ?`,
        args: [result.seconds, id],
      },
    ],
    "write",
  );
  return { ok: true };
}

/**
 * A worker couldn't finish a job: back in the queue (while attempts last) or
 * failed. `heavy` hands it to the heavy lane instead (queued, the attempt not
 * counted); a job already there keeps its marker whatever happens to it.
 */
export async function failJob(
  db: Client,
  worker: string,
  id: number,
  error: string,
  retry: boolean,
  now = Date.now(),
  released = false,
  heavy?: { estHours: number; why: string },
): Promise<CompleteResult> {
  await touchWorker(db, worker, now);
  const message = heavy ? heavyMark(heavy.estHours, heavy.why) : error.slice(0, 500);
  const keep = `CASE WHEN error LIKE '${FARM_HEAVY_PREFIX}%' THEN error ELSE ? END`;
  const res = await db.execute({
    sql:
      released || heavy
        ? `UPDATE chess_eval_jobs SET
            status = 'queued', attempts = MAX(0, attempts - 1), error = ${heavy ? "?" : keep},
            worker = NULL, claimed_at_ms = NULL, updated_at = datetime('now')
          WHERE id = ? AND status = 'running' AND worker = ?`
        : `UPDATE chess_eval_jobs SET
            status = CASE WHEN ? AND attempts < ${MAX_ATTEMPTS} THEN 'queued' ELSE 'failed' END,
            error = ${keep}, worker = NULL, claimed_at_ms = NULL, updated_at = datetime('now')
          WHERE id = ? AND status = 'running' AND worker = ?`,
    args: released || heavy ? [message, id, worker] : [retry ? 1 : 0, message, id, worker],
  });
  if (res.rowsAffected === 0) {
    return { ok: false, status: 409, message: "The job isn't leased to this worker" };
  }
  return { ok: true };
}
