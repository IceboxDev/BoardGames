/**
 * Phase 0 on the farm machine: time Stockfish (and Lc0) on real tree
 * positions from `sample-positions.ts`, check how many are already known to
 * lichess / ChessDB, and fit BEST_MOVE's tier depths to the budget.
 *
 *   SF_PATH=… [LC0_PATH=… LC0_WEIGHTS=…] tsx src/scripts/chess-farm/calibrate.ts \
 *     positions.json --out calibration.json --policy policy.json \
 *     [--max-depth 50] [--cap-seconds 360] [--budget-hours 90] [--scale 2.4] [--limit 30]
 *
 * One search per position to `--max-depth` (or the time cap) records the
 * nodes and seconds at which every depth completed — a whole nodes-to-depth
 * curve per position. Medians across positions feed the allocator.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { parseFen } from "@boardgames/core/games/chess/engine/fen";
import { legalMoves } from "@boardgames/core/games/chess/engine/movegen";
import { moveToUci } from "@boardgames/core/games/chess/engine/uci";
import {
  allocateDepths,
  BEST_MOVE,
  type Calibration,
  candidates,
  projectSeconds,
} from "@boardgames/core/games/chess/trainer/eval-policy";
import { z } from "zod";
import { chessdbMoves, lichessCloud } from "./lookups.ts";
import { defaultPolicy } from "./pipeline.ts";
import { parseLc0MoveStat, UciEngine } from "./uci.ts";

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? fallback) : fallback;
};
const log = (...a: unknown[]) => console.error(new Date().toISOString(), ...a);

const InputSchema = z.object({
  games: z.object({ w: z.number(), b: z.number() }),
  workload: z.object({
    user: z.object({ trunk: z.number(), main: z.number(), rare: z.number(), leaf: z.number() }),
    opp: z.number(),
  }),
  positions: z.array(
    z.object({
      fen: z.string(),
      kind: z.enum(["user", "opp"]),
      reach: z.number(),
      tier: z.string(),
      ply: z.number(),
    }),
  ),
});

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  if (s.length === 0) return Number.NaN;
  const m = s.length >> 1;
  return s.length % 2 ? (s[m] as number) : ((s[m - 1] as number) + (s[m] as number)) / 2;
};

async function main() {
  const input = InputSchema.parse(JSON.parse(readFileSync(process.argv[2] ?? "", "utf8")));
  const maxDepth = Number(arg("max-depth", "50"));
  const capSeconds = Number(arg("cap-seconds", "360"));
  const budgetHours = Number(arg("budget-hours", "90"));
  const scale = Number(arg("scale", "1"));
  const limit = Number(arg("limit", "30"));
  const threads = Number(process.env.SF_THREADS ?? Math.max(1, availableParallelism() - 2));

  const sf = new UciEngine(process.env.SF_PATH ?? "", [], log);
  await sf.init({ Threads: threads, Hash: Number(process.env.SF_HASH_MB ?? 16384), MultiPV: 1 });

  // 1. Raw speed: 20 s on the start position.
  const speed = await sf.search(
    "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    "movetime 20000",
    {
      timeoutMs: 60_000,
    },
  );
  const nps = Math.max(...speed.infos.map((i) => i.nps ?? 0));
  log(`nps ${(nps / 1e6).toFixed(1)} M with ${threads} threads`);

  // 2. Nodes-to-depth on user positions (one search each, fresh hash).
  const userSample = input.positions.filter((p) => p.kind === "user").slice(0, limit);
  const curves: {
    fen: string;
    tier: string;
    ply: number;
    depths: Record<number, { nodes: number; ms: number }>;
  }[] = [];
  for (const [i, p] of userSample.entries()) {
    sf.send("ucinewgame");
    await sf.ready();
    const depths: Record<number, { nodes: number; ms: number }> = {};
    const r = await sf.search(p.fen, `depth ${maxDepth} movetime ${capSeconds * 1000}`, {
      timeoutMs: (capSeconds + 120) * 1000,
      onInfo: (info) => {
        if (info.multipv === 1 && info.nodes !== null && info.timeMs !== null) {
          depths[info.depth] = { nodes: info.nodes, ms: info.timeMs };
        }
      },
    });
    const reached = Math.max(...Object.keys(depths).map(Number));
    curves.push({ fen: p.fen, tier: p.tier, ply: p.ply, depths });
    log(
      `${i + 1}/${userSample.length} ${p.tier} ply ${p.ply}: depth ${reached} in ${(r.ms / 1000).toFixed(0)} s`,
    );
  }
  const nodesToDepth: Record<number, number> = {};
  const secondsToDepth: Record<number, number> = {};
  const reachedBy: Record<number, number> = {};
  for (let d = 20; d <= maxDepth; d++) {
    const have = curves
      .map((c) => c.depths[d])
      .filter((x): x is { nodes: number; ms: number } => !!x);
    reachedBy[d] = have.length;
    // Only depths most positions reached give an honest median.
    if (have.length >= Math.ceil(curves.length * 0.6)) {
      nodesToDepth[d] = median(have.map((x) => x.nodes));
      secondsToDepth[d] = median(have.map((x) => x.ms / 1000));
    }
  }

  // 3. MultiPV 3 cost at the opponent depth (shallower, on a few opponent positions).
  const oppSample = input.positions.filter((p) => p.kind === "opp").slice(0, 6);
  const ratios: number[] = [];
  const oppProbe = Math.min(36, maxDepth);
  for (const p of oppSample) {
    const nodesTo = async (multipv: number) => {
      sf.send("ucinewgame");
      sf.setOption("MultiPV", multipv);
      await sf.ready();
      let nodes = 0;
      await sf.search(p.fen, `depth ${oppProbe} movetime ${capSeconds * 1000}`, {
        timeoutMs: (capSeconds + 120) * 1000,
        onInfo: (i) => {
          if (i.nodes !== null) nodes = i.nodes;
        },
      });
      sf.setOption("MultiPV", 1);
      return nodes;
    };
    const one = await nodesTo(1);
    const three = await nodesTo(3);
    if (one > 0) ratios.push(three / one);
    log(`opp ply ${p.ply}: MultiPV 3 = ${(three / Math.max(1, one)).toFixed(2)}× single`);
  }
  const multipv3Factor = ratios.length > 0 ? median(ratios) : 2.5;

  // 4. Already known elsewhere, and how many candidates ChessDB names.
  let cloudDeep = 0;
  let cloudAny = 0;
  let cdbKnown = 0;
  const candCounts: number[] = [];
  for (const p of input.positions) {
    const legal = new Set(legalMoves(parseFen(p.fen)).map(moveToUci));
    const cloud = await lichessCloud(p.fen, 1, legal);
    if (cloud?.[0]) {
      cloudAny++;
      if (cloud[0].depth >= (p.kind === "opp" ? BEST_MOVE.opp.depth : 45)) cloudDeep++;
    }
    const cdb = await chessdbMoves(p.fen, legal);
    if (cdb && cdb.length > 0) {
      cdbKnown++;
      if (p.kind === "user") {
        candCounts.push(
          candidates(cdb.map((m) => ({ uci: m.uci, cp: m.score, mate: null }))).length,
        );
      }
    }
  }
  // Extra full-depth searches per position, capped like the pipeline's.
  const extra = candCounts.map((n) => Math.min(Math.max(0, n - 1), defaultPolicy().maxCandidates));
  const candidateFactor = extra.length > 0 ? extra.reduce((a, b) => a + b, 0) / extra.length : 1;
  candCounts.length > 0 ? candCounts.reduce((a, b) => a + b, 0) / candCounts.length - 1 : 0.5;

  // 5. Lc0 on the GPU, if configured.
  let lc0: { nodes: number; seconds: number; nps: number } | null = null;
  if (process.env.LC0_PATH && process.env.LC0_WEIGHTS) {
    const engine = new UciEngine(
      process.env.LC0_PATH,
      [
        `--weights=${process.env.LC0_WEIGHTS}`,
        `--backend=${process.env.LC0_BACKEND ?? "cuda-fp16"}`,
      ],
      log,
    );
    await engine.init({ VerboseMoveStats: true, UCI_ShowWDL: true, Threads: 2 });
    const fen = userSample[0]?.fen ?? "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    const r = await engine.search(fen, `nodes ${BEST_MOVE.lc0Nodes}`, { timeoutMs: 3600_000 });
    const stats = r.strings.map(parseLc0MoveStat).filter(Boolean);
    lc0 = {
      nodes: BEST_MOVE.lc0Nodes,
      seconds: r.ms / 1000,
      nps: BEST_MOVE.lc0Nodes / (r.ms / 1000),
    };
    log(
      `lc0 ${BEST_MOVE.lc0Nodes} nodes in ${(r.ms / 1000).toFixed(1)} s; ${stats.length} root moves parsed`,
    );
    engine.quit();
  }
  sf.quit();

  // 6. Fit the tiers. Lookups remove the positions lichess already holds deep.
  const known = cloudDeep / Math.max(1, input.positions.length);
  const work = {
    user: Object.fromEntries(
      Object.entries(input.workload.user).map(([k, n]) => [k, Math.round(n * scale * (1 - known))]),
    ) as { trunk: number; main: number; rare: number; leaf: number },
    opp: Math.round(input.workload.opp * scale * (1 - known)),
  };
  const cal: Calibration = { nps, nodesToDepth, multipv3Factor, candidateFactor };
  const fullSpec = projectSeconds(cal, work, BEST_MOVE.tiers, BEST_MOVE.opp.depth);
  const plan = allocateDepths(cal, work, budgetHours * 3600);

  const report = {
    measuredAt: new Date().toISOString(),
    engine: process.env.SF_PATH,
    threads,
    nps,
    nodesToDepth,
    secondsToDepth,
    reachedBy,
    multipv3Factor,
    candidateFactor,
    coverage: {
      positions: input.positions.length,
      lichessCloudAny: cloudAny,
      lichessCloudDeep: cloudDeep,
      chessdbKnown: cdbKnown,
    },
    lc0,
    workload: work,
    hoursAtSpecDepths: Math.round((fullSpec / 3600) * 10) / 10,
    plan: { ...plan, hours: Math.round((plan.seconds / 3600) * 10) / 10 },
    curves,
  };
  writeFileSync(arg("out", "calibration.json"), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(
    arg("policy", "policy.json"),
    `${JSON.stringify({ tiers: plan.tiers, oppDepth: plan.oppDepth, nps, nodesToDepth, capFactor: 1.5 }, null, 2)}\n`,
  );
  log(
    `spec depths would take ${report.hoursAtSpecDepths} h; fitted: ${plan.tiers
      .map((t) => `${t.name} d${t.depth}`)
      .join(", ")}, opp d${plan.oppDepth} → ${report.plan.hours} h`,
  );
}

main().catch((err) => {
  log("fatal:", err);
  process.exit(1);
});
