// Forked by bench.ts: plays a contiguous block of game indices and posts one
// message per game. Runs under `tsx` (dev) — this file is never bundled.
import { configureSearch, DEFAULT_SEARCH } from "./ai-search";
import { HEURISTIC_V1, RANDOM, registerStrategy, SHOGUN, searchStrategy } from "./ai-strategies";
import { configureKami, configureTenka, DEFAULT_KAMI, DEFAULT_TENKA, tenkaStrategy } from "./mcts";
import { seatPattern, seedForGame, simulateGameDetailed } from "./tournament-runner";
import type { AIStrategy, AIStrategyId } from "./types";

interface Job {
  a: AIStrategyId;
  b: AIStrategyId;
  players: number;
  indices: number[];
  budgetMs: number;
  /** Games 2k and 2k+1 replay the same deal with the seats swapped. */
  mirror: boolean;
  /** Search options applied to the LIVE strategies (`prev` keeps the defaults). */
  cfg?: Record<string, unknown>;
  /** Tenka options applied to the live `tenka` (`tenka-prev` keeps the defaults). */
  tenka?: Record<string, unknown>;
  /** Options applied to the `tenka-prev` snapshot (a shared baseline for both arms). */
  tenkaPrev?: Record<string, unknown>;
  /** Kami options applied to the live `kami` (`kami-prev` keeps the defaults). */
  kami?: Record<string, unknown>;
}

const job = JSON.parse(process.argv[2] ?? "{}") as Job;

// Snapshot the committed defaults as the `prev` benchmark opponent first.
const PREV = { ...DEFAULT_SEARCH, weights: { ...DEFAULT_SEARCH.weights } };
registerStrategy(searchStrategy("prev" as AIStrategyId, () => PREV));
if (job.cfg) configureSearch(job.cfg as Parameters<typeof configureSearch>[0]);
const TENKA_PREV = { ...DEFAULT_TENKA, ...(job.tenkaPrev ?? {}) };
registerStrategy(tenkaStrategy("tenka-prev" as AIStrategyId, () => TENKA_PREV));
if (job.tenka) configureTenka(job.tenka as Parameters<typeof configureTenka>[0]);
const KAMI_PREV = { ...DEFAULT_KAMI };
registerStrategy(tenkaStrategy("kami-prev" as AIStrategyId, () => KAMI_PREV));
if (job.kami) configureKami(job.kami as Parameters<typeof configureKami>[0]);

// Phase hybrids — which phase does an engine earn its strength in? `tricks`
// plays the trick phase, `rest` the rewards and bonus phases. Bench-only ids.
function phaseHybrid(id: string, tricks: AIStrategy, rest: AIStrategy): AIStrategy {
  return {
    id: id as AIStrategyId,
    pickAction(state, legal, seat, budget) {
      const engine = state.phase === "trick" ? tricks : rest;
      return engine.pickAction(state, legal, seat, budget);
    },
  };
}
registerStrategy(phaseHybrid("random-tricks", RANDOM, SHOGUN));
registerStrategy(phaseHybrid("daimyo-tricks", HEURISTIC_V1, SHOGUN));
registerStrategy(phaseHybrid("greedy-rewards", SHOGUN, HEURISTIC_V1));
registerStrategy(
  phaseHybrid(
    "tenka-tricks-greedy-rewards",
    tenkaStrategy("tenka-tg" as AIStrategyId, () => DEFAULT_TENKA),
    HEURISTIC_V1,
  ),
);

function send(msg: unknown): void {
  try {
    process.send?.(msg);
  } catch {
    process.exit(0);
  }
}

for (const i of job.indices) {
  // seatPattern already alternates A,B,… / B,A,… by parity, so the pair (2k, 2k+1)
  // sits each engine in the other's chairs; mirroring gives both the same deal.
  const seats = seatPattern(job.a, job.b, job.players, i);
  const t0 = performance.now();
  const game = simulateGameDetailed(seats, i, {
    budget: job.budgetMs > 0 ? { timeMs: job.budgetMs } : undefined,
    keepSamples: true,
    seed: job.mirror ? seedForGame(i >> 1) : undefined,
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
