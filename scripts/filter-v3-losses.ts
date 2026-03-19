import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const REPLAYS_DIR = "replays";
const V3_ID = "ismcts-v3";

interface TournamentGameLog {
  gameIndex: number;
  strategyA: string;
  strategyB: string;
  scoreA: number;
  scoreB: number;
}

function isV3Loss(game: TournamentGameLog): boolean {
  if (game.strategyA === V3_ID && game.scoreA < game.scoreB) return true;
  if (game.strategyB === V3_ID && game.scoreB < game.scoreA) return true;
  return false;
}

async function main() {
  const output: string[] = [];

  try {
    const matchupDirs = await readdir(REPLAYS_DIR, { withFileTypes: true });
    for (const dirent of matchupDirs) {
      if (!dirent.isDirectory()) continue;

      const dirPath = join(REPLAYS_DIR, dirent.name);
      const files = await readdir(dirPath);

      for (const file of files) {
        if (file === "summary.json") continue;
        if (!file.startsWith("game-") || !file.endsWith(".json")) continue;

        const filePath = join(dirPath, file);
        const raw = await readFile(filePath, "utf-8");
        const game = JSON.parse(raw) as TournamentGameLog;

        if (isV3Loss(game)) {
          output.push(filePath);
        }
      }
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      console.error(`Replays directory not found: ${REPLAYS_DIR}`);
      console.error("Run 'npm run tournament' first to generate replay data.");
      process.exit(1);
    }
    throw err;
  }

  console.log(output.join("\n"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
