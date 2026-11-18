// Word dossiers: every sense, phrase, name and association of a Codenames
// word, written once and cached, so a spymaster finds links (and dangers) by
// lookup instead of recall. VIABILITY TEST — generates only what is asked for.
//
//   cd packages/server
//   pnpm exec tsx src/scripts/codenames-dossiers.ts --yes --bench   # the bench positions' words
//   pnpm exec tsx src/scripts/codenames-dossiers.ts --yes --all     # every word in both lists
//
// Writes scratch/bench/codenames/dossiers.json ({ "en:ninja": Dossier, … });
// already-written words are skipped. The agent reads the file when
// CODENAMES_DOSSIERS points at it (`games/codenames-agent.ts`).

import "../env.ts";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { WORD_SETS } from "@boardgames/core/games/codenames/words/index";
import { z } from "zod";
import { structuredGenerateTraced, tierModel } from "../lib/ai";

const HERE = dirname(fileURLToPath(import.meta.url));
export const DOSSIER_FILE = resolve(HERE, "../../../../scratch/bench/codenames/dossiers.json");

export const DossierSchema = z.object({
  senses: z.array(z.string()),
  phrases: z.array(z.string()),
  names: z.array(z.string()),
  associations: z.array(z.string()),
});
export type Dossier = z.infer<typeof DossierSchema>;

const JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    senses: {
      type: "array",
      maxItems: 8,
      items: { type: "string" },
      description:
        "Every distinct meaning, incl. slang, abbreviations, historical ones (a few words each).",
    },
    phrases: {
      type: "array",
      maxItems: 12,
      items: { type: "string" },
      description: "Compounds and set phrases it forms (FIRE: fire truck, campfire, fire away).",
    },
    names: {
      type: "array",
      maxItems: 10,
      items: { type: "string" },
      description: "Famous people, characters, brands, titles, places it names or evokes.",
    },
    associations: {
      type: "array",
      maxItems: 20,
      items: { type: "string" },
      description: "Single words a typical player instantly connects to it, strongest first.",
    },
  },
  required: ["senses", "phrases", "names", "associations"],
};

const LANG = { en: "English", de: "German" } as const;

async function dossierOf(word: string, language: "en" | "de") {
  const { output, call } = await structuredGenerateTraced({
    feature: "codenames",
    label: "codenames-dossier",
    modelOverride: tierModel("CODENAMES_MODEL_DOSSIER", "balanced"),
    system: `You write reference notes for the board game Codenames, in ${LANG[language]}. For one word, list everything a clue-giver could use to link it to other words — and everything that could make a clue point at it by accident.`,
    user: `WORD: ${word.toUpperCase()}`,
    schemaName: "codenames_dossier",
    jsonSchema: JSON_SCHEMA,
    budgetMs: 40_000,
    reasoningEffort: "low",
  });
  return { dossier: DossierSchema.parse(output), usd: call.usage.costUsd ?? 0 };
}

function benchWords(): { word: string; language: "en" | "de" }[] {
  // The words of the bench positions: the seeded boards (createGame deals them)
  // and production game 63.
  const out: { word: string; language: "en" | "de" }[] = [];
  const game63 = JSON.parse(
    readFileSync(resolve(HERE, "codenames-bench/game-63.json"), "utf8"),
  ) as {
    words: string[];
  };
  for (const w of game63.words) out.push({ word: w, language: "en" });
  return out;
}

async function main() {
  const args = process.argv.slice(2);
  const cache: Record<string, Dossier> = existsSync(DOSSIER_FILE)
    ? JSON.parse(readFileSync(DOSSIER_FILE, "utf8"))
    : {};
  const { createGame } = await import("@boardgames/core/games/codenames/rules");
  let words: { word: string; language: "en" | "de" }[] = [];
  if (args.includes("--all")) {
    words = (["en", "de"] as const).flatMap((language) =>
      WORD_SETS[language].map((word) => ({ word, language })),
    );
  } else {
    const ai = ["codenames-expert", "codenames-expert", "codenames-expert", "codenames-expert"];
    const seeds: [number, "en" | "de"][] = [
      [101, "en"],
      [102, "en"],
      [202, "en"],
      [203, "en"],
      [303, "en"],
      [304, "en"],
      [404, "en"],
      [405, "en"],
      [505, "de"],
      [506, "de"],
      [606, "de"],
      [607, "de"],
    ];
    for (const [seed, language] of seeds) {
      const s = createGame({ seed, ai, language, clueTimerSec: 0, guessTimerSec: 0 });
      for (const word of s.words) words.push({ word, language });
    }
    words.push(...benchWords());
  }
  const todo = [
    ...new Map(words.map((w) => [`${w.language}:${w.word.toLowerCase()}`, w])).entries(),
  ].filter(([key]) => !cache[key]);
  console.log(`${todo.length} words to write (${Object.keys(cache).length} cached)`);
  if (!args.includes("--yes")) return;
  let usd = 0;
  const started = Date.now();
  const queue = [...todo];
  await Promise.all(
    Array.from({ length: 8 }, async () => {
      for (let item = queue.shift(); item; item = queue.shift()) {
        const [key, w] = item;
        try {
          const r = await dossierOf(w.word, w.language);
          cache[key] = r.dossier;
          usd += r.usd;
        } catch (err) {
          console.warn(`${key} failed:`, err instanceof Error ? err.message : err);
        }
      }
    }),
  );
  writeFileSync(DOSSIER_FILE, `${JSON.stringify(cache, null, 1)}\n`);
  console.log(
    `wrote ${todo.length} in ${((Date.now() - started) / 1000).toFixed(0)} s, $${usd.toFixed(3)} ($${(usd / Math.max(1, todo.length)).toFixed(4)}/word)`,
  );
}

await main();
