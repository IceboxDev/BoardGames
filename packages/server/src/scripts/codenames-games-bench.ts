// Whole-game bench for a spymaster tier: full games against a Scout team, our
// operative one of the three fixed "people" guessers (`judgeProfiles`, rotated
// per game). It counts what the position bench can't: a clue's leftovers
// collected by the +1 guess on later turns. Metric: our agents found by our
// guesses ÷ the clues we gave, over whole games.
//
//   cd packages/server
//   pnpm exec tsx src/scripts/codenames-games-bench.ts --yes --games=3 --label=g1   # BILLS the model
//
// Results append to scratch/bench/codenames/games.jsonl.

import "../env.ts";
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ClueInput } from "@boardgames/core/games/codenames/ai/agent";
import { fallbackClue } from "@boardgames/core/games/codenames/ai/fallback";
import type { CodenamesAiModel } from "@boardgames/core/games/codenames/ai/models";
import {
  buildClueInput,
  buildGuessInput,
  settleClue,
} from "@boardgames/core/games/codenames/machine";
import {
  applyClue,
  applyEndTurn,
  applyGuess,
  canGuess,
  createGame,
} from "@boardgames/core/games/codenames/rules";
import type { CodenamesState } from "@boardgames/core/games/codenames/types";
import {
  type GuessProfile,
  guessWith,
  judgeProfiles,
  llmCodenamesAgent,
  profileOf,
} from "../games/codenames-agent.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(HERE, "../../../../scratch/bench/codenames");
const args = process.argv.slice(2);
const flag = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
const games = Number(flag("games") ?? 3);
const label = flag("label") ?? "games";
const tier = (flag("tier") ?? "codenames-expert") as CodenamesAiModel;
const OPPONENT: CodenamesAiModel = "codenames-medium";
/** `ai`: our operative is the tier's own AI (an all-AI team); else the people guessers rotate. */
const aiTeam = flag("team") === "ai";
const SEEDS = [911, 922, 933, 944, 955, 966, 977, 988, 999];

/** Red (seats 0/2) is ours; Blue (1/3) the Scout team. */
async function play(seed: number, guesser: GuessProfile) {
  let s: CodenamesState = createGame({
    seed,
    ai: [tier, OPPONENT, tier, OPPONENT],
    language: "en",
    clueTimerSec: 0,
    guessTimerSec: 0,
  });
  let clues = 0;
  let found = 0;
  let usd = 0;
  const log: string[] = [];
  for (let turn = 0; turn < 40 && s.phase !== "over"; turn++) {
    const team = s.currentTeam;
    const ours = team === 0;
    const input: ClueInput = {
      ...buildClueInput(s),
      model: ours ? tier : OPPONENT,
      operatives: [ours ? (aiTeam ? tier : null) : OPPONENT],
    };
    const out = await llmCodenamesAgent.giveClue(input);
    if (ours) usd += out.cost?.usd ?? 0;
    const settled = settleClue(
      out,
      {
        words: s.words,
        faceDown: (c) => s.revealed[c] === false,
        ours: (c) => s.key[c] === s.currentTeam,
        language: s.language,
      },
      () => fallbackClue(input),
    );
    s = applyClue(s, team, settled.clue, settled.note);
    const g = await guessWith(buildGuessInput(s), ours ? guesser : profileOf(OPPONENT));
    if (ours) usd += g.cost?.usd ?? 0;
    let got = 0;
    for (const card of g.picks) {
      if (s.phase !== "guessing" || s.currentTeam !== team || !canGuess(s, 2 + team)) break;
      if (s.revealed[card]) continue;
      s = applyGuess(s, 2 + team, card);
      if (ours && s.key[card] === 0) got++;
    }
    if (s.phase === "guessing" && s.currentTeam === team && canGuess(s, 2 + team)) {
      try {
        s = applyEndTurn(s, 2 + team);
      } catch {
        // No touch yet: the turn ends on its own rules.
      }
    }
    if (ours) {
      clues++;
      found += got;
      log.push(`${settled.clue.word.toUpperCase()} ${settled.clue.count}→${got}`);
    }
  }
  const won = s.result?.winner === 0;
  return { clues, found, won, usd, log };
}

mkdirSync(OUT_DIR, { recursive: true });
if (!args.includes("--yes")) {
  console.log(`${games} games of ${tier} v ${OPPONENT} (add --yes to run; it bills the model)`);
} else {
  const profiles = judgeProfiles();
  let clues = 0;
  let found = 0;
  for (let i = 0; i < games; i++) {
    const guesser = aiTeam ? profileOf(tier) : (profiles[i % profiles.length] as GuessProfile);
    const seed = SEEDS[i] ?? 1000 + i;
    const r = await play(seed, guesser);
    clues += r.clues;
    found += r.found;
    const row = { label, tier, seed, guesser: guesser.name, ...r, at: new Date().toISOString() };
    appendFileSync(resolve(OUT_DIR, "games.jsonl"), `${JSON.stringify(row)}\n`);
    console.log(
      `game ${i + 1} seed ${seed} ${guesser.name.padEnd(13)} ${r.won ? "WON " : "lost"} ${r.found}/${r.clues} = ${(r.found / Math.max(1, r.clues)).toFixed(2)}  $${r.usd.toFixed(2)}  ${r.log.join(", ")}`,
    );
  }
  console.log(
    `${label}: ${found} agents / ${clues} clues = ${(found / Math.max(1, clues)).toFixed(2)} per clue`,
  );
}
