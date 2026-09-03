// Six-trait skill-vector generation for catalog games. One CLI entry point.
//
// Usage:
//   pnpm gen-skills --slug <slug> [--slug <slug> …]   # specific games
//   pnpm gen-skills --placeholders                    # every entry still on the
//                                                     # bgg-sync scaffold vector
//   pnpm gen-skills --dry-run                         # log, don't write
//
// Required env (loaded from packages/server/.env via --env-file, same as
// gen-descriptions): AI_GATEWAY_API_KEY (+ optional AI_MODEL_SKILLS / AI_MODEL).
//
// `bgg-sync --add` invokes this automatically after scaffolding, so new games
// get a real editorial-quality vector instead of the placeholder — nobody
// writes these by hand. Calibration examples below are lifted verbatim from
// the human-authored table so the model matches its scale.

import { readFile, writeFile } from "node:fs/promises";
import { stripBggHtml } from "./gen-descriptions/strip-bgg-html.mjs";
import { ensureAiUsable, resolveScriptModel, structuredScriptCall } from "./lib/ai.mjs";

const CATALOG_PATH = "packages/core/src/games/catalog.json";
const SNAPSHOT_PATH = "packages/core/src/bgg/snapshot.json";
const MODEL = resolveScriptModel("AI_MODEL_SKILLS", "openai/gpt-5.2");
/** The exact vector `bgg-sync --add` scaffolds (no real entry uses it). */
export const PLACEHOLDER = { int: 40, pln: 40, per: 20, soph: 0, soc: 0, dex: 0 };

// The FULL editorial trait framework, verbatim — the same document the
// human-authored table was built from. Do not condense: the bullet lists are
// what disambiguate borderline games.
const TRAIT_DEFINITIONS = `The six traits (weights are integers summing to exactly 100, in steps of 5):

1. int (Intelligence) — The ability to reason, calculate, deduce, abstract, and solve unfamiliar problems.
Falls under this trait: logical reasoning; deductive and inductive reasoning; quantitative reasoning; probability and expected-value assessment; mental calculation; recognizing causal relationships; understanding complex systems and rules; identifying optimal or near-optimal solutions; adapting reasoning to novel situations; tactical calculation; comparing alternatives objectively; learning how a system works from limited experience; identifying hidden structure in a problem.
Core idea: how effectively you can figure things out.

2. pln (Planning) — The ability to form, organize, maintain, and adapt strategies across multiple future decisions.
Falls under this trait: long-term thinking; sequencing actions; anticipating future consequences; setting intermediate goals; prioritization; resource allocation; opportunity-cost management; timing; preparing for future states; managing multiple objectives simultaneously; delaying short-term rewards for larger future gains; maintaining a coherent strategy; adapting plans when circumstances change; contingency planning; judging when to commit, pivot, or abandon a strategy.
Core idea: how effectively you can turn present decisions into future advantage.

3. per (Perception) — The ability to notice, distinguish, organize, and rapidly recognize relevant information and patterns.
Falls under this trait: visual pattern recognition; visual search; spatial awareness; spatial relationships; detecting similarities and differences; identifying configurations; noticing changes; scanning complex information efficiently; recognizing recurring structures; distinguishing relevant information from noise; attentional accuracy; tracking visible elements; short-term visual retention; quickly recognizing opportunities that are already present; maintaining awareness of the current state of play.
Core idea: how effectively you notice what is there.

4. soph (Sophistication) — The breadth, accessibility, and effective use of language, factual knowledge, concepts, associations, references, and shared understanding.
Falls under this trait: vocabulary; verbal fluency; factual and general knowledge; cultural literacy; conceptual knowledge; semantic associations; word relationships; accumulated knowledge across different subjects; retrieving relevant information from memory; understanding references, analogies, and allusions; interpreting ambiguous or indirect language; constructing precise or useful wording; expressing complex concepts efficiently; understanding how wording may be interpreted; selecting language or references appropriate to another person's knowledge; recognizing shared frames of reference; connecting apparently unrelated concepts through knowledge or language; communicating information under linguistic or conceptual constraints.
Core idea: how rich your pool of knowledge and concepts is, and how effectively you can understand and deploy it.

5. soc (Social) — The ability to understand, predict, and influence other people's thoughts, intentions, emotions, and behavior.
Falls under this trait: reading intentions; theory of mind; predicting behavior; recognizing motives and incentives; deception detection; bluffing; misleading others; persuasion; negotiation; diplomacy; coalition building; trust assessment; reputation management; interpreting social signals; recognizing confidence, hesitation, or uncertainty; judging how others perceive you; anticipating reactions; manipulating incentives; managing interpersonal conflict; concealing intentions; exploiting differences in what different people believe or know.
Core idea: how effectively you understand and operate through other people.

6. dex (Dexterity) — The ability to control physical actions accurately, consistently, and rapidly.
Falls under this trait: hand-eye coordination; fine motor control; gross motor control; precision; steadiness; aim; force control; distance control; timing of physical actions; reaction speed; movement speed; physical coordination; balance; controlled manipulation of objects; consistency of repeated movements; adjusting movements based on immediate sensory feedback; performing accurately under physical pressure or time constraints.
Core idea: how effectively you can physically execute what you intend to do.`;

