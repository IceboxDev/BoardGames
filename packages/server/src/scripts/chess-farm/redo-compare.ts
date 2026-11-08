/**
 * The old heavy lane's results, searched again the normal way (2026-11-05: the
 * heavy lane is gone; its 11 results were deleted and their jobs requeued for
 * the normal lanes, backed up in `scratch/chess-farm/heavy-redo-<target>.json`).
 *
 *   pnpm --filter @boardgames/server exec tsx src/scripts/chess-farm/redo-compare.ts [--prod]
 *
 * Sets each new result beside its old one. Where your move changed, the line
 * past the old move is off the tree: `prune-off-tree.ts --apply` deletes it,
 * and the new move's follow-ups are already queued.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { BEST_MOVE_SPEC } from "@boardgames/core/games/chess/trainer/eval-policy";
import { getDb } from "../../db.ts";
import { connectDbTarget } from "../../lib/db-target.ts";

const target = await connectDbTarget({ writes: false, purpose: "compare the redone results" });
const db = getDb();
const file = new URL(
  `../../../../../scratch/chess-farm/heavy-redo-${target.kind}.json`,
  import.meta.url,
);

interface Saved {
  readonly eval: Record<string, unknown>;
  readonly job: Record<string, unknown>;
}

type Line = { uci: string; cp: number | null; mate: number | null };
const score = (l: Line | undefined) =>
  !l ? "?" : l.mate !== null ? `#${l.mate}` : `${((l.cp ?? 0) / 100).toFixed(2)}`;
const top = (json: unknown) => {
  const r = JSON.parse(String(json)) as { best: string; lines: Line[]; ties: string[] };
  return `${r.best} ${score(r.lines[0])}${r.ties.length > 1 ? ` (ties ${r.ties.join(",")})` : ""}`;
};

const saved = JSON.parse(readFileSync(file, "utf8")) as { saved: Saved[] };
let changed = 0;
let pending = 0;
for (const s of saved.saved) {
  const kind = String(s.eval.kind);
  const now = (
    await db.execute({
      sql: "SELECT best, result_json FROM chess_position_evals WHERE fen_key = ? AND spec = ? AND kind = ?",
      args: [String(s.eval.fen_key), BEST_MOVE_SPEC, kind],
    })
  ).rows[0];
  const was = `#${s.job.id} ${kind.padEnd(4)} was ${top(s.eval.result_json)}`;
  if (!now) {
    pending++;
    console.log(`${was} · not searched yet`);
    continue;
  }
  const moved = String(now.best) !== String(s.eval.best);
  if (moved) changed++;
  console.log(`${was} · now ${top(now.result_json)}${moved ? "  ← CHANGED" : ""}`);
}
console.log(
  `[redo] ${saved.saved.length} positions: ${changed} changed, ${pending} still waiting` +
    (changed > 0
      ? "\n[redo] a changed move of yours: run prune-off-tree.ts --apply (an opponent position keeps every reply)"
      : ""),
);
