/**
 * The chess analysis farm's tables (migration 0056): the shared evaluation
 * cache, the job queue a worker claims from, and worker check-ins.
 */
import { parseFen, positionKey } from "@boardgames/core/games/chess/engine/fen";
import { legalMoves } from "@boardgames/core/games/chess/engine/movegen";
import { moveToUci } from "@boardgames/core/games/chess/engine/uci";
import {
  type EvalKind,
  type FarmJob,
  type PositionEval,
  PositionEvalSchema,
} from "@boardgames/core/protocol";
import type { Client, InStatement } from "@libsql/client";
import { z } from "zod";
import { jsonColumn, parseRows } from "../db-rows.ts";

/**
 * A claim this old (ms) may be taken by another worker. A trunk position with
 * its candidates can search for most of an hour; a restarted worker takes its
 * own running jobs back at once.
 */
export const LEASE_MS = 3 * 3600_000;
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
}

/**
 * Known results for `items` (keyed by their FEN), and queue the rest. A
 * position asked for again keeps its highest reach; a failed one that may be
 * retried goes back in the queue.
 */
export async function requestEvals(
  db: Client,
  userId: string,
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
  for (const item of keyed) {
    const hit = found.get(`${item.key}|${item.kind}`);
    if (hit) results[item.fen] = hit;
    else missing.push(item);
  }
  if (missing.length > 0) {
    const statements: InStatement[] = missing.map((m) => ({
      sql: `INSERT INTO chess_eval_jobs (fen_key, spec, kind, fen, reach, requested_by)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT (fen_key, spec, kind) DO UPDATE SET
              reach = MAX(chess_eval_jobs.reach, excluded.reach),
              status = CASE
                WHEN chess_eval_jobs.status = 'failed' AND chess_eval_jobs.attempts < ${MAX_ATTEMPTS}
                  THEN 'queued' ELSE chess_eval_jobs.status END,
              updated_at = datetime('now')`,
      args: [m.key, spec, m.kind, m.fen, m.reach, userId],
    }));
    await db.batch(statements, "write");
  }
  return { results, queued: missing.length };
}

const StatsRowSchema = z.object({
  status: z.string(),
  n: z.number(),
});

export async function farmStats(db: Client) {
  const [counts, avg, seen] = await Promise.all([
    db.execute("SELECT status, COUNT(*) AS n FROM chess_eval_jobs GROUP BY status"),
    db.execute(`SELECT AVG(seconds) AS s FROM chess_eval_jobs
                WHERE status = 'done' AND seconds IS NOT NULL AND updated_at > datetime('now', '-1 day')`),
    db.execute("SELECT MAX(last_seen_ms) AS t FROM chess_farm_workers"),
  ]);
  const by = Object.fromEntries(
    parseRows(StatsRowSchema, counts.rows, "chess_eval_jobs.stats").map((r) => [r.status, r.n]),
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
  };
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
});

/** Lease up to `max` jobs to `worker`: highest reach first, oldest first. */
export async function claimJobs(
  db: Client,
  worker: string,
  max: number,
  now = Date.now(),
): Promise<FarmJob[]> {
  await touchWorker(db, worker, now);
  const res = await db.execute({
    sql: `UPDATE chess_eval_jobs
          SET status = 'running', worker = ?, claimed_at_ms = ?, attempts = attempts + 1,
              updated_at = datetime('now')
          WHERE id IN (
            SELECT id FROM chess_eval_jobs
            WHERE status = 'queued'
               OR (status = 'running' AND (claimed_at_ms < ? OR worker = ?))
            ORDER BY reach DESC, id
            LIMIT ?)
          RETURNING id, fen, kind, reach, spec, attempts`,
    args: [worker, now, now - LEASE_MS, worker, max],
  });
  return parseRows(JobRowSchema, res.rows, "chess_eval_jobs.claim").sort(
    (a, b) => b.reach - a.reach || a.id - b.id,
  );
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
export async function completeJob(
  db: Client,
  worker: string,
  id: number,
  result: PositionEval,
  now = Date.now(),
): Promise<CompleteResult> {
  await touchWorker(db, worker, now);
  const res = await db.execute({
    sql: "SELECT fen_key, fen, kind, spec, status, worker FROM chess_eval_jobs WHERE id = ?",
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

/** A worker couldn't finish a job: back in the queue (while attempts last) or failed. */
export async function failJob(
  db: Client,
  worker: string,
  id: number,
  error: string,
  retry: boolean,
  now = Date.now(),
): Promise<CompleteResult> {
  await touchWorker(db, worker, now);
  const res = await db.execute({
    sql: `UPDATE chess_eval_jobs SET
            status = CASE WHEN ? AND attempts < ${MAX_ATTEMPTS} THEN 'queued' ELSE 'failed' END,
            error = ?, worker = NULL, claimed_at_ms = NULL, updated_at = datetime('now')
          WHERE id = ? AND status = 'running' AND worker = ?`,
    args: [retry ? 1 : 0, error.slice(0, 500), id, worker],
  });
  if (res.rowsAffected === 0) {
    return { ok: false, status: 409, message: "The job isn't leased to this worker" };
  }
  return { ok: true };
}
