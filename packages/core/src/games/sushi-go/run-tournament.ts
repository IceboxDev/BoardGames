import { simulateGame } from "./tournament-runner";

declare const process: {
  argv: string[];
  stdout: { write: (s: string) => boolean | void };
};

const N = parseInt(process.argv[2] || "200", 10);
let nashWins = 0;
let minimaxWins = 0;
let draws = 0;
let totalScoreA = 0;
let totalScoreB = 0;

for (let i = 0; i < N; i++) {
  const aPlaysFirst = i % 2 === 0;
  const result = simulateGame("nash", "minimax", aPlaysFirst, i);
  totalScoreA += result.scoreA;
  totalScoreB += result.scoreB;
  if (result.scoreA > result.scoreB) nashWins++;
  else if (result.scoreB > result.scoreA) minimaxWins++;
  else draws++;
  if ((i + 1) % 100 === 0) {
    process.stdout.write(`  ${i + 1}/${N} games...\n`);
  }
}

const nashWR = ((nashWins / N) * 100).toFixed(1);
const avgNash = (totalScoreA / N).toFixed(1);
const avgMinimax = (totalScoreB / N).toFixed(1);
const avgDiff = ((totalScoreA - totalScoreB) / N).toFixed(2);

console.log(`\nResults (${N} games):`);
console.log(`  Nash wins:    ${nashWins} (${nashWR}%)`);
console.log(`  Minimax wins: ${minimaxWins} (${((minimaxWins / N) * 100).toFixed(1)}%)`);
console.log(`  Draws:        ${draws}`);
console.log(`  Avg score:    Nash ${avgNash} / Minimax ${avgMinimax}`);
console.log(`  Avg diff:     ${avgDiff} (Nash - Minimax)`);
