// Import the transcribed Quiztopia cards into the committed content files.
//
//   pnpm quiztopia-import ~/Downloads/quiz-cards/json [--allow-removed]
//
// Reads every *.json in the directory, normalises it (stable ids, validated
// shapes, precomputed answer spans) and writes
//   packages/core/src/games/quiztopia/content/{index,titles,timeline}.json
//   packages/core/src/games/quiztopia/content/questions/<card>.json
//   packages/core/src/games/quiztopia/content/articles/<card>.json
// The previous index.json (if any) pins card ids across re-imports.

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ContentIndexSchema } from "../packages/core/src/games/quiztopia/content-types.ts";
import {
  normalizeCards,
  type RawCard,
} from "../packages/core/src/games/quiztopia/import/normalize.ts";

const args = process.argv.slice(2);
const allowRemoved = args.includes("--allow-removed");
const srcDir = args.find((a) => !a.startsWith("--"));
if (!srcDir) {
  console.error("usage: tsx scripts/quiztopia-import.ts <dir-with-card-json> [--allow-removed]");
  process.exit(2);
}

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, "../packages/core/src/games/quiztopia/content");
const indexPath = join(outDir, "index.json");

const previousIndex = existsSync(indexPath)
  ? ContentIndexSchema.parse(JSON.parse(readFileSync(indexPath, "utf8")))
  : null;

const cards = readdirSync(resolve(srcDir))
  .filter((f) => f.endsWith(".json"))
  .sort()
  .map((f) => ({
    stem: f.replace(/\.json$/, ""),
    card: JSON.parse(readFileSync(join(resolve(srcDir), f), "utf8")) as RawCard,
  }));

const out = normalizeCards({ cards, previousIndex, allowRemoved });

rmSync(join(outDir, "questions"), { recursive: true, force: true });
rmSync(join(outDir, "articles"), { recursive: true, force: true });
mkdirSync(join(outDir, "questions"), { recursive: true });
mkdirSync(join(outDir, "articles"), { recursive: true });

writeFileSync(indexPath, `${JSON.stringify(out.index, null, 2)}\n`);
writeFileSync(join(outDir, "titles.json"), `${JSON.stringify(out.titles)}\n`);
writeFileSync(join(outDir, "timeline.json"), `${JSON.stringify(out.timeline)}\n`);
for (const q of out.questions) writeFileSync(join(outDir, "questions", `${q.id}.json`), `${JSON.stringify(q)}\n`);
for (const a of out.articles) writeFileSync(join(outDir, "articles", `${a.id}.json`), `${JSON.stringify(a)}\n`);

console.log(
  `quiztopia content v${out.index.version}: ${out.index.counts.cards} cards, ${out.index.counts.sets} sets, ${out.index.counts.questions} questions (${Object.keys(out.timeline).length} dated) → ${outDir}`,
);
