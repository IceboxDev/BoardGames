// The Hunger's AI bench. Deals are seeded by index; `--offset 1000000` is the
// holdout range, never used while tuning.
//
// Layouts (per table size N):
//   1vN  one candidate, N−1 baselines; the chair rotates with the deal. Each
//        deal is PAIRED with the all-baseline game on the same cards: Δ = what
//        the candidate won in that chair minus what the baseline won there.
//   Nv1  N−1 candidates, one baseline — the lone baseline should win < 1/N.
//   h2h  two seats, every deal played in both seat orders.
//
// All-baseline games are cached under scratch/bench/hunger/cache, keyed by
// the baseline spec, table, mode and a hash of the engine + baseline code, so
// a deterministic baseline (fixed rollout count) is only ever played once.
//
//   pnpm --filter @boardgames/core bench:hunger -- dracula strigoi --tables 2,4,6 \
//     --deals 200 [--layout 1vN|Nv1|h2h] [--offset K] [--mode elder|rookie] \
//     [--workers N] [--out file.json]
// Specs take options: `strigoi:rollouts=384`.
import { fork } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { BenchJob, DealResult, GameOutcome, Layout } from "./bench-worker";
import type { Mode } from "./types";

interface Args {
  candidate: string;
  baseline: string;
  tables: number[];
  deals: number;
  offset: number;
  mode: Mode;
  layout: Layout;
  workers: number;
  out?: string;
}

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "../../../../..");
const CACHE_DIR = join(REPO, "scratch/bench/hunger/cache");

function parseArgs(argv: string[]): Args {
  const pos = argv.filter((a, i) => !a.startsWith("--") && !argv[i - 1]?.startsWith("--"));
  const flag = (name: string) => {
    const i = argv.indexOf(`--${name}`);
    return i === -1 ? undefined : argv[i + 1];
  };
  const layout = (flag("layout") ?? "1vN") as Layout;
  return {
    candidate: pos[0] ?? "strigoi",
    baseline: pos[1] ?? "heuristic-v1",
    tables: layout === "h2h" ? [2] : (flag("tables") ?? "2,4").split(",").map(Number),
    deals: Number(flag("deals") ?? 60),
    offset: Number(flag("offset") ?? 0),
    mode: flag("mode") === "rookie" ? "rookie" : "elder",
    layout,
    workers: Number(flag("workers") ?? Math.max(1, availableParallelism() - 1)),
    out: flag("out"),
  };
}

/**
 * The engine and the baseline bots' code — an explicit list, so candidate-side
 * work (features, nets, Dracula) never invalidates the cached baseline games.
 */
const BASELINE_CODE = [
  "types.ts",
  "game-engine.ts",
  "rules.ts",
  "scoring.ts",
  "board.ts",
  "rulings.ts",
  "ai-heuristic.ts",
  "tournament-runner.ts",
  "search/clone.ts",
  "search/determinize.ts",
  "search/rollout.ts",
  "search/strigoi.ts",
];

function engineHash(): string {
  const h = createHash("sha1");
  const files = [...BASELINE_CODE];
  for (const dir of ["content", "content/boards"]) {
    for (const f of readdirSync(join(HERE, dir)).sort()) {
      if (/\.(ts|json)$/.test(f) && !f.endsWith(".test.ts")) files.push(`${dir}/${f}`);
    }
  }
  for (const f of files) h.update(f).update(readFileSync(join(HERE, f)));
  return h.digest("hex").slice(0, 12);
}

type Cache = Record<number, GameOutcome>;
function cachePath(args: Args, players: number): string {
  const key = `${args.baseline}|${players}|${args.mode}|${engineHash()}`;
  return join(CACHE_DIR, `${createHash("sha1").update(key).digest("hex").slice(0, 16)}.json`);
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
function se(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1) / xs.length);
}
function wilson(p: number, n: number): [number, number] {
  if (n === 0) return [0, 1];
  const z = 1.96;
  const d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d;
  const h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [c - h, c + h];
}
const pct = (x: number) => `${(100 * x).toFixed(1)}%`;
const winOf = (o: GameOutcome, seat: number) =>
  o.winners.includes(seat) ? 1 / o.winners.length : 0;

