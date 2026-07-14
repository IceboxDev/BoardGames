/**
 * End-to-end validation of the TS<->C++ AI bridge. Seat 0 is driven by the
 * standalone `sw7 move` binary (serialize position -> subprocess -> canonical
 * move -> matched TS action); seats 1-4 play random. Proves every C++ move maps
 * to a legal TS action, and reports the C++ agent's win-rate.
 *
 *   pnpm tsx scripts/test-cpp-bridge.ts [games] [iters] [dets]
 */
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  applyPendingAction,
  applyReveal,
  applySelection,
  createInitialState,
} from "../packages/core/src/games/7-wonders/game-engine.ts";
import { getActivePlayer, getLegalActions } from "../packages/core/src/games/7-wonders/rules.ts";
import { determineWinner, scoreFinal } from "../packages/core/src/games/7-wonders/scoring.ts";
import {
  matchCanon,
  serializePosition,
} from "../packages/core/src/games/7-wonders/ai/cpp-bridge.ts";
import { createRng } from "../packages/core/src/lib/rng.ts";
import type { GameState } from "../packages/core/src/games/7-wonders/types.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SW7 = resolve(ROOT, "cpp/seven-wonders/build/sw7");
const games = Number(process.argv[2] ?? 12);
const iters = String(process.argv[3] ?? 150);
const dets = String(process.argv[4] ?? 4);

function cppMove(gs: GameState, seat: number) {
  const pos = serializePosition(gs, seat);
  const out = execFileSync(SW7, ["move", "-", iters, dets], { input: pos }).toString().trim();
  const canon = out.split(/\s+/).map(Number) as [number, number, number, number, number];
  const action = matchCanon(gs, seat, canon);
  if (!action) throw new Error(`C++ returned unmatchable move [${canon}] for seat ${seat}`);
  return action;
}

let wins = 0;
let ranks = 0;
for (let g = 0; g < games; g++) {
  const rng = createRng(g * 2654435761 + 1);
  let gs = createInitialState({ playerCount: 5, seed: g * 99991 + 7, sideMode: "random", edifice: g % 2 === 0 });
  while (gs.phase !== "game-over") {
    if (gs.phase === "selecting") {
      for (let i = 0; i < 5; i++) {
        if (gs.selections[i] !== null) continue;
        const action =
          i === 0 ? cppMove(gs, 0) : getLegalActions(gs, i)[Math.floor(rng() * getLegalActions(gs, i).length)];
        gs = applySelection(gs, i, action);
      }
      if (gs.phase === "revealing") gs = applyReveal(gs);
    } else if (gs.phase === "revealing") {
      gs = applyReveal(gs);
    } else {
      const ap = getActivePlayer(gs);
      const legal = getLegalActions(gs, ap);
      const action = ap === 0 ? cppMove(gs, 0) : legal[Math.floor(rng() * legal.length)];
      gs = applyPendingAction(gs, ap, action);
    }
  }
  const bd = scoreFinal(gs);
  const totals = bd.map((b) => b.total);
  const winner = determineWinner(gs, bd);
  const rank = 1 + totals.filter((t, i) => i !== 0 && t > totals[0]).length;
  ranks += rank;
  if (winner === 0) wins++;
  process.stdout.write(`  game ${g + 1}/${games}: seat0 total=${totals[0]} rank=${rank}${winner === 0 ? " WIN" : ""}\n`);
}

console.log(
  `\nC++ bridge OK — every move mapped to a legal TS action.\n` +
    `seat 0 (C++ agent) vs 4 random: ${((100 * wins) / games).toFixed(0)}% wins, avg rank ${(ranks / games).toFixed(2)}`,
);