const CALIBRATION = `Calibration examples (human-authored, match this scale exactly):
7 Wonders: int 35, pln 50, per 15, soph 0, soc 0, dex 0
Chess: int 50, pln 40, per 10, soph 0, soc 0, dex 0
Codenames: int 15, pln 5, per 5, soph 70, soc 5, dex 0
Coup: int 15, pln 10, per 5, soph 5, soc 65, dex 0
SET: int 10, pln 0, per 80, soph 0, soc 0, dex 10
Bandit (real-time reflex card game — reaction speed IS dex): int 5, pln 5, per 30, soph 0, soc 5, dex 55
Trivial Pursuit: int 5, pln 0, per 5, soph 90, soc 0, dex 0
Blood on the Clocktower: int 20, pln 5, per 10, soph 15, soc 50, dex 0
Pandemic (co-op): int 35, pln 45, per 10, soph 5, soc 5, dex 0
Wavelength: int 10, pln 0, per 5, soph 65, soc 20, dex 0`;

const WEIGHTS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["int", "pln", "per", "soph", "soc", "dex"],
  properties: Object.fromEntries(
    ["int", "pln", "per", "soph", "soc", "dex"].map((k) => [
      k,
      { type: "integer", minimum: 0, maximum: 100 },
    ]),
  ),
};

function validWeights(w) {
  const keys = ["int", "pln", "per", "soph", "soc", "dex"];
  return (
    keys.every((k) => Number.isInteger(w?.[k]) && w[k] >= 0 && w[k] <= 100) &&
    keys.reduce((s, k) => s + w[k], 0) === 100
  );
}

function buildUserPrompt(entry, bgg) {
  // Feed the model everything the snapshot knows about the game — categories,
  // mechanics, families, weight, player counts, designers — plus the full
  // description. More context = better disambiguation of borderline games.
  const lines = [`Game: ${entry.displayTitle ?? bgg?.name ?? entry.slug}`];
  if (bgg?.yearPublished) lines.push(`Published: ${bgg.yearPublished}`);
  if (bgg?.categories?.length) lines.push(`Categories: ${bgg.categories.join(", ")}`);
  if (bgg?.mechanics?.length) lines.push(`Mechanics: ${bgg.mechanics.join(", ")}`);
  if (bgg?.families?.length) lines.push(`BGG families: ${bgg.families.slice(0, 12).join(", ")}`);
  if (bgg?.designers?.length) lines.push(`Designers: ${bgg.designers.join(", ")}`);
  if (bgg?.minPlayers && bgg?.maxPlayers) {
    lines.push(`Players: ${bgg.minPlayers}–${bgg.maxPlayers} (best: ${bgg.bestPlayerCount ?? "?"})`);
  }
  if (bgg?.playingTime) lines.push(`Playing time: ~${bgg.playingTime} min`);
  if (bgg?.averageWeight) {
    lines.push(`BGG complexity weight: ${Number(bgg.averageWeight).toFixed(2)} / 5`);
  }
  if (bgg?.description) {
    lines.push(`Description: ${stripBggHtml(bgg.description).slice(0, 6000)}`);
  }
  lines.push(
    "",
    "Assign the six-trait skill weight vector for winning this game among friends.",
    "Weights must be integers in steps of 5, summing to exactly 100.",
    "Think about what actually decides who WINS, not what the theme suggests.",
  );
  return lines.join("\n");
}

