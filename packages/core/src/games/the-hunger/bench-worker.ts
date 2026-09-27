// Forked by bench.ts: plays a block of deals and posts one message per deal.
// Runs under `tsx` (dev) — never bundled.
import { pickAiAction } from "./ai-strategies";
import { seatForSpec } from "./bench-specs";
import { applyActionPure, createInitialState } from "./game-engine";
import { getActivePlayer } from "./rules";
import { seedForGame } from "./tournament-runner";
import type { AIStrategyId, Mode } from "./types";

export type Layout = "1vN" | "Nv1" | "h2h";

export interface BenchJob {
  candidate: string;
  baseline: string;
  players: number;
  layout: Layout;
  deals: number[];
  mode: Mode;
  /** Deals whose all-baseline game is already cached (skip replaying it). */
  cached: number[];
}

/** One finished game, every seat. */
export interface GameOutcome {
  winners: number[];
  scores: number[];
  placements: number[];
  burnt: boolean[];
}

export interface DealResult {
  deal: number;
  /** Seat strategies of each played game (the candidate's seats vary by layout). */
  games: { seats: string[]; outcome: GameOutcome; candidateMs: number[] }[];
  /** The all-baseline game, when it was not cached. */
  baseline?: GameOutcome;
}

const job = JSON.parse(process.argv[2] ?? "{}") as BenchJob;
const cand = seatForSpec(job.candidate);
const base = seatForSpec(job.baseline);
const cached = new Set(job.cached);

function play(seats: AIStrategyId[], seed: number, ms: number[]): GameOutcome {
  let s = createInitialState({
    playerCount: seats.length,
    strategies: seats,
    seed,
    options: { mode: job.mode },
  });
  for (let steps = 0; s.phase !== "game-over" && steps < 20_000; steps++) {
    const seat = getActivePlayer(s);
    const t = performance.now();
    const action = pickAiAction(s);
    if (seats[seat] === cand && cand !== base) ms.push(performance.now() - t);
    s = applyActionPure(s, seat, action);
  }
  const r = s.result;
  return {
    winners: r?.winners ?? [],
    scores: r?.scores ?? [],
    placements: r?.placements ?? [],
    burnt: r ? r.breakdown.map((b) => b.fate === "ashes") : [],
  };
}

function layouts(deal: number): AIStrategyId[][] {
  const n = job.players;
  const focus = deal % n;
  if (job.layout === "h2h")
    return [
      [cand, base],
      [base, cand],
    ];
  const seats = Array<AIStrategyId>(n).fill(job.layout === "1vN" ? base : cand);
  seats[focus] = job.layout === "1vN" ? cand : base;
  return [seats];
}

for (const deal of job.deals) {
  const seed = seedForGame(deal);
  const games = layouts(deal).map((seats) => {
    const candidateMs: number[] = [];
    const outcome = play(seats, seed, candidateMs);
    return { seats, outcome, candidateMs };
  });
  const msg: DealResult = { deal, games };
  if (job.layout !== "h2h" && !cached.has(deal)) {
    msg.baseline = play(Array<AIStrategyId>(job.players).fill(base), seed, []);
  }
  process.send?.(msg);
}
