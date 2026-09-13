// Scores a fitted policy model on collect-policy.ts rows without refitting:
// top-1 accuracy, mean NLL and lead accuracy, optionally per table size.
// Answers "how well does the shared net predict 5-player play?" before a
// per-table refit is worth anything. Not bundled.
//   tsx .../eval-policy.ts <files...> [--model playout|opponent] [--choice shared|per-table]
//        [--players 3] [--by-players]
import { readFileSync } from "node:fs";
import { FEATURES, MAX_HIDDEN, type PolicyModel, scoreCards } from "./policy";
import { type OpponentChoice, opponentModelFor, playoutModelFor } from "./policy-models";

interface Row {
  n: number;
  k: number;
  y: number;
  x: number[];
}

const files: string[] = [];
let which = "playout";
let choice: OpponentChoice = "shared";
let players = 0;
let byPlayers = false;
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--model") which = argv[++i];
  else if (argv[i] === "--choice") choice = argv[++i] as OpponentChoice;
  else if (argv[i] === "--players") players = Number(argv[++i]);
  else if (argv[i] === "--by-players") byPlayers = true;
  else files.push(argv[i]);
}

const rows: Row[] = [];
for (const file of files) {
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (!line) continue;
    const row = JSON.parse(line) as Row;
    if (players > 0 && row.n !== players) continue;
    rows.push(row);
  }
}

function modelFor(n: number): PolicyModel {
  if (which === "opponent") return opponentModelFor(n, choice, "per-table");
  return playoutModelFor(n, choice === "playout" ? "per-table" : choice);
}

const feats = new Float32Array(13 * FEATURES);
const scores = new Float32Array(13);
const hidden = new Float32Array(MAX_HIDDEN);
function evaluate(set: Row[]): string {
  let hits = 0;
  let nll = 0;
  let lead = 0;
  let leadN = 0;
  for (const row of set) {
    feats.set(row.x);
    scoreCards(feats, row.k, modelFor(row.n), scores, hidden);
    let best = 0;
    let max = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < row.k; i++) {
      if (scores[i] > scores[best]) best = i;
      if (scores[i] > max) max = scores[i];
    }
    let sum = 0;
    for (let i = 0; i < row.k; i++) sum += Math.exp(scores[i] - max);
    nll -= scores[row.y] - max - Math.log(sum);
    const hit = best === row.y ? 1 : 0;
    hits += hit;
    if (row.x[15] === 1 && row.k >= 4) {
      lead += hit;
      leadN++;
    }
  }
  return `n=${set.length} top-1 ${((100 * hits) / set.length).toFixed(1)}% nll ${(nll / set.length).toFixed(3)} leads(k≥4) ${((100 * lead) / Math.max(1, leadN)).toFixed(1)}% (n=${leadN})`;
}

console.log(`${which} model (${choice}) · ${evaluate(rows)}`);
if (byPlayers) {
  for (const n of [2, 3, 4, 5]) {
    const set = rows.filter((r) => r.n === n);
    if (set.length) console.log(`  ${n}p: ${evaluate(set)}`);
  }
}
