/**
 * Does a warm hash make the next position down the tree faster? For a few of
 * your positions P from `sample-positions.ts`:
 *
 *   1. clear the hash, search P to `--depth` → best move m, the PV's reply r1;
 *      a quick MultiPV-2 look at Q = P+m gives a reply off the PV, r2.
 *   2. warm: search P+m+r1, then P+m+r2, to `--depth` (hash kept — what the
 *      worker's follow-up chaining does).
 *   3. cold: clear, search P+m+r1; clear, search P+m+r2.
 *
 * Reports when each depth completed, warm vs cold, and the median speedup.
 *
 *   SF_PATH=… node hash-test.mjs positions.json [--depth 45] [--limit 4]
 *     [--cap-seconds 600] [--out hash-test.json]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { applyMove } from "@boardgames/core/games/chess/engine/apply";
import { parseFen, toFen } from "@boardgames/core/games/chess/engine/fen";
import { legalMoves } from "@boardgames/core/games/chess/engine/movegen";
import { moveToUci } from "@boardgames/core/games/chess/engine/uci";
import { z } from "zod";
import { finalLines, type SearchResult, UciEngine } from "./uci.ts";

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? fallback) : fallback;
};
const log = (...a: unknown[]) => console.error(new Date().toISOString(), ...a);

const InputSchema = z.object({
  positions: z.array(
    z.object({ fen: z.string(), kind: z.enum(["user", "opp"]), tier: z.string(), ply: z.number() }),
  ),
});

interface Row {
  readonly fen: string;
  readonly tier: string;
  readonly ply: number;
  readonly best: string;
  readonly parentSeconds: number;
  readonly replies: readonly {
    readonly uci: string;
    readonly onPv: boolean;
    readonly warm: Record<number, number> | undefined;
    readonly cold: Record<number, number> | undefined;
  }[];
}

const median = (xs: number[]) => {
  const s = [...xs].filter(Number.isFinite).sort((a, b) => a - b);
  if (s.length === 0) return Number.NaN;
  const m = s.length >> 1;
  return s.length % 2 ? (s[m] as number) : ((s[m - 1] as number) + (s[m] as number)) / 2;
};

function play(fen: string, uci: string): string {
  const pos = parseFen(fen);
  const move = legalMoves(pos).find((m) => moveToUci(m) === uci);
  if (!move) throw new Error(`${uci} is not legal in ${fen}`);
  return toFen(applyMove(pos, move));
}

/** Seconds at which each depth completed. */
function curve(r: SearchResult): Record<number, number> {
  const out: Record<number, number> = {};
  for (const i of r.infos) if (i.multipv === 1 && i.timeMs !== null) out[i.depth] = i.timeMs / 1000;
  return out;
}

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error("usage: hash-test.mjs positions.json [--depth 45] [--limit 4]");
  const depth = Number(arg("depth", "45"));
  const limit = Number(arg("limit", "4"));
  const capMs = Number(arg("cap-seconds", "600")) * 1000;
  const out = arg("out", "hash-test.json");
  const input = InputSchema.parse(JSON.parse(readFileSync(file, "utf8")));
  // Positions with games through them (the ones that have follow-ups), past the first moves.
  const sample = input.positions
    .filter((p) => p.kind === "user" && (p.tier === "trunk" || p.tier === "main") && p.ply >= 4)
    .slice(0, limit);

  const threads = Number(process.env.SF_THREADS ?? Math.max(1, availableParallelism() - 2));
  const sf = new UciEngine(process.env.SF_PATH ?? "stockfish", [], () => {});
  await sf.init({ Threads: threads, Hash: Number(process.env.SF_HASH_MB ?? 16384), MultiPV: 1 });
  const clear = async () => {
    sf.send("ucinewgame");
    await sf.ready();
  };
  const go = `depth ${depth} movetime ${capMs}`;
  const search = (fen: string) => sf.search(fen, go, { timeoutMs: capMs + 120_000 });
  log(
    `${sample.length} positions, depth ${depth}, ${threads} threads, hash ${process.env.SF_HASH_MB ?? 16384} MB`,
  );

  const rows: Row[] = [];
  for (const [i, p] of sample.entries()) {
    await clear();
    const parent = await search(p.fen);
    const line = finalLines(parent.infos)[0];
    const best = line?.pv[0];
    if (!line || !best) continue;
    const q = play(p.fen, best);
    const r1 = line.pv[1] ?? null;
    sf.setOption("MultiPV", 2);
    const quick = finalLines((await sf.search(q, "depth 14", { timeoutMs: 60_000 })).infos);
    sf.setOption("MultiPV", 1);
    const r2 = quick.map((l) => l.pv[0]).find((u) => u && u !== r1) ?? null;
    const replies = [r1, r2].filter((r): r is string => r !== null);

    const warm: Record<string, Record<number, number>> = {};
    for (const r of replies) warm[r] = curve(await search(play(q, r)));
    const cold: Record<string, Record<number, number>> = {};
    for (const r of replies) {
      await clear();
      cold[r] = curve(await search(play(q, r)));
    }
    const row: Row = {
      fen: p.fen,
      tier: p.tier,
      ply: p.ply,
      best,
      parentSeconds: parent.ms / 1000,
      replies: replies.map((r, k) => ({
        uci: r,
        onPv: k === 0 && r === r1,
        warm: warm[r],
        cold: cold[r],
      })),
    };
    rows.push(row);
    for (const r of row.replies) {
      const reached = Math.min(
        Math.max(...Object.keys(r.warm ?? {}).map(Number)),
        Math.max(...Object.keys(r.cold ?? {}).map(Number)),
      );
      const w = r.warm?.[reached] ?? Number.NaN;
      const c = r.cold?.[reached] ?? Number.NaN;
      log(
        `${i + 1}/${sample.length} ${p.tier} ply ${p.ply} ${best} → ${r.uci}${r.onPv ? " (PV)" : ""}: ` +
          `d${reached} warm ${w.toFixed(0)} s, cold ${c.toFixed(0)} s (${(c / w).toFixed(2)}×)`,
      );
    }
  }
  sf.quit();

  const speedups = (onPv: boolean, d: number) =>
    median(
      rows.flatMap((row) =>
        row.replies
          .filter((r) => r.onPv === onPv)
          .map((r) => (r.cold?.[d] ?? Number.NaN) / (r.warm?.[d] ?? Number.NaN)),
      ),
    );
  const depths = [30, 35, 40, 45, 50].filter((d) => d <= depth);
  const summary = Object.fromEntries(
    depths.map((d) => [d, { pvReply: speedups(true, d), otherReply: speedups(false, d) }]),
  );
  writeFileSync(out, JSON.stringify({ depth, threads, summary, rows }, null, 2));
  for (const d of depths) {
    const s = summary[d];
    log(
      `d${d}: warm hash is ${s?.pvReply.toFixed(2)}× faster after the PV reply, ` +
        `${s?.otherReply.toFixed(2)}× after another reply (median)`,
    );
  }
}

main().catch((err) => {
  log("fatal:", err);
  process.exit(1);
});
