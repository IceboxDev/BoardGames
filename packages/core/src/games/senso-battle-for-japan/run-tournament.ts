// Local, zero-server AI evaluation:
//   pnpm --filter @boardgames/core exec tsx src/games/senso-battle-for-japan/run-tournament.ts \
//     [games=40] [players=2] [strategyA=shogun] [strategyB=heuristic-v1] [determinizations] [rewardCandidates] [cube] [exposure] [potential] [exact 0|1] [opponentSearch] [rolloutMode] [trickLookahead]
// Strategy id "prev" = the Shōgun with the committed defaults, for A/B runs.
// Seats alternate A,B,A,B… / B,A,B,A… per game so both strategies hold every
// seat (and the odd extra seat) equally often over an even number of games.

import { pickBonus, pickReward } from "./ai-rewards";
import { configureSearch, DEFAULT_SEARCH, pickPlaySearch, pickRewardSearch } from "./ai-search";
import { registerStrategy, searchStrategy } from "./ai-strategies";
import { pickPlay } from "./ai-tricks";
import { seatPattern, simulateGame } from "./tournament-runner";
import type { AIStrategyId } from "./types";

declare const process: {
  argv: string[];
  stdout: { write: (s: string) => boolean | undefined };
};

const N = Number.parseInt(process.argv[2] || "40", 10);
const PLAYERS = Number.parseInt(process.argv[3] || "2", 10);
const A = (process.argv[4] || "shogun") as AIStrategyId;
const B = (process.argv[5] || "heuristic-v1") as AIStrategyId;
// Snapshot the committed defaults as a benchmark opponent before any override.
const PREV = { ...DEFAULT_SEARCH, weights: { ...DEFAULT_SEARCH.weights } };
registerStrategy(searchStrategy("prev" as AIStrategyId, () => PREV));
// Diagnostic hybrids: which phase does the search earn its strength in?
registerStrategy({
  id: "hybrid-tricks" as AIStrategyId,
  pickAction(state, legal, seat) {
    if (state.phase === "trick") return pickPlaySearch(state, legal, seat, PREV);
    if (state.phase === "rewards") return pickReward(state, legal, seat, "careful");
    return pickBonus(state, legal, seat);
  },
});
registerStrategy({
  id: "hybrid-rewards" as AIStrategyId,
  pickAction(state, legal, seat) {
    if (state.phase === "trick") return pickPlay(state, legal, seat, "careful");
    if (state.phase === "rewards") return pickRewardSearch(state, legal, seat, PREV);
    return pickBonus(state, legal, seat);
  },
});
if (process.argv[6]) configureSearch({ determinizations: Number.parseInt(process.argv[6], 10) });
if (process.argv[7]) configureSearch({ rewardCandidates: Number.parseInt(process.argv[7], 10) });
if (process.argv[11]) configureSearch({ exactRoundValue: process.argv[11] === "1" });
if (process.argv[12]) configureSearch({ opponentSearch: Number.parseInt(process.argv[12], 10) });
if (process.argv[13])
  configureSearch({ rolloutMode: process.argv[13] as "careful" | "aggressive" });
if (process.argv[14]) configureSearch({ trickLookahead: Number.parseInt(process.argv[14], 10) });
if (process.argv[8] || process.argv[9] || process.argv[10]) {
  configureSearch({
    weights: {
      cube: Number.parseFloat(process.argv[8] || "0"),
      exposure: Number.parseFloat(process.argv[9] || "0"),
      potential: Number.parseFloat(process.argv[10] || "0"),
    },
  });
}

let winsA = 0;
let winsB = 0;
let draws = 0;
const t0 = Date.now();
for (let i = 0; i < N; i++) {
  const seats = seatPattern(A, B, PLAYERS, i);
  const winner = simulateGame(seats, i);
  if (winner < 0) draws++;
  else if (seats[winner] === A) winsA++;
  else winsB++;
  if ((i + 1) % 10 === 0) process.stdout.write(`  ${i + 1}/${N} games (${Date.now() - t0} ms)\n`);
}
const ms = Date.now() - t0;
console.log(`\n${PLAYERS}-player, ${N} games, ${(ms / N).toFixed(0)} ms/game`);
console.log(`  ${A}: ${winsA} (${((winsA / N) * 100).toFixed(1)}%)`);
console.log(`  ${B}: ${winsB} (${((winsB / N) * 100).toFixed(1)}%)`);
console.log(`  draws: ${draws}`);
