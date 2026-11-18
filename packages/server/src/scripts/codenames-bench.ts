// The Mastermind's position bench: the same board positions, clued by the
// Master spymaster under one configuration, each clue then guessed by three
// real AI operatives (Rookie, Analyst and Mastermind tiers) against the hidden
// key. What a clue is worth is what operatives actually find with it.
//
//   cd packages/server
//   pnpm exec tsx src/scripts/codenames-bench.ts                       # list the positions (free)
//   pnpm exec tsx src/scripts/codenames-bench.ts --yes --label=base    # run them (BILLS the model)
//   CODENAMES_MASTER_SECOND_CALL=0 pnpm exec tsx … --yes --label=no-second
//   pnpm exec tsx src/scripts/codenames-bench.ts --table               # compare every label run
//   … --yes --tier=codenames-hard --label=analyst                     # another tier (or `fallback`)
//
// The switches the agent reads (`games/codenames-agent.ts`):
// CODENAMES_MASTER_SLOTS / _SECOND_CALL / _MATCHED_READ ("0" = off),
// CODENAMES_CLUE_REASONING_EFFORT, CODENAMES_GUESS_REASONING_EFFORT.
// Results append to scratch/bench/codenames/results.jsonl; notes go in
// scratch/bench/codenames/NOTES.md.
//
// Positions: 12 seeded boards (8 English, 4 German) at three stages — the
// opening, the middle (each team three agents in) and the endgame race (two
// against two) — plus the production game whose Master clued 1s
// (`codenames-bench/game-63.json`) at each of Blue's turns. The guessers are
// people in the real game, so the spymaster is told a person will guess.

import "../env.ts";
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  ClueInput,
  GuessInput,
  SpymasterCardKind,
} from "@boardgames/core/games/codenames/ai/agent";
import { fallbackClue } from "@boardgames/core/games/codenames/ai/fallback";
import { isCodenamesModel } from "@boardgames/core/games/codenames/ai/models";
import { buildClueInput } from "@boardgames/core/games/codenames/machine";
import {
  applyClue,
  applyEndTurn,
  applyGuess,
  createGame,
} from "@boardgames/core/games/codenames/rules";
import type { CodenamesState, KeyEntry, Team } from "@boardgames/core/games/codenames/types";
import {
  type GuessProfile,
  guessWith,
  judgeProfiles,
  llmCodenamesAgent,
  profileOf,
} from "../games/codenames-agent.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(HERE, "../../../../scratch/bench/codenames");
const RESULTS = resolve(OUT_DIR, "results.jsonl");

const args = process.argv.slice(2);
const flag = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
const run = args.includes("--yes");
const label = flag("label") ?? "unnamed";
const only = flag("only");
const parallel = Number(flag("parallel") ?? 3);
/** The spymaster's tier (`codenames-medium` / `-hard` / `-expert`), or `fallback` for the keyless stand-in. */
const tier = flag("tier") ?? "codenames-expert";
/** How many times each judge guesses each clue: more samples, less noise (the mean is unchanged). */
const samples = Math.max(1, Number(flag("samples") ?? 1));
/**
 * Who guesses: `people` (default) — three guessers of different strength stand
 * in for a table of people; `ai` — an all-AI team: the spymaster's own tier
 * guesses, three independent times (the scenario of production game 63).
 */
const team = flag("team") === "ai" ? "ai" : "people";

const AI4 = ["codenames-expert", "codenames-expert", "codenames-expert", "codenames-expert"];

interface Position {
  id: string;
  state: CodenamesState;
}

/** A team finds `n` of its own agents, then stops — a quiet turn that moves the race along. */
function quietTurn(state: CodenamesState, n: number, turn: number): CodenamesState {
  const team = state.currentTeam;
  let s = applyClue(state, team, { word: `zq${"x".repeat(turn + 1)}`, count: n });
  const own = s.key.flatMap((k, i) => (k === team && !s.revealed[i] ? [i] : []));
  for (const card of own.slice(0, n)) s = applyGuess(s, 2 + team, card);
  if (s.phase === "guessing" && s.currentTeam === team) s = applyEndTurn(s, 2 + team);
  return s;
}

