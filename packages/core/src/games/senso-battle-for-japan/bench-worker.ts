// Forked by bench.ts: plays a contiguous block of game indices and posts one
// message per game. Runs under `tsx` (dev) — this file is never bundled.
import { configureSearch, DEFAULT_SEARCH } from "./ai-search";
import { registerStrategy, searchStrategy } from "./ai-strategies";
import { configureTenka, DEFAULT_TENKA, tenkaStrategy } from "./mcts";
import { seatPattern, simulateGameDetailed } from "./tournament-runner";
import type { AIStrategyId } from "./types";

interface Job {
  a: AIStrategyId;
  b: AIStrategyId;
  players: number;
  indices: number[];
  budgetMs: number;
  /** Search options applied to the LIVE strategies (`prev` keeps the defaults). */
  cfg?: Record<string, unknown>;
  /** Tenka options applied to the live `tenka` (`tenka-prev` keeps the defaults). */
  tenka?: Record<string, unknown>;
}

const job = JSON.parse(process.argv[2] ?? "{}") as Job;

// Snapshot the committed defaults as the `prev` benchmark opponent first.
const PREV = { ...DEFAULT_SEARCH, weights: { ...DEFAULT_SEARCH.weights } };
registerStrategy(searchStrategy("prev" as AIStrategyId, () => PREV));
if (job.cfg) configureSearch(job.cfg as Parameters<typeof configureSearch>[0]);
const TENKA_PREV = { ...DEFAULT_TENKA };
registerStrategy(tenkaStrategy("tenka-prev" as AIStrategyId, () => TENKA_PREV));
if (job.tenka) configureTenka(job.tenka as Parameters<typeof configureTenka>[0]);

function send(msg: unknown): void {
  try {
    process.send?.(msg);
  } catch {
    process.exit(0);
  }
}

for (const i of job.indices) {
  const seats = seatPattern(job.a, job.b, job.players, i);
  const t0 = performance.now();
  const game = simulateGameDetailed(seats, i, {
    budget: job.budgetMs > 0 ? { timeMs: job.budgetMs } : undefined,
    keepSamples: true,
  });
  send({
    kind: "game",
    i,
    seats,
    winner: game.winner,
    winnerStrategy: game.winner < 0 ? null : seats[game.winner],
    scores: game.scores,
    decisions: game.decisions,
    ms: game.ms,
    wallMs: performance.now() - t0,
  });
}
send({ kind: "done" });
