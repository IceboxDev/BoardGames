// The ∞ agreement's bench: does "WORD ∞ = everything left is covered" get
// read that way? Whole games (our tier v a Scout team, as in
// codenames-games-bench.ts); each time our spymaster's clue comes out ∞ by the
// agreement (`closesTheBoard`), the same position is guessed both ways, paired:
// WORD ∞ and WORD <its number> (what the clue said before the agreement). Same
// clue word, same table, same guessers, several samples each.
//
//   cd packages/server
//   pnpm exec tsx src/scripts/codenames-infinity-bench.ts --yes --games=6 --label=inf1   # BILLS the model
//   … --team=ai          our operative is the tier's own AI (else the three "people" profiles)
//   … --table            summarise every run
//
// Results: scratch/bench/codenames/infinity.jsonl (one row per ∞ event).

import "../env.ts";
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ClueInput } from "@boardgames/core/games/codenames/ai/agent";
import { fallbackClue } from "@boardgames/core/games/codenames/ai/fallback";
import type { CodenamesAiModel } from "@boardgames/core/games/codenames/ai/models";
import { pendingTargets } from "@boardgames/core/games/codenames/ai/situation";
import type { ClueCount } from "@boardgames/core/games/codenames/clue-rules";
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
const OUT = resolve(OUT_DIR, "infinity.jsonl");
const args = process.argv.slice(2);
const flag = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
const games = Number(flag("games") ?? 6);
const label = flag("label") ?? "infinity";
const tier = (flag("tier") ?? "codenames-expert") as CodenamesAiModel;
const parallel = Number(flag("parallel") ?? 3);
const samples = Math.max(1, Number(flag("samples") ?? 2));
const aiTeam = flag("team") === "ai";
const OPPONENT: CodenamesAiModel = "codenames-medium";
const SEEDS = [911, 922, 933, 944, 955, 966, 977, 988, 999, 1009, 1010, 1011, 1012, 1013, 1014];

const guessers = (): GuessProfile[] =>
  aiTeam ? [profileOf(tier), profileOf(tier), profileOf(tier)] : judgeProfiles();

/** One guesser's turn on `s` (the clue already given): our agents in order, then how it ended. */
async function judge(s: CodenamesState, team: 0 | 1, profile: GuessProfile) {
  const g = await guessWith(buildGuessInput(s), profile);
  let t = s;
  let found = 0;
  let end = "stopped";
  for (const card of g.picks) {
    if (t.phase !== "guessing" || t.currentTeam !== team || !canGuess(t, 2 + team)) break;
    if (t.revealed[card]) continue;
    t = applyGuess(t, 2 + team, card);
    const kind = t.key[card];
    if (kind === team) {
      found++;
      continue;
    }
    end = kind === "assassin" ? "assassin" : kind === "bystander" ? "bystander" : "opponent";
    break;
  }
  return { found, end, usd: g.cost?.usd ?? 0 };
}

/** Both arms on the position before the clue: ∞ and the clue's own number. */
async function pair(
  before: CodenamesState,
  team: 0 | 1,
  word: string,
  number: number,
  input: ClueInput,
) {
  const arm = async (count: ClueCount) => {
    const s = applyClue(before, team, { word, count });
    const runs = await Promise.all(
      guessers().flatMap((p) => Array.from({ length: samples }, () => judge(s, team, p))),
    );
    return {
      found: runs.reduce((n, r) => n + r.found, 0) / runs.length,
      finished: runs.filter((r) => r.found >= input.agentsLeft).length / runs.length,
      ends: runs.map((r) => r.end),
      usd: runs.reduce((n, r) => n + r.usd, 0),
    };
  };
  const [inf, num] = await Promise.all([arm("unlimited"), arm(number)]);
  return { inf, num };
}

