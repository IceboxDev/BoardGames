// Duet's stop bench — the classic one's twin (`codenames-stop-bench.ts`). In
// Duet a guess has no number + 1 cap and every turn spends a token however it
// ends, so where to stop is the whole decision. Positions span the timer
// (tokens left) and the hunt (agents left) on seeded boards; one clue per
// position (the Analyst's), then two arms for the Mastermind's operative:
//   floor  — today: its prompt, stop below 0.35
//   listed — the scored prompt: every candidate with a probability; any stop
//            rule is scored offline on the same lists (`--table`), paired.
// A turn's value is the timer race's win chance after it (`duetTable`).
//
//   cd packages/server
//   pnpm exec tsx src/scripts/codenames-duet-stop-bench.ts --yes --label=d1   # BILLS the model
//   pnpm exec tsx src/scripts/codenames-duet-stop-bench.ts --table --label=d1
//   … --seeds=a,b,… for fresh boards; --frozen=<label>: score with odds fitted on that run

import "../env.ts";
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  duetPicksToTake,
  duetTable,
  MEASURED_ODDS,
  oddsOfListed,
  type PickOddsTables,
} from "@boardgames/core/games/codenames/ai/stop-rule";
import {
  buildDuetClueInput,
  buildDuetGuessInput,
} from "@boardgames/core/games/codenames-duet/machine";
import {
  agentsFound,
  agentsLeftOn,
  applyClue,
  applyEndTurn,
  applyGuess,
  createDuet,
  entryOn,
  judgedSide,
  partnerOf,
} from "@boardgames/core/games/codenames-duet/rules";
import type { DuetState } from "@boardgames/core/games/codenames-duet/types";
import { guessListed, guessWith, llmCodenamesAgent, profileOf } from "../games/codenames-agent.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(HERE, "../../../../scratch/bench/codenames");
const OUT = resolve(OUT_DIR, "duet-stop.jsonl");
const args = process.argv.slice(2);
const flag = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
const label = flag("label") ?? "duet";
const samples = Math.max(1, Number(flag("samples") ?? 3));
const parallel = Number(flag("parallel") ?? 4);
const CLUE_TIER = "codenames-hard" as const;
const GUESS_TIER = "codenames-expert" as const;
const SEEDS = flag("seeds")?.split(",").map(Number) ?? [11, 22, 33, 44, 55, 66, 77, 88];
/** [tokens left, distinct agents left]. */
const STATES: [number, number][] = [
  [8, 13],
  [7, 11],
  [6, 9],
  [5, 9],
  [5, 6],
  [4, 7],
  [4, 5],
  [3, 6],
  [3, 4],
  [2, 5],
  [2, 3],
  [1, 3],
];

type Kind = "own" | "bystander" | "assassin";

interface Position {
  id: string;
  state: DuetState;
}

/** A turn on `s` finding `n` of the giver's agents, then stopping. */
function quietTurn(s: DuetState, n: number, turn: number): DuetState {
  const giver = s.giver;
  const guesser = partnerOf(giver);
  let t = applyClue(s, giver, { word: `zq${"x".repeat(turn + 1)}`, count: Math.max(1, n) });
  const side = judgedSide(t);
  const agents = t.words
    .map((_, i) => i)
    .filter((i) => !t.found[i] && entryOn(t, side, i) === "agent");
  for (const card of agents.slice(0, n)) {
    if (t.phase !== "guessing") break;
    t = applyGuess(t, guesser, card);
  }
  if (t.phase === "guessing") t = applyEndTurn(t, guesser);
  return t;
}

function position(seed: number, tokens: number, agentsLeft: number): Position | null {
  let s = createDuet({
    seed,
    ai: [CLUE_TIER, CLUE_TIER],
    language: "en",
    timerTokens: 9,
    clueTimerSec: 0,
    guessTimerSec: 0,
  });
  const turns = 9 - tokens;
  for (let turn = 0; turn < turns; turn++) {
    if (s.phase !== "clue") return null;
    const left = 15 - agentsFound(s) - agentsLeft;
    const n = Math.max(1, Math.ceil(left / (turns - turn)));
    s = quietTurn(s, Math.min(n, agentsLeftOn(s, s.giver)), turn);
  }
  if (s.phase !== "clue" || s.tokens !== tokens) return null;
  if (15 - agentsFound(s) !== agentsLeft) return null;
  return { id: `${seed}-t${tokens}a${agentsLeft}`, state: s };
}

function positions(): Position[] {
  return SEEDS.flatMap((seed) =>
    STATES.map(([t, a]) => position(seed, t, a)).filter((p): p is Position => p !== null),
  );
}

