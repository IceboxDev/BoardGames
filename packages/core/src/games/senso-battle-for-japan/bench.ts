// Local, zero-server strength benchmark — the acceptance tool for AI work.
//
//   pnpm --filter @boardgames/core bench -- <A> <B> [--budget-ms 100] [--workers N]
//        [--protocol quick|full|2p|3p|5p] [--games N] [--cfg '{"determinizations":48}'] [--tenka '{"solvePlies":8}'] [--out scratch/bench]
//
// Seats alternate A,B,A,B… / B,A,B,A… per game so both strategies hold every
// seat equally often; seeds are a pure function of the game index, so an
// iteration-capped run (--budget-ms 0) is bit-reproducible. Reports win rates
// with Wilson 95 % intervals, seat fairness, seat share (3p+), mean score
// delta and per-decision latency, and writes JSON under scratch/bench/.
import { execSync, fork } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

interface Args {
  a: string;
  b: string;
  budgetMs: number;
  workers: number;
  protocol: string;
  games: number | null;
  cfg?: Record<string, unknown>;
  tenka?: Record<string, unknown>;
  out: string;
}

interface GameMsg {
  kind: "game";
  i: number;
  seats: string[];
  winner: number;
  winnerStrategy: string | null;
  scores: number[];
  decisions: number;
  ms: Record<
    string,
    { n: number; sum: number; max: number; samples: number[]; iterations: number }
  >;
  wallMs: number;
}

interface Table {
  players: number;
  games: number;
}

const PROTOCOLS: Record<string, Table[]> = {
  full: [
    { players: 2, games: 400 },
    { players: 3, games: 200 },
    { players: 5, games: 120 },
  ],
  quick: [
    { players: 2, games: 40 },
    { players: 3, games: 20 },
    { players: 5, games: 12 },
  ],
  "2p": [{ players: 2, games: 400 }],
  "3p": [{ players: 3, games: 200 }],
  "5p": [{ players: 5, games: 120 }],
};

function parseArgs(argv: string[]): Args {
  const positional: string[] = [];
  const args: Args = {
    a: "",
    b: "",
    budgetMs: 100,
    workers: Math.max(1, availableParallelism() - 1),
    protocol: "quick",
    games: null,
    out: "scratch/bench",
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => argv[++i] ?? "";
    if (arg === "--") continue; // pnpm forwards the separator itself
    if (arg === "--budget-ms") args.budgetMs = Number(next());
    else if (arg === "--workers") args.workers = Number(next());
    else if (arg === "--protocol") args.protocol = next();
    else if (arg === "--games") args.games = Number(next());
    else if (arg === "--cfg") args.cfg = JSON.parse(next());
    else if (arg === "--tenka") args.tenka = JSON.parse(next());
    else if (arg === "--out") args.out = next();
    else positional.push(arg);
  }
  args.a = positional[0] ?? "shogun";
  args.b = positional[1] ?? "heuristic-v1";
  if (!PROTOCOLS[args.protocol]) throw new Error(`unknown protocol ${args.protocol}`);
  return args;
}

function wilson(k: number, n: number, z = 1.96): [number, number] {
  if (n === 0) return [0, 0];
  const p = k / n;
  const denom = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return [Math.max(0, centre - half), Math.min(1, centre + half)];
}

function percentile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
  return sorted[idx];
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const REPO_ROOT = fileURLToPath(new URL("../../../../..", import.meta.url));