function seeded(seed: number, language: "en" | "de", stage: "open" | "mid" | "end"): Position {
  let s = createGame({ seed, ai: AI4, language, clueTimerSec: 0, guessTimerSec: 0 });
  const plan = stage === "open" ? [] : stage === "mid" ? [3, 3] : [3, 3, 3, 2];
  plan.forEach((n, i) => {
    s = quietTurn(s, n, i);
  });
  return { id: `${language}-${seed}-${stage}`, state: s };
}

/** Production game 63 rebuilt to just before each of the Master's (Blue's) clues. */
function game63(): Position[] {
  const g = JSON.parse(readFileSync(resolve(HERE, "codenames-bench/game-63.json"), "utf8")) as {
    language: "en";
    startingTeam: Team;
    words: string[];
    key: KeyEntry[];
    turns: {
      team: Team;
      clue: { word: string; count: number };
      guesses: { card: number; by: number }[];
    }[];
  };
  const fresh = createGame({
    seed: 1,
    ai: AI4,
    language: g.language,
    clueTimerSec: 0,
    guessTimerSec: 0,
  });
  let s: CodenamesState = {
    ...fresh,
    words: g.words,
    key: g.key,
    revealed: g.words.map(() => false),
    startingTeam: g.startingTeam,
    currentTeam: g.startingTeam,
    turns: [{ team: g.startingTeam, clue: null, guesses: [], end: null }],
  };
  const out: Position[] = [];
  g.turns.forEach((t, i) => {
    if (t.team === 1) out.push({ id: `game63-t${i}`, state: s });
    s = applyClue(s, t.team, t.clue);
    for (const guess of t.guesses) s = applyGuess(s, guess.by, guess.card);
    if (s.phase === "guessing" && s.currentTeam === t.team)
      s = applyEndTurn(s, t.guesses.at(-1)?.by ?? 2 + t.team);
  });
  return out;
}

function positions(): Position[] {
  const seeds: [number, "en" | "de"][] = [
    [101, "en"],
    [202, "en"],
    [303, "en"],
    [404, "en"],
    [505, "de"],
    [606, "de"],
  ];
  const stages = ["open", "mid", "end"] as const;
  const all = [
    ...seeds.flatMap(([seed, lang], i) => [
      seeded(seed, lang, stages[i % 3] ?? "open"),
      seeded(seed + 1, lang, stages[(i + 1) % 3] ?? "mid"),
    ]),
    ...game63(),
  ];
  return only ? all.filter((p) => p.id.includes(only)) : all;
}

/** What one operative finds with a clue: own agents in order, then how the turn ended. */
async function judge(
  input: ClueInput,
  clue: { word: string; count: number | "unlimited" },
  profile: GuessProfile,
) {
  const words = input.cards
    .filter((c) => !c.revealed)
    .map((c) => ({ index: c.index, word: c.word }));
  const guessInput: GuessInput = {
    model: "codenames-expert",
    mode: input.mode,
    language: input.language,
    words,
    clue,
    guessesLeft: typeof clue.count === "number" && clue.count > 0 ? clue.count + 1 : null,
    agentsLeft: input.agentsLeft,
    ...(input.opponentAgentsLeft !== undefined
      ? { opponentAgentsLeft: input.opponentAgentsLeft }
      : {}),
    history: input.history.map(({ intended: _secret, ...turn }) => turn),
  };
  const out = await guessWith(guessInput, profile);
  const kindOf = (card: number): SpymasterCardKind | undefined =>
    input.cards.find((c) => c.index === card)?.kind;
  let found = 0;
  let end: SpymasterCardKind | "stopped" = "stopped";
  for (const card of out.picks) {
    const kind = kindOf(card);
    if (kind === "own") {
      found++;
      continue;
    }
    end = kind ?? "stopped";
    break;
  }
  return { judge: profile.name, found, end, usd: out.cost?.usd ?? 0 };
}

