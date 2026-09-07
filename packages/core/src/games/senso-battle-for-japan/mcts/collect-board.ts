// Self-play positions for the learned board evaluator. Not bundled.
//   tsx .../collect-board.ts <strategy> <players> <games> <seedOffset> <outFile>
import { appendFileSync, writeFileSync } from "node:fs";
import { pickAiAction } from "../ai-strategies";
import { applyAction, createInitialState, settleTrick } from "../game-engine";
import { getActivePlayer } from "../rules";
import { computeScores } from "../scoring";
import type { GameState } from "../types";
import { BOARD_FEATURES, boardFeatures } from "./board-features";

const [
  strategy = "shogun",
  playersArg = "2",
  gamesArg = "20",
  offsetArg = "0",
  out = "scratch/policy/board.jsonl",
] = process.argv.slice(2);
const players = Number(playersArg);
const games = Number(gamesArg);
const offset = Number(offsetArg);
writeFileSync(out, "");

function phaseOf(s: GameState) {
  return s.phase;
}

let rows = 0;
const x = new Float64Array(BOARD_FEATURES);
for (let g = 0; g < games; g++) {
  const seed = (Math.imul(offset + g + 1, 0x9e3779b1) ^ 0x5e750) >>> 0;
  const state = createInitialState(players, Array(players).fill(strategy), seed);
  const samples: { seat: number; round: number; x: number[] }[] = [];
  let lastRound = 0;
  while (phaseOf(state) !== "game-over") {
    if (phaseOf(state) === "trick-settle") {
      settleTrick(state);
      continue;
    }
    if (state.round !== lastRound) {
      lastRound = state.round;
      for (let seat = 0; seat < players; seat++) {
        boardFeatures(state, seat, x);
        samples.push({
          seat,
          round: state.round,
          x: Array.from(x, (v) => Math.round(v * 1000) / 1000),
        });
      }
    }
    const seat = getActivePlayer(state);
    applyAction(state, pickAiAction(state, seat, strategy));
  }
  const final = computeScores(state);
  let lines = "";
  for (const s of samples) {
    let rival = -1;
    for (let i = 0; i < players; i++) {
      if (i === s.seat) continue;
      if (rival === -1 || final[i] > final[rival]) rival = i;
    }
    const y = final[s.seat] - final[rival];
    lines += `${JSON.stringify({ n: players, round: s.round, y, x: s.x })}\n`;
    rows++;
  }
  appendFileSync(out, lines);
}
console.log(`${out}: ${rows} positions from ${games} ${players}p games of ${strategy}`);
