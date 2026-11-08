// Every AI feature once, on the active AI profile — the check that a provider
// switch works before the site runs on it (docs/ai-architecture.md).
//
//   cd packages/server
//   AI_PROFILE=anthropic pnpm exec tsx src/scripts/ai-smoke.ts            # what it would call
//   AI_PROFILE=anthropic pnpm exec tsx src/scripts/ai-smoke.ts --yes      # run it (bills)
//   … --yes --pdf=/path/to/character-sheet.pdf                            # + D&D extraction
//
// Runs: the probe; Codenames clue, guess and clue ruling (each tier's model
// once); Decrypto encrypt and intercept; an agent run with a tool; and, with
// --pdf, a D&D character extraction. The game agents fall back to their
// deterministic stand-ins on any failure, so the verdict is read from the AI
// ledger: every call the step made, ok or failed, with model, time, tokens
// (cached) and dollars. Generation scripts (descriptions, skills) are smoke-
// tested by running them for one slug.

import "../env.ts";
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import type { SpymasterCard } from "@boardgames/core/games/codenames/ai/agent";
import { llmCodenamesAgent } from "../games/codenames-agent";
import { openAiDecryptoAgent } from "../games/decrypto-agent";
import { aiStatus, probeAi } from "../lib/ai";
import { defineAgent } from "../lib/ai/agent";
import { type AiCallRecord, recentAiCalls } from "../lib/ai/ledger";
import { catalogLookup } from "../lib/ai/tools/catalog";
import { extractCharacter } from "../lib/dnd-extract";

const args = process.argv.slice(2);
const run = args.includes("--yes");
const pdf = args.find((a) => a.startsWith("--pdf="))?.slice("--pdf=".length);

const WORDS = [
  ["APPLE", "own"],
  ["BERLIN", "own"],
  ["CASTLE", "own"],
  ["DIAMOND", "own"],
  ["ENGINE", "own"],
  ["FOREST", "own"],
  ["GHOST", "own"],
  ["HONEY", "own"],
  ["ICE", "own"],
  ["JUPITER", "opponent"],
  ["KNIGHT", "opponent"],
  ["LEMON", "opponent"],
  ["MOUSE", "opponent"],
  ["NEEDLE", "opponent"],
  ["OPERA", "opponent"],
  ["PIANO", "opponent"],
  ["QUEEN", "opponent"],
  ["ROBOT", "bystander"],
  ["SATURN", "bystander"],
  ["TABLE", "bystander"],
  ["UMBRELLA", "bystander"],
  ["VOLCANO", "bystander"],
  ["WHALE", "bystander"],
  ["YACHT", "bystander"],
  ["ZEBRA", "assassin"],
] as const;
const CARDS: SpymasterCard[] = WORDS.map(([word, kind], index) => ({
  index,
  word,
  kind,
  revealed: false,
}));

interface Step {
  name: string;
  run: () => Promise<unknown>;
}

const STEPS: Step[] = [
  { name: "probe (one generation, fast role)", run: () => probeAi(true) },
  {
    name: "codenames: clue (Mastermind — smart role + test reads on balanced)",
    run: () =>
      llmCodenamesAgent.giveClue({
        model: "codenames-expert",
        mode: "classic",
        language: "en",
        cards: CARDS,
        history: [],
        agentsLeft: 9,
        opponentAgentsLeft: 8,
      }),
  },
  {
    name: "codenames: guess (Scout — fast role)",
    run: () =>
      llmCodenamesAgent.guess({
        model: "codenames-medium",
        mode: "classic",
        language: "en",
        words: CARDS.map(({ index, word }) => ({ index, word })),
        clue: { word: "PLANET", count: 2 },
        guessesLeft: 3,
        agentsLeft: 9,
        opponentAgentsLeft: 8,
        history: [],
      }),
  },
  {
    name: "codenames: clue ruling (Analyst — balanced role)",
    run: async () =>
      llmCodenamesAgent.judgeClue?.({
        model: "codenames-hard",
        language: "en",
        clue: "PIANIST",
        clash: "PIANO",
      }),
  },
  {
    name: "decrypto: encrypt (expert — smart role)",
    run: () =>
      openAiDecryptoAgent.encrypt({
        model: "decrypto-expert",
        keywords: ["OCEAN", "TRAIN", "CANDLE", "TIGER"],
        code: [3, 1, 4],
        round: 1,
        ownRevealedClues: [],
        oppRevealedClues: [],
        forbiddenClues: [],
        ownDecodeMistakes: [],
        tokens: {
          own: { interceptions: 0, miscommunications: 0 },
          opp: { interceptions: 0, miscommunications: 0 },
        },
      }),
  },
  {
    name: "decrypto: intercept (hard — balanced role)",
    run: () =>
      openAiDecryptoAgent.guess({
        model: "decrypto-hard",
        purpose: "intercept",
        keywords: null,
        currentClues: ["waves", "stripes", "wax"],
        targetRevealedClues: [
          { round: 1, clue: "salt", digit: 1 },
          { round: 1, clue: "jungle", digit: 4 },
          { round: 1, clue: "wick", digit: 3 },
          { round: 2, clue: "platform", digit: 2 },
        ],
        pastDecodeMistakes: [],
        round: 3,
      }),
  },
  {
    name: "agent: tool loop (catalogLookup, smart role)",
    run: () =>
      defineAgent({
        label: "smoke-agent",
        instructions:
          "You answer questions about the group's board-game catalog. Use the catalogLookup tool; never guess slugs.",
        tools: { catalogLookup },
        maxSteps: 4,
        budgetUsd: 0.25,
        reasoningEffort: "low",
      })
        .run("Which Codenames variants are in the catalog? Answer with their slugs only.")
        .then((r) => ({ text: r.text, steps: r.steps.length, costUsd: r.costUsd })),
  },
];