async function runTable(args: Args, table: Table): Promise<Record<string, unknown>> {
  const games = args.games ?? table.games;
  const workers = Math.max(1, Math.min(args.workers, games));
  const blocks: number[][] = Array.from({ length: workers }, () => []);
  for (let i = 0; i < games; i++) blocks[i % workers].push(i);

  const wins: Record<string, number> = { [args.a]: 0, [args.b]: 0 };
  let draws = 0;
  let finished = 0;
  let scoreDelta = 0;
  // Seat-parity fairness: A's wins on even (A leads) vs odd game indices.
  const parity = { even: { games: 0, wins: 0 }, odd: { games: 0, wins: 0 } };
  let seatShareA = 0;
  const samples: Record<string, number[]> = {};
  const work: Record<string, { n: number; iterations: number }> = {};
  const t0 = performance.now();
  let etaPrinted = false;
  const workerPath = fileURLToPath(new URL("./bench-worker.ts", import.meta.url));

  await Promise.all(
    blocks.map(
      (indices) =>
        new Promise<void>((resolve, reject) => {
          if (indices.length === 0) return resolve();
          const child = fork(
            workerPath,
            [
              JSON.stringify({
                a: args.a,
                b: args.b,
                players: table.players,
                indices,
                budgetMs: args.budgetMs,
                cfg: args.cfg,
                tenka: args.tenka,
              }),
            ],
            {
              execArgv: ["--import", "tsx"],
              serialization: "advanced",
              stdio: ["ignore", "inherit", "inherit", "ipc"],
            },
          );
          child.on("message", (raw: unknown) => {
            const msg = raw as GameMsg | { kind: "done" };
            if (msg.kind === "done") return;
            finished++;
            const aSeats = msg.seats.filter((s) => s === args.a).length;
            seatShareA += aSeats / msg.seats.length;
            if (msg.winnerStrategy === null) draws++;
            else wins[msg.winnerStrategy] = (wins[msg.winnerStrategy] ?? 0) + 1;
            const par = msg.i % 2 === 0 ? parity.even : parity.odd;
            par.games++;
            if (msg.winnerStrategy === args.a) par.wins++;
            const aScores = msg.scores.filter((_, s) => msg.seats[s] === args.a);
            const bScores = msg.scores.filter((_, s) => msg.seats[s] === args.b);
            const mean = (xs: number[]) =>
              xs.length ? xs.reduce((x, y) => x + y, 0) / xs.length : 0;
            scoreDelta += mean(aScores) - mean(bScores);
            for (const [strategy, t] of Object.entries(msg.ms)) {
              const list = samples[strategy] ?? [];
              samples[strategy] = list;
              for (const s of t.samples) if (list.length < 20_000) list.push(s);
              const w = work[strategy] ?? { n: 0, iterations: 0 };
              work[strategy] = w;
              w.n += t.n;
              w.iterations += t.iterations;
            }
            if (!etaPrinted && finished >= Math.max(2, workers)) {
              etaPrinted = true;
              const perGame = (performance.now() - t0) / finished;
              process.stdout.write(
                `  ${table.players}p: ${finished}/${games} done, ETA ≈ ${Math.round(((games - finished) * perGame) / 1000)} s\n`,
              );
            }
          });
          child.on("error", reject);
          child.on("exit", (code) =>
            code === 0 ? resolve() : reject(new Error(`bench worker exited ${code}`)),
          );
        }),
    ),
  );

  const n = finished;
  const wA = wins[args.a] ?? 0;
  const wB = wins[args.b] ?? 0;
  const [loA, hiA] = wilson(wA, n);
  const [loB, hiB] = wilson(wB, n);
  const evenRate = parity.even.games ? parity.even.wins / parity.even.games : 0;
  const oddRate = parity.odd.games ? parity.odd.wins / parity.odd.games : 0;
  const parityGap = Math.abs(evenRate - oddRate);
  const paritySigma = Math.sqrt(
    0.25 / Math.max(1, parity.even.games) + 0.25 / Math.max(1, parity.odd.games),
  );
  const latency = (strategy: string) => {
    const sorted = [...(samples[strategy] ?? [])].sort((x, y) => x - y);
    return { p50: percentile(sorted, 0.5), p95: percentile(sorted, 0.95), n: sorted.length };
  };
  const wallMs = performance.now() - t0;
  const result = {
    players: table.players,
    games: n,
    a: {
      id: args.a,
      wins: wA,
      rate: wA / n,
      ci: [loA, hiA],
      latency: latency(args.a),
      work: work[args.a],
    },
    b: {
      id: args.b,
      wins: wB,
      rate: wB / n,
      ci: [loB, hiB],
      latency: latency(args.b),
      work: work[args.b],
    },
    draws,
    seatShareA: seatShareA / n,
    scoreDeltaA: scoreDelta / n,
    parity: {
      evenRate,
      oddRate,
      gap: parityGap,
      sigma: paritySigma,
      flagged: table.players === 2 && parityGap > 2 * paritySigma,
    },
    wallMs,
  };
  const share =
    table.players > 2 ? ` · A seat-share ${pct(result.seatShareA)} → win-share ${pct(wA / n)}` : "";
  console.log(
    `${table.players}p ${n} games: ${args.a} ${pct(wA / n)} [${pct(loA)}, ${pct(hiA)}] · ${args.b} ${pct(wB / n)} [${pct(loB)}, ${pct(hiB)}] · draws ${draws} · Δscore A−B ${result.scoreDeltaA.toFixed(2)}${share}`,
  );
  console.log(
    `    latency ms p50/p95: ${args.a} ${result.a.latency.p50.toFixed(1)}/${result.a.latency.p95.toFixed(1)} · ${args.b} ${result.b.latency.p50.toFixed(1)}/${result.b.latency.p95.toFixed(1)} · parity gap ${pct(parityGap)}${result.parity.flagged ? " ⚠ seat bias" : ""} · ${(wallMs / 1000).toFixed(0)} s wall`,
  );
  return result;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const tables = PROTOCOLS[args.protocol];
  console.log(
    `bench ${args.a} vs ${args.b} · protocol ${args.protocol} · budget ${args.budgetMs} ms · ${args.workers} workers${args.cfg ? ` · cfg ${JSON.stringify(args.cfg)}` : ""}${args.tenka ? ` · tenka ${JSON.stringify(args.tenka)}` : ""}`,
  );
  const perTable: Record<string, unknown>[] = [];
  for (const table of tables) perTable.push(await runTable(args, table));
  let git = "unknown";
  try {
    git = execSync("git rev-parse --short HEAD", { cwd: REPO_ROOT }).toString().trim();
  } catch {
    // not a git checkout
  }
  const outDir = join(REPO_ROOT, args.out);
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const file = join(
    outDir,
    `${new Date().toISOString().replace(/[:.]/g, "-")}-${args.a}-vs-${args.b}.json`,
  );
  writeFileSync(
    file,
    JSON.stringify(
      {
        a: args.a,
        b: args.b,
        protocol: args.protocol,
        budgetMs: args.budgetMs,
        cfg: args.cfg ?? null,
        tenka: args.tenka ?? null,
        node: process.version,
        git,
        perTable,
      },
      null,
      2,
    ),
  );
  console.log(`wrote ${file}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