async function bench(p: Position) {
  const input = { ...buildDuetClueInput(p.state), model: CLUE_TIER };
  const clue = await llmCodenamesAgent.giveClue(input);
  const s = applyClue(p.state, p.state.giver, { word: clue.word, count: clue.count });
  const gi = buildDuetGuessInput(s);
  const side = judgedSide(s);
  const kindOf = (card: number): Kind => {
    const e = entryOn(s, side, card);
    return e === "agent" ? "own" : e;
  };
  const base = profileOf(GUESS_TIER);
  const [floor, listed] = await Promise.all([
    Promise.all(
      Array.from({ length: samples }, () =>
        guessWith(gi, base).then((g) => g.picks.map((card) => ({ card, kind: kindOf(card) }))),
      ),
    ),
    Promise.all(
      Array.from({ length: samples }, () =>
        guessListed(gi, { ...base, stop: "score" }).then((g) =>
          g.listed.map((l) => ({
            card: l.index,
            p: l.confidence,
            kind: kindOf(l.index),
            earlier: l.earlier,
          })),
        ),
      ),
    ),
  ]);
  const row = {
    label,
    id: p.id,
    clue: `${clue.word.toUpperCase()} ${clue.count}`,
    sideLeft: gi.agentsLeft,
    totalLeft: gi.totalAgentsLeft ?? gi.agentsLeft,
    tokens: gi.turnsLeft ?? 0,
    floor,
    listed,
    at: new Date().toISOString(),
  };
  appendFileSync(OUT, `${JSON.stringify(row)}\n`);
  const short = (xs: { kind: Kind }[]) =>
    xs.map((x) => (x.kind === "own" ? "o" : x.kind[0])).join("");
  console.log(
    `${p.id.padEnd(11)} ${row.clue.padEnd(16)} floor [${floor.map(short).join(" ")}]  listed [${listed.map((l) => l.map((x) => `${x.kind === "own" ? "o" : x.kind[0]}${x.p.toFixed(2).slice(1)}`).join(",")).join(" | ")}]`,
  );
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

type Row = {
  label: string;
  id: string;
  clue: string;
  sideLeft: number;
  totalLeft: number;
  tokens: number;
  floor: { card: number; kind: Kind }[][];
  listed: { card: number; p: number; kind: Kind; earlier?: boolean }[][];
};

const TABLE = duetTable(2);

function turnValue(kinds: Kind[], r: Row) {
  let left = r.totalLeft;
  let found = 0;
  for (const k of kinds) {
    if (k === "own") {
      left--;
      found++;
      if (left === 0) return { w: 1, found, end: "won" as const };
      continue;
    }
    if (k === "assassin") return { w: 0, found, end: "assassin" as const };
    return { w: TABLE(left, r.tokens - 1), found, end: "bystander" as const };
  }
  return { w: TABLE(left, r.tokens - 1), found, end: "stopped" as const };
}

const countOf = (r: Row): number | "unlimited" => {
  const c = r.clue.split(" ").at(-1) ?? "";
  return /^\d+$/.test(c) ? Number(c) : "unlimited";
};

/** Each band's outcomes for 2nd+ listed words, within and past the number. */
function fitOdds(rows: Row[]): PickOddsTables {
  const fit = (beyond: boolean) => {
    const edges = MEASURED_ODDS.within.map((b) => b.from);
    const counts = edges.map(() => ({ own: 1, bystander: 1, opponent: 0, assassin: 0.25 }));
    for (const r of rows) {
      const count = countOf(r);
      for (const l of r.listed) {
        let forThis = 0;
        for (const [i, x] of l.entries()) {
          const past = !x.earlier && count !== "unlimited" && forThis >= count;
          if (!x.earlier) forThis++;
          if (i === 0 || past !== beyond) continue;
          let b = 0;
          for (const [j, e] of edges.entries()) if (x.p >= e) b = j;
          const c = counts[b];
          if (c) c[x.kind]++;
        }
      }
    }
    return edges.map((from, j) => {
      const c = counts[j] ?? { own: 1, bystander: 1, opponent: 0, assassin: 0 };
      const n = c.own + c.bystander + c.opponent + c.assassin;
      return {
        from,
        odds: { own: c.own / n, bystander: c.bystander / n, opponent: 0, assassin: c.assassin / n },
      };
    });
  };
  return { within: fit(false), beyond: fit(true) };
}

function load(l: string): Row[] {
  try {
    return readFileSync(OUT, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((x) => JSON.parse(x) as Row)
      .filter((r) => r.label === l);
  } catch {
    return [];
  }
}

function table() {
  const rows = load(label);
  if (rows.length === 0) return console.log("No results yet.");
  const seedOf = (r: Row) => r.id.split("-")[0];
  const frozenFrom = flag("frozen");
  const frozen = frozenFrom ? fitOdds(load(frozenFrom)) : null;
  const oddsFor = new Map<string, PickOddsTables>();
  for (const sd of new Set(rows.map(seedOf)))
    oddsFor.set(sd, fitOdds(rows.filter((r) => seedOf(r) !== sd)));
  const fitted = frozen ?? fitOdds(rows);
  for (const [side, t] of Object.entries(fitted))
    for (const band of t)
      console.log(
        `  ${side.padEnd(6)} p ≥ ${band.from.toFixed(2)}: own ${band.odds.own.toFixed(2)} bys ${band.odds.bystander.toFixed(2)} ass ${band.odds.assassin.toFixed(2)}`,
      );
  const floorTake = (f: number) => (l: Row["listed"][number]) => {
    const i = l.findIndex((x, j) => j > 0 && x.p < f);
    return i === -1 ? l.length : i;
  };
  const scoreTake = (odds: PickOddsTables) => (l: Row["listed"][number], r: Row) =>
    duetPicksToTake(
      oddsOfListed(
        l.map((x) => ({ confidence: x.p, earlier: x.earlier })),
        countOf(r),
        odds,
      ),
      { sideLeft: r.sideLeft, totalLeft: r.totalLeft, tokens: r.tokens },
      TABLE,
    );
  const rules: {
    name: string;
    take?: (l: Row["listed"][number], r: Row) => number;
    oof?: boolean;
  }[] = [
    { name: "today (floor arm)" },
    { name: "listed + floor .35", take: floorTake(0.35) },
    { name: "listed + floor .2", take: floorTake(0.2) },
    { name: "listed + all", take: (l) => l.length },
    { name: frozen ? `listed + score (frozen ${frozenFrom})` : "listed + score (oof)", oof: true },
  ];
  const per = rules.map((rule) =>
    rows.map((r) => {
      const take = rule.oof
        ? scoreTake(frozen ?? oddsFor.get(seedOf(r)) ?? MEASURED_ODDS)
        : rule.take;
      const turns = take
        ? r.listed.map((l) => l.slice(0, take(l, r)).map((x) => x.kind))
        : r.floor.map((f) => f.map((x) => x.kind));
      const v = turns.map((k) => turnValue(k, r));
      const m = (f: (x: (typeof v)[number]) => number) =>
        v.reduce((s, x) => s + f(x), 0) / Math.max(1, v.length);
      return {
        w: m((x) => x.w),
        found: m((x) => x.found),
        ass: m((x) => (x.end === "assassin" ? 1 : 0)),
      };
    }),
  );
  const base = per[0] ?? [];
  const same = per[1] ?? [];
  const stat = (d: number[]) => {
    const m = d.reduce((s, x) => s + x, 0) / d.length;
    const sd = Math.sqrt(d.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, d.length - 1));
    return `${(100 * m >= 0 ? "+" : "") + (100 * m).toFixed(2)} (${(m / (sd / Math.sqrt(d.length) || 1)).toFixed(2)})`;
  };
  console.log(`${rows.length} positions (label ${label})`);
  console.log(
    "rule                                win%   Δ vs today (t)  Δ v same-list .35 (t)  found  assassin",
  );
  per.forEach((p, i) => {
    const avg = (f: (x: (typeof p)[number]) => number) =>
      p.reduce((s, x) => s + f(x), 0) / p.length;
    console.log(
      [
        (rules[i]?.name ?? "").padEnd(34),
        (100 * avg((x) => x.w)).toFixed(1).padStart(6),
        stat(p.map((x, j) => x.w - (base[j]?.w ?? 0))).padStart(16),
        stat(p.map((x, j) => x.w - (same[j]?.w ?? 0))).padStart(22),
        avg((x) => x.found)
          .toFixed(2)
          .padStart(6),
        `${(100 * avg((x) => x.ass)).toFixed(1)}%`.padStart(9),
      ].join(" "),
    );
  });
}

if (args.includes("--table")) {
  table();
} else {
  const list = positions();
  if (!args.includes("--yes")) {
    console.log(`${list.length} positions (add --yes to run; it bills the model):`);
    console.log(list.map((p) => p.id).join(" "));
  } else {
    mkdirSync(OUT_DIR, { recursive: true });
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
