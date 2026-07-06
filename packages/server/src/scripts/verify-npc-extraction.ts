// Verify the NPC & monster extraction: run `extractNpcs` N times in a row
// against a local module PDF and require every expected name (case-
// insensitive substring match) to appear in EVERY run. Exits non-zero on the
// first failing streak. Costs real OpenAI calls; touches no DB tables.
//
// Usage (from packages/server):
//   pnpm exec tsx src/scripts/verify-npc-extraction.ts <pdf-path> [runs]

import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import "../env.ts";
import { extractNpcs } from "../lib/dnd-extract.ts";

const REQUIRED = [
  "patious",
  "allani",
  "jane",
  "melcenedil",
  "speaker",
  "gwanok",
  "marcus",
  "dead vine",
];

const [pdfPath, runsArg] = process.argv.slice(2);
if (!pdfPath) {
  console.error("usage: tsx src/scripts/verify-npc-extraction.ts <pdf-path> [runs]");
  process.exit(1);
}
const runs = Number(runsArg ?? "3");

const pdfBytes = await readFile(pdfPath);
const pdfDataUri = `data:application/pdf;base64,${pdfBytes.toString("base64")}`;
const filename = basename(pdfPath);

let allPassed = true;
for (let run = 1; run <= runs; run++) {
  const started = Date.now();
  const npcs = await extractNpcs(pdfDataUri, filename);
  const names = npcs.map((n) => n.name.toLowerCase());
  const missing = REQUIRED.filter((req) => !names.some((n) => n.includes(req)));
  const seconds = Math.round((Date.now() - started) / 1000);

  console.log(`\nrun ${run}/${runs} — ${npcs.length} cards in ${seconds}s`);
  for (const npc of npcs) console.log(`  [${npc.category}] ${npc.name} — ${npc.role}`);
  if (missing.length > 0) {
    allPassed = false;
    console.log(`  ✗ MISSING: ${missing.join(", ")}`);
  } else {
    console.log("  ✓ all required names present");
  }
}

console.log(allPassed ? `\nPASS: ${runs}/${runs} runs complete` : "\nFAIL");
process.exit(allPassed ? 0 : 1);