if (pdf) {
  STEPS.push({
    name: `dnd: character extraction (${basename(pdf)})`,
    run: async () => {
      const dataUri = `data:application/pdf;base64,${readFileSync(pdf).toString("base64")}`;
      const sheet = await extractCharacter(dataUri, basename(pdf));
      return { name: sheet.name };
    },
  });
}

function money(usd: number | null, source: AiCallRecord["usage"]["costSource"]): string {
  return usd === null ? "$?" : `${source === "list" ? "~" : ""}$${usd.toFixed(4)}`;
}

const status = aiStatus();
console.log(`AI profile: ${status.profile}${status.suspended ? " (SUSPENDED)" : ""}`);
for (const [role, model] of Object.entries(status.roles))
  console.log(`  ${role.padEnd(9)}${model ?? "—"}`);
console.log(
  `  keys: ${Object.entries(status.keys)
    .map(([k, v]) => `${k} ${v ? "set" : "missing"}`)
    .join(", ")}`,
);
console.log(`\n${STEPS.length} steps:`);
for (const step of STEPS) console.log(`  · ${step.name}`);
if (!run) {
  console.log("\nNothing called. Re-run with --yes to make these (billed) calls.");
  process.exit(0);
}

let failures = 0;
let total = 0;
for (const step of STEPS) {
  const before = recentAiCalls().length;
  const t0 = Date.now();
  let result: unknown;
  let thrown: unknown = null;
  try {
    result = await step.run();
  } catch (err) {
    thrown = err;
  }
  const calls = recentAiCalls().slice(before);
  const failed = calls.filter((c) => !c.ok);
  const standIn =
    typeof result === "object" && result !== null && "standIn" in result && result.standIn === true;
  const probeFailed =
    typeof result === "object" && result !== null && "ok" in result && result.ok === false;
  const bad = thrown !== null || failed.length > 0 || standIn || probeFailed;
  if (bad) failures += 1;
  console.log(`\n${bad ? "✗" : "✓"} ${step.name} — ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  for (const c of calls) {
    total += c.usage.costUsd ?? 0;
    const cached = c.usage.cacheReadTokens ? ` (${c.usage.cacheReadTokens} cached)` : "";
    console.log(
      `    ${c.ok ? "ok " : "ERR"} ${c.label.padEnd(26)} ${c.model.padEnd(30)} ${(c.ms / 1000).toFixed(1).padStart(5)}s  ${c.usage.inputTokens ?? "?"}${cached}→${c.usage.outputTokens ?? "?"} tok  ${money(c.usage.costUsd, c.usage.costSource)}`,
    );
    if (c.error) console.log(`        ${c.error.slice(0, 400)}`);
  }
  if (thrown !== null)
    console.log(`    threw: ${thrown instanceof Error ? thrown.message : String(thrown)}`);
  if (standIn) console.log("    answered by the deterministic stand-in (the model call failed)");
  console.log(`    → ${JSON.stringify(result)?.slice(0, 300)}`);
}
console.log(
  `\n${STEPS.length - failures}/${STEPS.length} steps ok · total ${money(total, "list")}`,
);
process.exit(failures === 0 ? 0 : 1);
