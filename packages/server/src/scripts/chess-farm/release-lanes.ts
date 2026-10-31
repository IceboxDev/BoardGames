/**
 * Put back in the queue the jobs held by lanes that are gone — a fleet stopped
 * or terminated before its searches finished (its machines come back under new
 * names, so their leases would otherwise hold the jobs for `LEASE_MS`). Jobs
 * handed to the heavy lane keep their mark and stay the heavy lane's.
 *
 *   pnpm --filter @boardgames/server exec tsx src/scripts/chess-farm/release-lanes.ts \
 *     --worker=aws- [--keep=aws-51-20-69-177-,…] [--idle-hours=1] [--prod] [--apply]
 *
 * `--worker` is a worker-name prefix (`aws-` = every fleet lane, `aws-51-20-` …);
 * only workers not heard from for `--idle-hours` count as gone. A live lane deep
 * in a long search is silent too, so pass the running fleet's lanes as `--keep`.
 */
import "dotenv/config";
import { getDb } from "../../db.ts";
import { connectDbTarget } from "../../lib/db-target.ts";

const arg = (name: string) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const prefix = arg("worker");
if (!prefix) throw new Error("--worker=<prefix> is required (e.g. --worker=aws-)");
const keep = (arg("keep") ?? "").split(",").filter(Boolean);
const idleHours = Number(arg("idle-hours") ?? 1);
const APPLY = process.argv.includes("--apply");

await connectDbTarget({ writes: APPLY, purpose: "release jobs held by lanes that are gone" });
const db = getDb();
const cutoff = Date.now() - idleHours * 3600_000;

// A lane's heartbeat is its last claim or result: a long search stays silent, so
// only the caller knows the lanes are really gone (a stopped fleet).
const held = await db.execute({
  sql: `SELECT j.id, j.worker, j.kind, j.claimed_at_ms, w.last_seen_ms
          FROM chess_eval_jobs j LEFT JOIN chess_farm_workers w ON w.worker = j.worker
         WHERE j.status = 'running' AND j.worker LIKE ? AND COALESCE(w.last_seen_ms, 0) < ?`,
  args: [`${prefix}%`, cutoff],
});
const gone = held.rows.filter((r) => !keep.some((k) => String(r.worker).startsWith(k)));
for (const r of gone) {
  const hours = ((Date.now() - Number(r.claimed_at_ms ?? 0)) / 3600_000).toFixed(1);
  console.log(`  #${r.id} ${r.kind} held by ${r.worker} for ${hours} h`);
}
console.log(`[release] ${gone.length} jobs held by gone ${prefix}* lanes`);

if (APPLY && gone.length > 0) {
  const res = await db.execute({
    sql: `UPDATE chess_eval_jobs
             SET status = 'queued', worker = NULL, claimed_at_ms = NULL, updated_at = datetime('now')
           WHERE status = 'running' AND id IN (${gone.map(() => "?").join(", ")})`,
    args: gone.map((r) => Number(r.id)),
  });
  console.log(`[release] ${res.rowsAffected} back in the queue`);
}
