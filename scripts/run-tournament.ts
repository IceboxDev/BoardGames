import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { runTournament } from "@boardgames/core/games/lost-cities/tournament-runner";

const REPLAYS_DIR = "replays";

function parseArgs(): { strategyA: string; strategyB: string; games: number } {
  const args = process.argv.slice(2);
  let strategyA = "ismcts-v3";
  let strategyB = "ismcts-v3";
  let games = 100;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--pair" && args[i + 1] && args[i + 2]) {
      strategyA = args[i + 1];
      strategyB = args[i + 2];
      i += 2;
    } else if (args[i] === "--games" && args[i + 1]) {
      games = parseInt(args[i + 1], 10);
      if (Number.isNaN(games) || games < 1) {
        console.error("--games must be a positive integer");
        process.exit(1);
      }
      i++;
    }
  }

  return { strategyA, strategyB, games };
}

async function main() {
  const { strategyA, strategyB, games } = parseArgs();

  console.log(`Running tournament: ${strategyA} vs ${strategyB} (${games} games)\n`);

  const result = runTournament(strategyA, strategyB, games, {
    onProgress: (completed, total) => {
      process.stdout.write(`\r  ${completed} / ${total} games`);
    },
  });

  console.log("\n");

  const dirName = `${strategyA}-vs-${strategyB}`;
  const dirPath = join(REPLAYS_DIR, dirName);
  await mkdir(dirPath, { recursive: true });

  for (const game of result.games) {
    const filePath = join(dirPath, `game-${game.gameIndex}.json`);
    await writeFile(filePath, JSON.stringify(game, null, 2), "utf-8");
  }

  const summary = {
    strategyA: result.strategyA,
    strategyB: result.strategyB,
    gamesPlayed: result.gamesPlayed,
    aWins: result.aWins,
    bWins: result.bWins,
    draws: result.draws,
    avgScoreA: result.gamesPlayed > 0 ? Math.round(result.totalScoreA / result.gamesPlayed) : 0,
    avgScoreB: result.gamesPlayed > 0 ? Math.round(result.totalScoreB / result.gamesPlayed) : 0,
  };

  await writeFile(
    join(dirPath, "summary.json"),
    JSON.stringify(summary, null, 2),
    "utf-8",
  );

  console.log(`Saved ${result.gamesPlayed} games to ${dirPath}/`);
  console.log(`  ${result.aWins} wins / ${result.bWins} losses / ${result.draws} draws`);
  console.log(`  Avg score: ${summary.avgScoreA} - ${summary.avgScoreB}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