async function generateWeights(entry, bgg) {
  const system = `You calibrate board games for a six-trait skill rating system.\n\n${TRAIT_DEFINITIONS}\n\n${CALIBRATION}`;
  const user = buildUserPrompt(entry, bgg);
  for (let attempt = 0; attempt < 2; attempt++) {
    const parsed = await structuredScriptCall({
      model: MODEL,
      system,
      user:
        attempt === 0
          ? user
          : `${user}\n\nREMINDER: the six integers MUST sum to exactly 100, in steps of 5.`,
      schemaName: "skill_weights",
      schema: WEIGHTS_SCHEMA,
    });
    if (validWeights(parsed)) return parsed;
    console.warn(`[gen-skills] ${entry.slug}: weights invalid (attempt ${attempt + 1}), retrying`);
  }
  return null;
}

async function main() {
  const args = process.argv.slice(2);
  const slugs = [];
  let placeholders = false;
  let dryRun = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--slug") slugs.push(args[++i]);
    else if (args[i] === "--placeholders") placeholders = true;
    else if (args[i] === "--dry-run") dryRun = true;
    else {
      console.error(`[gen-skills] unknown flag ${args[i]}`);
      process.exit(1);
    }
  }

  const catalog = JSON.parse(await readFile(CATALOG_PATH, "utf8"));
  const snapshot = JSON.parse(await readFile(SNAPSHOT_PATH, "utf8"));
  const isPlaceholder = (w) =>
    JSON.stringify(w) === JSON.stringify(PLACEHOLDER);
  const targets = catalog.filter((e) =>
    placeholders ? isPlaceholder(e.skills) : slugs.includes(e.slug),
  );
  if (targets.length === 0) {
    console.log("[gen-skills] nothing to do");
    return;
  }

  ensureAiUsable("gen-skills");

  let wrote = 0;
  let stoppedEarly = false;
  for (const entry of targets) {
    let weights;
    try {
      weights = await generateWeights(entry, snapshot[entry.slug]);
    } catch (err) {
      // A thrown call (gateway rate limit, network) would fail every later
      // slug too — bank the successes so far and let a rerun resume where
      // this one stopped (--placeholders is naturally idempotent).
      const msg = String(err?.message ?? err).split("\n")[0];
      console.error(`[gen-skills] ${entry.slug}: call failed (${msg}) — stopping, successes kept`);
      stoppedEarly = true;
      break;
    }
    if (!weights) {
      console.error(`[gen-skills] ${entry.slug}: FAILED — placeholder kept, fill by hand`);
      continue;
    }
    console.log(`[gen-skills] ${entry.slug}: ${JSON.stringify(weights)}`);
    if (!dryRun) {
      entry.skills = weights;
      wrote++;
    }
  }
  if (wrote > 0) {
    await writeFile(CATALOG_PATH, `${JSON.stringify(catalog, null, 2)}\n`);
    console.log(`[gen-skills] wrote ${wrote} vector(s) to ${CATALOG_PATH}`);
  }
  if (stoppedEarly) process.exit(1);
}

main().catch((err) => {
  console.error("[gen-skills] error:", err);
  process.exit(1);
});