async function play(seed: number, game: number) {
  let s: CodenamesState = createGame({
    seed,
    ai: [tier, OPPONENT, tier, OPPONENT],
    language: "en",
    clueTimerSec: 0,
    guessTimerSec: 0,
  });
  const guesser = aiTeam ? profileOf(tier) : (judgeProfiles()[game % 3] as GuessProfile);
  const log: string[] = [];
  let events = 0;
  for (let turn = 0; turn < 40 && s.phase !== "over"; turn++) {
    const team = s.currentTeam;
    const ours = team === 0;
    const input: ClueInput = {
      ...buildClueInput(s),
      model: ours ? tier : OPPONENT,
      operatives: [ours ? (aiTeam ? tier : null) : OPPONENT],
    };
    const out = await llmCodenamesAgent.giveClue(input);
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
    if (ours && settled.clue.count === "unlimited" && (out.targets?.length ?? 0) > 0) {
      const owed = pendingTargets(input).reduce((n, p) => n + p.words.length, 0);
      const number = out.targets?.length ?? 1;
      const r = await pair(s, team, settled.clue.word, number, input);
      events++;
      const row = {
        label,
        tier,
        team: aiTeam ? "ai" : "people",
        seed,
        turn,
        clue: settled.clue.word.toUpperCase(),
        number,
        owed,
        agentsLeft: input.agentsLeft,
        opponentLeft: input.opponentAgentsLeft,
        ...r,
        at: new Date().toISOString(),
      };
      appendFileSync(OUT, `${JSON.stringify(row)}\n`);
      console.log(
        `  seed ${seed} t${turn} ${row.clue} ∞ (=${number} new + ${owed} owed of ${input.agentsLeft})  ∞: ${r.inf.found.toFixed(2)} found, ${pct(r.inf.finished)} finish [${r.inf.ends.join("/")}]   ${number}: ${r.num.found.toFixed(2)} found, ${pct(r.num.finished)} finish [${r.num.ends.join("/")}]`,
      );
    }
    s = applyClue(s, team, settled.clue, settled.note);
    const g = await guessWith(buildGuessInput(s), ours ? guesser : profileOf(OPPONENT));
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
    if (ours) log.push(`${settled.clue.word.toUpperCase()} ${settled.clue.count}→${got}`);
  }
  console.log(
    `game seed ${seed} ${s.result?.winner === 0 ? "WON " : "lost"} ${events} ∞ event(s): ${log.join(", ")}`,
  );
}

function pct(x: number) {
  return `${Math.round(100 * x)}%`;
}

interface Row {
  label: string;
  team: string;
  owed: number;
  agentsLeft: number;
  inf: { found: number; finished: number; ends: string[] };
  num: { found: number; finished: number; ends: string[] };
}

function table() {
  let rows: Row[] = [];
  try {
    rows = readFileSync(OUT, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l) as Row);
  } catch {
    console.log("No results yet.");
    return;
  }
  console.log(
    "label           group        n   ∞ found  ∞ finish  ∞ assassin |  N found  N finish  N assassin",
  );
  for (const l of [...new Set(rows.map((r) => r.label))]) {
    const mine = rows.filter((r) => r.label === l);
    const groups: [string, Row[]][] = [
      ["owed ≥ 1", mine.filter((r) => r.owed >= 1)],
      ["owed 0", mine.filter((r) => r.owed === 0)],
      ["all", mine],
    ];
    for (const [g, rs] of groups) {
      if (rs.length === 0) continue;
      const mean = (f: (r: Row) => number) => rs.reduce((n, r) => n + f(r), 0) / rs.length;
      const killed = (arm: "inf" | "num") => {
        const ends = rs.flatMap((r) => r[arm].ends);
        return pct(ends.filter((e) => e === "assassin").length / Math.max(1, ends.length));
      };
      console.log(
        [
          l.padEnd(15),
          g.padEnd(9),
          String(rs.length).padStart(4),
          mean((r) => r.inf.found)
            .toFixed(2)
            .padStart(9),
          pct(mean((r) => r.inf.finished)).padStart(9),
          killed("inf").padStart(11),
          " |",
          mean((r) => r.num.found)
            .toFixed(2)
            .padStart(7),
          pct(mean((r) => r.num.finished)).padStart(9),
          killed("num").padStart(11),
        ].join(" "),
      );
    }
  }
}

if (args.includes("--table")) {
  table();
} else if (!args.includes("--yes")) {
  console.log(
    `${games} games of ${tier} v ${OPPONENT}, ${aiTeam ? "an all-AI team" : "people guessers"} (add --yes to run; it bills the model)`,
  );
} else {
  mkdirSync(OUT_DIR, { recursive: true });
  const queue = Array.from({ length: games }, (_, i) => i);
  await Promise.all(
    Array.from({ length: parallel }, async () => {
      for (let i = queue.shift(); i !== undefined; i = queue.shift()) {
        await play(SEEDS[i] ?? 2000 + i, i).catch((err: unknown) =>
          console.error(`game ${i} failed:`, err),
        );
      }
    }),
  );
  table();
}