async function bench(p: Position) {
  const input: ClueInput = {
    ...buildClueInput(p.state),
    ...(isCodenamesModel(tier) ? { model: tier } : {}),
    operatives: [team === "ai" && isCodenamesModel(tier) ? tier : null],
  };
  const started = Date.now();
  const clue = tier === "fallback" ? fallbackClue(input) : await llmCodenamesAgent.giveClue(input);
  const ms = Date.now() - started;
  const runs = await Promise.all(
    (team === "ai" && isCodenamesModel(tier)
      ? [profileOf(tier), profileOf(tier), profileOf(tier)]
      : judgeProfiles()
    ).map((p) => Promise.all(Array.from({ length: samples }, () => judge(input, clue, p)))),
  );
  // Per judge: the mean of its samples; ends from every sample.
  const judged = runs.map((rs) => ({
    found: rs.reduce((sum, j) => sum + j.found, 0) / rs.length,
    ends: rs.map((j) => j.end),
    usd: rs.reduce((sum, j) => sum + j.usd, 0),
  }));
  const row = {
    label,
    at: new Date().toISOString(),
    position: p.id,
    clue: `${clue.word.toUpperCase()} ${clue.count}`,
    count: clue.count === "unlimited" ? 9 : clue.count,
    tier,
    team,
    standIn: clue.reasoning === undefined,
    ms,
    clueUsd: clue.cost?.usd ?? 0,
    found: judged.reduce((sum, j) => sum + j.found, 0) / judged.length,
    ends: judged.flatMap((j) => j.ends),
    perJudge: judged.map((j) => j.found),
    judgeUsd: judged.reduce((sum, j) => sum + j.usd, 0),
    env: Object.fromEntries(
      Object.entries(process.env).filter(([k]) => k.startsWith("CODENAMES_")),
    ),
  };
  console.log(
    `${p.id.padEnd(16)} ${row.clue.padEnd(18)} found ${row.found.toFixed(2)}  ${row.ends.join("/").padEnd(26)} ${(ms / 1000).toFixed(1)}s $${row.clueUsd.toFixed(3)}`,
  );
  appendFileSync(RESULTS, `${JSON.stringify(row)}\n`);
  return row;
}

type Row = Awaited<ReturnType<typeof bench>>;

const pct = (n: number, d: number) => `${Math.round((100 * n) / Math.max(1, d))}%`;
const quantile = (xs: number[], q: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))] ?? 0;
};

function table() {
  let rows: Row[] = [];
  try {
    rows = readFileSync(RESULTS, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l) as Row);
  } catch {
    console.log("No results yet.");
    return;
  }
  const labels = [...new Set(rows.map((r) => r.label))];
  console.log(
    "label             n   found/clue  avg n  assassin  opponent  bystander  p50 s  p95 s  $/clue",
  );
  for (const l of labels) {
    const rs = rows.filter((r) => r.label === l);
    const ends = rs.flatMap((r) => r.ends);
    console.log(
      [
        l.padEnd(16),
        String(rs.length).padStart(3),
        (rs.reduce((s, r) => s + r.found, 0) / rs.length).toFixed(2).padStart(11),
        (rs.reduce((s, r) => s + r.count, 0) / rs.length).toFixed(2).padStart(6),
        pct(ends.filter((e) => e === "assassin").length, ends.length).padStart(9),
        pct(ends.filter((e) => e === "opponent").length, ends.length).padStart(9),
        pct(ends.filter((e) => e === "bystander").length, ends.length).padStart(10),
        (
          quantile(
            rs.map((r) => r.ms),
            0.5,
          ) / 1000
        )
          .toFixed(1)
          .padStart(6),
        (
          quantile(
            rs.map((r) => r.ms),
            0.95,
          ) / 1000
        )
          .toFixed(1)
          .padStart(6),
        (rs.reduce((s, r) => s + r.clueUsd, 0) / rs.length).toFixed(3).padStart(7),
        rs.every((r) => Array.isArray(r.perJudge))
          ? `  ${[0, 1, 2].map((j) => (rs.reduce((s, r) => s + (r.perJudge?.[j] ?? 0), 0) / rs.length).toFixed(2)).join(" / ")}`
          : "",
      ].join(" "),
    );
  }
}

if (args.includes("--table")) {
  table();
} else {
  const list = positions();
  if (!run) {
    console.log(`${list.length} positions (add --yes to run them; it bills the model):`);
    for (const p of list) console.log(`  ${p.id}  needs ${buildClueInput(p.state).agentsLeft}`);
  } else {
    mkdirSync(OUT_DIR, { recursive: true });
    console.log(`bench "${label}" on ${list.length} positions, ${parallel} at a time`);
    const queue = [...list];
    await Promise.all(
      Array.from({ length: parallel }, async () => {
        for (let p = queue.shift(); p; p = queue.shift()) {
          await bench(p).catch((err: unknown) => console.error(`${p.id} failed:`, err));
        }
      }),
    );
    table();
  }
}