async function runTable(args: Args, players: number, cache: Cache): Promise<DealResult[]> {
  const workerPath = join(HERE, "bench-worker.ts");
  const deals = Array.from({ length: args.deals }, (_, i) => i + args.offset);
  const n = Math.min(args.workers, deals.length);
  const blocks: number[][] = Array.from({ length: n }, () => []);
  for (let i = 0; i < deals.length; i++) blocks[i % n].push(deals[i]);
  const results: DealResult[] = [];
  let done = 0;
  await Promise.all(
    blocks.map(
      (block) =>
        new Promise<void>((resolve, reject) => {
          const job: BenchJob = {
            candidate: args.candidate,
            baseline: args.baseline,
            players,
            layout: args.layout,
            deals: block,
            mode: args.mode,
            cached: block.filter((d) => cache[d] !== undefined),
          };
          const child = fork(workerPath, [JSON.stringify(job)], { execArgv: ["--import", "tsx"] });
          child.on("message", (m: unknown) => {
            const r = m as DealResult;
            if (r.baseline) cache[r.deal] = r.baseline;
            results.push(r);
            done++;
            if (done % 10 === 0) process.stderr.write(`  ${players}p ${done}/${deals.length}\n`);
          });
          child.on("exit", (code) =>
            code === 0 ? resolve() : reject(new Error(`worker ${code}`)),
          );
        }),
    ),
  );
  return results.sort((a, b) => a.deal - b.deal);
}

function report(args: Args, players: number, rs: DealResult[], cache: Cache) {
  const ms = rs.flatMap((r) => r.games.flatMap((g) => g.candidateMs)).sort((a, b) => a - b);
  const msMean = mean(ms);
  const msP95 = ms[Math.floor(ms.length * 0.95)] ?? 0;
  const head = `${players}p ${args.layout}  ${args.candidate} vs ${args.baseline} (${args.mode}, ${rs.length} deals)`;
  if (args.layout === "h2h") {
    const w = rs.map((r) =>
      mean(r.games.map((g) => winOf(g.outcome, g.seats.indexOf(args.candidate)))),
    );
    const [lo, hi] = wilson(mean(w), 2 * rs.length);
    const data = {
      players,
      layout: args.layout,
      deals: rs.length,
      winRate: mean(w),
      winCI: [lo, hi],
      msMean,
      msP95,
    };
    const line = `${head}\n  candidate wins ${pct(mean(w))} [${pct(lo)}, ${pct(hi)}]  ms ${msMean.toFixed(0)} p95 ${msP95.toFixed(0)}`;
    return { data, line };
  }
  const focusWins: number[] = [];
  const baseWins: number[] = [];
  const dScore: number[] = [];
  const survived: number[] = [];
  const baseSurvived: number[] = [];
  for (const r of rs) {
    const seat = r.deal % players;
    const g = r.games[0].outcome;
    const b = cache[r.deal];
    focusWins.push(winOf(g, seat));
    baseWins.push(winOf(b, seat));
    dScore.push((g.scores[seat] ?? 0) - (b.scores[seat] ?? 0));
    survived.push(g.burnt[seat] ? 0 : 1);
    baseSurvived.push(b.burnt[seat] ? 0 : 1);
  }
  const d = focusWins.map((x, i) => x - baseWins[i]);
  const [lo, hi] = wilson(mean(focusWins), rs.length);
  const data = {
    players,
    layout: args.layout,
    deals: rs.length,
    /** 1vN: the candidate's win rate. Nv1: the lone baseline's. */
    focusWinRate: mean(focusWins),
    focusWinCI: [lo, hi],
    sameChairBaseline: mean(baseWins),
    pairedWinDelta: mean(d),
    pairedWinSE: se(d),
    pairedScoreDelta: mean(dScore),
    pairedScoreSE: se(dScore),
    survival: mean(survived),
    baselineSurvival: mean(baseSurvived),
    msMean,
    msP95,
  };
  const who = args.layout === "1vN" ? "candidate" : "lone baseline";
  const line =
    `${head}\n  ${who} wins ${pct(data.focusWinRate)} [${pct(lo)}, ${pct(hi)}]  same chair all-baseline ${pct(data.sameChairBaseline)}  (fair ${pct(1 / players)})\n` +
    `  paired Δwin ${pct(data.pairedWinDelta)} ± ${pct(data.pairedWinSE)}   Δscore ${data.pairedScoreDelta.toFixed(2)} ± ${data.pairedScoreSE.toFixed(2)}\n` +
    `  survival ${pct(data.survival)} (all-baseline ${pct(data.baselineSurvival)})   candidate ms mean ${msMean.toFixed(0)} p95 ${msP95.toFixed(0)}`;
  return { data, line };
}

const args = parseArgs(process.argv.slice(2));
mkdirSync(CACHE_DIR, { recursive: true });
const out: unknown[] = [];
const t0 = Date.now();
for (const players of args.tables) {
  const path = cachePath(args, players);
  const cache: Cache = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
  const rs = await runTable(args, players, cache);
  if (args.layout !== "h2h") writeFileSync(path, JSON.stringify(cache));
  const { data, line } = report(args, players, rs, cache);
  out.push(data);
  console.log(line);
}
console.log(`total ${((Date.now() - t0) / 1000).toFixed(0)}s`);
if (args.out) {
  mkdirSync(dirname(args.out), { recursive: true });
  writeFileSync(args.out, JSON.stringify({ args, results: out }, null, 2));
}
