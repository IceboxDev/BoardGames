// Self-play data for the learned playout policy. Not bundled.
//   tsx .../collect-policy.ts <strategy> <players> <games> <seedOffset> <outFile> [budgetMs] [tenkaJson]
import { appendFileSync, writeFileSync } from "node:fs";
import { voidsOf } from "../ai-search";
import { pickAiAction } from "../ai-strategies";
import { applyAction, createInitialState, settleTrick } from "../game-engine";
import { getActivePlayer, getLegalActions } from "../rules";
import { CLANS, type GameState } from "../types";
import { configureTenka } from "./config";
import { CARD_INDEX, fastFromState, legalInto } from "./fast-round";
import { FEATURES, policyFeatures } from "./policy";

const [
  strategy = "shogun",
  playersArg = "2",
  gamesArg = "20",
  offsetArg = "0",
  out = "scratch/policy/data.jsonl",
  budgetArg = "0",
  tenkaJson = "",
] = process.argv.slice(2);
const players = Number(playersArg);
const games = Number(gamesArg);
const offset = Number(offsetArg);
const budget = Number(budgetArg) > 0 ? { timeMs: Number(budgetArg) } : undefined;
if (tenkaJson) configureTenka(JSON.parse(tenkaJson));
writeFileSync(out, "");

function phaseOf(s: GameState) {
  return s.phase;
}

let rows = 0;
const buf = new Int8Array(13);
const feats = new Float32Array(13 * FEATURES);
for (let g = 0; g < games; g++) {
  const seed = (Math.imul(offset + g + 1, 0x9e3779b1) ^ 0x5e750) >>> 0;
  const state = createInitialState(players, Array(players).fill(strategy), seed);
  let lines = "";
  while (phaseOf(state) !== "game-over") {
    if (phaseOf(state) === "trick-settle") {
      settleTrick(state);
      continue;
    }
    const seat = getActivePlayer(state);
    const legal = getLegalActions(state);
    const action = pickAiAction(state, seat, strategy, budget);
    if (phaseOf(state) === "trick" && action.type === "play" && legal.length > 1) {
      const f = fastFromState(state, seat);
      const count = legalInto(f, seat, buf);
      const voidMask = new Uint8Array(players);
      for (const v of voidsOf(state)) {
        const [s, suit] = v.split(":");
        const idx = CLANS.indexOf(suit as (typeof CLANS)[number]);
        if (idx >= 0) voidMask[Number(s)] |= 1 << idx;
      }
      policyFeatures(f, seat, buf, count, voidMask, feats);
      const chosen = CARD_INDEX[action.card];
      let idx = -1;
      for (let i = 0; i < count; i++) if (buf[i] === chosen) idx = i;
      if (idx >= 0) {
        const x = Array.from(
          feats.subarray(0, count * FEATURES),
          (v) => Math.round(v * 1000) / 1000,
        );
        lines += `${JSON.stringify({ n: players, k: count, y: idx, x })}\n`;
        rows++;
      }
    }
    applyAction(state, action);
  }
  appendFileSync(out, lines);
}
console.log(`${out}: ${rows} decisions from ${games} ${players}p games of ${strategy}`);
