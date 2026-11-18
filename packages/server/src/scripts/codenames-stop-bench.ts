// The operative's stop bench: where should a guesser stop — at a fixed
// confidence floor, or where the race says (`core/.../ai/stop-rule.ts`)?
// Positions span the race (7 v 7 … 2 v 1) on seeded boards, each team's
// past turns of varied strength (so the opponent's rate differs). One clue per
// position (the Analyst's), then two arms, several samples each:
//   floor  — today's Mastermind operative: its prompt, stop below 0.35 (0.2 when desperate)
//   listed — the scored prompt: every candidate with an honest probability, the
//            stop decided afterwards — so ANY stop rule is scored offline on
//            the same lists (`--table`), paired by position.
// The value of a turn is the race model's win chance after it (our need,
// theirs, a hit assassin = 0), plus the raw counts.
//
//   cd packages/server
//   pnpm exec tsx src/scripts/codenames-stop-bench.ts                 # list positions (free)
//   pnpm exec tsx src/scripts/codenames-stop-bench.ts --yes --label=s1  # BILLS the model
//   pnpm exec tsx src/scripts/codenames-stop-bench.ts --table          # score every rule

import "../env.ts";
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ClueInput } from "@boardgames/core/games/codenames/ai/agent";
import { fallbackClue } from "@boardgames/core/games/codenames/ai/fallback";
import {
  beyondNumber,
  MEASURED_ODDS,
  observedRate,
  oddsOfListed,
  type PickOddsTables,
  picksToTake,
  type RaceTable,
  raceTable,
  type StopState,
} from "@boardgames/core/games/codenames/ai/stop-rule";
import {
  buildClueInput,
  buildGuessInput,
  settleClue,
} from "@boardgames/core/games/codenames/machine";
import {
  applyClue,
  applyEndTurn,
  applyGuess,
  createGame,
} from "@boardgames/core/games/codenames/rules";
import type { CodenamesState } from "@boardgames/core/games/codenames/types";
import { createRng } from "@boardgames/core/lib/rng";
import { guessListed, guessWith, llmCodenamesAgent, profileOf } from "../games/codenames-agent.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(HERE, "../../../../scratch/bench/codenames");
const OUT = resolve(OUT_DIR, "stop.jsonl");
const args = process.argv.slice(2);
const flag = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
const label = flag("label") ?? "stop";
const samples = Math.max(1, Number(flag("samples") ?? 3));
const parallel = Number(flag("parallel") ?? 4);
const only = flag("only");
/**
 * `--spymaster`: the clue comes from the Mastermind itself (an all-AI team) and
 * only today's operative guesses it — to compare spymaster settings (e.g.
 * CODENAMES_MASTER_RACE=0 v on) with `--compare=labelA,labelB`.
 */
const spymaster = args.includes("--spymaster");
/**
 * `--owed`: before the measured clue, a real clue of ours is left partly
 * unfound (its last 1–2 targets stay owed) and the other team plays a quiet
 * turn — the late-game spot where the old operative stopped short of owed words.
 */
const owedMode = args.includes("--owed");
/**
 * `--allin`: the second arm is today's operative with `desperate: "allin"`
 * (rank by relative likelihood, use every allowed guess when the other team
 * needs one) instead of the scored list. Score with the desperate summary in NOTES.
 */
const allinMode = args.includes("--allin");
const CLUE_TIER = spymaster ? ("codenames-expert" as const) : ("codenames-hard" as const);
const GUESS_TIER = "codenames-expert" as const;
const AI4 = [CLUE_TIER, CLUE_TIER, CLUE_TIER, CLUE_TIER];

/** `--seeds=a,b,…` for fresh boards (a held-out run); these by default. */
const SEEDS = flag("seeds")?.split(",").map(Number) ?? [101, 202, 303, 404, 515, 626, 737, 848];
const STATES: [number, number][] = [
  [7, 7],
  [6, 3],
  [3, 6],
  [5, 5],
  [4, 4],
  [4, 2],
  [2, 4],
  [3, 3],
  [5, 1],
  [3, 1],
  [2, 1],
  [2, 2],
  [3, 2],
];

/** A turn that finds `n` of the team's agents and stops (n = 0: straight into a bystander). */
function quietTurn(state: CodenamesState, n: number, turn: number): CodenamesState {
  const team = state.currentTeam;
  let s = applyClue(state, team, { word: `zq${"x".repeat(turn + 1)}`, count: Math.max(1, n) });
  const own = s.key.flatMap((k, i) => (k === team && !s.revealed[i] ? [i] : []));
  for (const card of own.slice(0, n)) s = applyGuess(s, 2 + team, card);
  if (n === 0) {
    const bystander = s.key.findIndex((k, i) => k === "bystander" && !s.revealed[i]);
    if (bystander === -1) throw new Error("no bystander left");
    return applyGuess(s, 2 + team, bystander);
  }
  if (s.phase === "guessing" && s.currentTeam === team) s = applyEndTurn(s, 2 + team);
  return s;
}

const needOf = (s: CodenamesState, team: 0 | 1) =>
  s.key.filter((k, i) => k === team && !s.revealed[i]).length;

interface Position {
  id: string;
  state: CodenamesState;
}

/** Team 0 to move needing `a`, team 1 needing `b`, reached by turns of random strength. */
function position(seed: number, a: number, b: number): Position | null {
  let s = createGame({ seed, ai: AI4, language: "en", clueTimerSec: 0, guessTimerSec: 0 });
  const rng = createRng(seed * 31 + a * 7 + b);
  const step = [1 + Math.floor(rng() * 3), 1 + Math.floor(rng() * 3)];
  for (let turn = 0; turn < 40; turn++) {
    if (s.phase === "over") return null;
    const t = s.currentTeam;
    if (t === 0 && needOf(s, 0) === a && needOf(s, 1) === b)
      return { id: `${seed}-${a}v${b}`, state: s };
    const left = needOf(s, t) - (t === 0 ? a : b);
    const n = left <= 0 ? 0 : Math.max(1, Math.min(left, (step[t] ?? 2) - (rng() < 0.3 ? 1 : 0)));
    try {
      s = quietTurn(s, n, turn);
    } catch {
      return null;
    }
  }
  return null;
}

function positions(): Position[] {
  const wanted: [number, number][] = flag("states")
    ? (flag("states") ?? "").split(",").map((st) => st.split("v").map(Number) as [number, number])
    : STATES;
  const all = SEEDS.flatMap((seed) =>
    wanted.map(([a, b]) => position(seed, a, b)).filter((p): p is Position => p !== null),
  );
  const states = flag("states")?.split(",");
  let done = new Set<string>();
  try {
    done = new Set(
      readFileSync(OUT, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((l) => JSON.parse(l) as { label: string; id: string })
        .filter((r) => r.label === label)
        .map((r) => r.id),
    );
  } catch {
    // No results yet.
  }
  return all
    .filter((p) => !only || p.id.includes(only))
    .filter((p) => !states || states.some((st) => p.id.endsWith(`-${st}`)))
    .filter((p) => !done.has(p.id));
}

type Kind = "own" | "opponent" | "bystander" | "assassin";
const kindOf = (s: CodenamesState, card: number): Kind => {
  const k = s.key[card];
  return k === s.currentTeam
    ? "own"
    : k === "assassin"
      ? "assassin"
      : k === "bystander"
        ? "bystander"
        : "opponent";
};

/** A real clue of ours whose last `owe` targets stay face down, then a quiet turn of theirs. */
async function leaveOwed(state: CodenamesState, seed: number): Promise<CodenamesState | null> {
  const input: ClueInput = { ...buildClueInput(state), model: CLUE_TIER, operatives: [GUESS_TIER] };
  const out = await llmCodenamesAgent.giveClue(input);
  const settled = settleClue(
    out,
    {
      words: state.words,
      faceDown: (c) => state.revealed[c] === false,
      ours: (c) => state.key[c] === 0,
      language: state.language,
    },
    () => fallbackClue(input),
  );
  const targets = (settled.note?.targets ?? []).filter((c) => state.key[c] === 0);
  if (targets.length < 2) return null;
  const owe = Math.min(targets.length - 1, 1 + (seed % 2));
  let s = applyClue(state, 0, settled.clue, settled.note);
  for (const card of targets.slice(0, targets.length - owe)) s = applyGuess(s, 2, card);
  if (s.phase === "guessing" && s.currentTeam === 0) s = applyEndTurn(s, 2);
  if (s.phase !== "clue" || s.currentTeam !== 1) return null;
  s = quietTurn(s, 1, 20);
  return s.phase === "clue" && s.currentTeam === 0 ? s : null;
}

/**
 * `--resample=<label>`: the positions and clues of an earlier run, guessed
 * again (fresh samples) — a held-out test for odds fitted on that run.
 */
const resample = flag("resample");
const storedClues = new Map<string, { word: string; count: number | "unlimited" }>();
if (resample) {
  for (const line of readFileSync(OUT, "utf8").split("\n").filter(Boolean)) {
    const r = JSON.parse(line) as { label: string; id: string; clue: string };
    if (r.label !== resample) continue;
    const parts = r.clue.split(" ");
    const c = parts.pop() ?? "1";
    storedClues.set(r.id, {
      word: parts.join(" ").toLowerCase(),
      count: /^\d+$/.test(c) ? Number(c) : "unlimited",
    });
  }
}

async function bench(p: Position) {
  const start = owedMode ? await leaveOwed(p.state, Number(p.id.split("-")[0])) : p.state;
  if (!start) {
    console.log(`${p.id} skipped (no clue to leave owed)`);
    return;
  }
  const input: ClueInput = {
    ...buildClueInput(start),
    model: CLUE_TIER,
    operatives: [GUESS_TIER],
  };
  const stored = storedClues.get(p.id);
  if (resample && !stored) return;
  const clue = stored ?? (await llmCodenamesAgent.giveClue(input));
  const s = applyClue(start, 0, { word: clue.word, count: clue.count });
  const gi = buildGuessInput(s);
  const base = profileOf(GUESS_TIER);
  const [floor, listed, allin] = await Promise.all([
    Promise.all(
      Array.from({ length: samples }, () =>
        guessWith(gi, base).then((g) => g.picks.map((card) => ({ card, kind: kindOf(s, card) }))),
      ),
    ),
    Promise.all(
      Array.from({ length: spymaster || allinMode ? 0 : samples }, () =>
        guessListed(gi, { ...base, stop: "score" }).then((g) =>
          g.listed.map((l) => ({
            card: l.index,
            p: l.confidence,
            kind: kindOf(s, l.index),
            earlier: l.earlier,
          })),
        ),
      ),
    ),
    Promise.all(
      Array.from({ length: allinMode ? samples : 0 }, () =>
        guessWith(gi, { ...base, desperate: "allin" }).then((g) =>
          g.picks.map((card) => ({ card, kind: kindOf(s, card) })),
        ),
      ),
    ),
  ]);
  const row = {
    label,
    id: p.id,
    clue: `${clue.word.toUpperCase()} ${clue.count}`,
    need: gi.agentsLeft,
    opp: gi.opponentAgentsLeft ?? 0,
    faceDown: gi.words.length,
    rates: { us: observedRate(gi.history, "us"), them: observedRate(gi.history, "them") },
    floor,
    listed,
    ...(allinMode ? { allin } : {}),
    at: new Date().toISOString(),
  };
  appendFileSync(OUT, `${JSON.stringify(row)}\n`);
  const short = (xs: { kind: Kind }[]) => xs.map((x) => x.kind[0]).join("");
  console.log(
    `${p.id.padEnd(10)} ${row.clue.padEnd(16)} floor [${floor.map(short).join(" ")}]  allin [${allin.map(short).join(" ")}]  listed [${listed.map((l) => l.map((x) => `${x.kind[0]}${x.p.toFixed(2).slice(1)}`).join(",")).join(" | ")}]`,
  );
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

type Row = {
  label: string;
  id: string;
  need: number;
  opp: number;
  faceDown: number;
  rates: { us: number; them: number };
  floor: { card: number; kind: Kind }[][];
  listed: { card: number; p: number; kind: Kind; earlier?: boolean }[][];
};

/** The win chance after the turn: the picks taken in order until the first miss. */
function turnValue(kinds: Kind[], r: Row, table: RaceTable) {
  let need = r.need;
  let opp = r.opp;
  let found = 0;
  let end: Kind | "stopped" = "stopped";
  for (const k of kinds) {
    if (k === "own") {
      need--;
      found++;
      if (need === 0) return { w: 1, found, end: "won" as const };
      continue;
    }
    end = k;
    if (k === "assassin") return { w: 0, found, end };
    if (k === "opponent") opp--;
    break;
  }
  return { w: table.theirMove(need, opp), found, end };
}

type Rule = { name: string; take: (l: Row["listed"][number], r: Row, t: RaceTable) => number };

function floorRule(f: number, desperate = 0.2): Rule["take"] {
  return (l, r) => {
    const floor = r.opp <= 1 && r.need > 0 ? desperate : f;
    const i = l.findIndex((x, j) => j > 0 && x.p < floor);
    return i === -1 ? l.length : i;
  };
}

const countOf = (r: Row & { clue?: string }): number | "unlimited" => {
  const c = r.clue?.split(" ").at(-1) ?? "";
  return /^\d+$/.test(c) ? Number(c) : "unlimited";
};

function scoreRule(odds: PickOddsTables): Rule["take"] {
  return (l, r, t) => {
    const state: StopState = {
      need: r.need,
      opponentNeed: r.opp,
      faceDown: r.faceDown,
      assassins: 1,
    };
    const count = countOf(r);
    return picksToTake(
      oddsOfListed(
        l.map((x) => ({ confidence: x.p, earlier: x.earlier })),
        count,
        odds,
      ),
      state,
      t,
    );
  };
}

/** Each band's measured outcomes (2nd+ listed words), within and past the number, smoothed. */
function fitOdds(rows: Row[]): PickOddsTables {
  const fit = (beyond: boolean) => {
    const edges = MEASURED_ODDS.within.map((b) => b.from);
    const counts = edges.map(() => ({ own: 1, bystander: 1, opponent: 0.5, assassin: 0.25 }));
    for (const r of rows) {
      const count = countOf(r);
      for (const l of r.listed) {
        let forThis = 0;
        for (const [i, x] of l.entries()) {
          const past = !x.earlier && beyondNumber(forThis, count);
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
        odds: {
          own: c.own / n,
          bystander: c.bystander / n,
          opponent: c.opponent / n,
          assassin: c.assassin / n,
        },
      };
    });
  };
  return { within: fit(false), beyond: fit(true) };
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
  if (flag("label")) rows = rows.filter((r) => r.label === label);
  // Odds fitted out of fold: each seed's rows are scored with a fit on the other seeds.
  const seedOf = (r: Row) => r.id.split("-")[0];
  const oddsFor = new Map<string, PickOddsTables>();
  for (const sd of new Set(rows.map(seedOf)))
    oddsFor.set(sd, fitOdds(rows.filter((r) => seedOf(r) !== sd)));
  const fitted = fitOdds(rows);
  for (const [side, table] of Object.entries(fitted))
    for (const band of table)
      console.log(
        `  ${side.padEnd(6)} p ≥ ${band.from.toFixed(2)}: own ${band.odds.own.toFixed(2)} bys ${band.odds.bystander.toFixed(2)} opp ${band.odds.opponent.toFixed(2)} ass ${band.odds.assassin.toFixed(2)}`,
      );

  const neutral = raceTable({ us: 1.8, them: 1.8 });
  const rules: {
    name: string;
    arm: "floor" | "listed";
    take?: Rule["take"];
    oof?: boolean;
  }[] = [
    { name: "today (floor arm)", arm: "floor" },
    { name: "listed + floor .35", arm: "listed", take: floorRule(0.35) },
    { name: "listed + floor .55", arm: "listed", take: floorRule(0.55) },
    { name: "listed + score (frozen)", arm: "listed", take: scoreRule(MEASURED_ODDS) },
    { name: "listed + score (oof)", arm: "listed", oof: true },
  ];
  const perRule = rules.map((rule) => {
    const perPos = rows.map((r) => {
      const t = raceTable(r.rates);
      const take = rule.oof ? scoreRule(oddsFor.get(seedOf(r)) ?? MEASURED_ODDS) : rule.take;
      const turns =
        rule.arm === "floor"
          ? r.floor.map((f) => f.map((x) => x.kind))
          : r.listed.map((l) => l.slice(0, take?.(l, r, t) ?? l.length).map((x) => x.kind));
      const vals = turns.map((k) => ({
        own: turnValue(k, r, t),
        neutral: turnValue(k, r, neutral),
      }));
      const mean = (f: (v: (typeof vals)[number]) => number) =>
        vals.reduce((s, v) => s + f(v), 0) / Math.max(1, vals.length);
      return {
        w: mean((v) => v.own.w),
        wNeutral: mean((v) => v.neutral.w),
        found: mean((v) => v.own.found),
        ass: mean((v) => (v.own.end === "assassin" ? 1 : 0)),
        opp: mean((v) => (v.own.end === "opponent" ? 1 : 0)),
        won: mean((v) => (v.own.end === "won" ? 1 : 0)),
      };
    });
    return { rule, perPos };
  });
  const base = perRule[0]?.perPos ?? [];
  const sameLists = perRule[1]?.perPos ?? [];
  console.log(`${rows.length} positions (label ${flag("label") ?? "all"})`);
  console.log(
    "rule                      win%   Δ vs today (t)  Δ v same-list floor (t)  neutral Δ (t)    found  assassin  opp-card  won-now",
  );
  for (const { rule, perPos } of perRule) {
    const diff = perPos.map((p, i) => p.w - (base[i]?.w ?? 0));
    const diffN = perPos.map((p, i) => p.wNeutral - (base[i]?.wNeutral ?? 0));
    const diffL = perPos.map((p, i) => p.w - (sameLists[i]?.w ?? 0));
    const stat = (d: number[]) => {
      const m = d.reduce((s, x) => s + x, 0) / d.length;
      const sd = Math.sqrt(d.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, d.length - 1));
      return `${(100 * m >= 0 ? "+" : "") + (100 * m).toFixed(2)} (${(m / (sd / Math.sqrt(d.length) || 1)).toFixed(2)})`;
    };
    const avg = (f: (p: (typeof perPos)[number]) => number) =>
      perPos.reduce((s, p) => s + f(p), 0) / perPos.length;
    console.log(
      [
        rule.name.padEnd(23),
        (100 * avg((p) => p.w)).toFixed(1).padStart(6),
        stat(diff).padStart(16),
        stat(diffL).padStart(22),
        stat(diffN).padStart(16),
        avg((p) => p.found)
          .toFixed(2)
          .padStart(7),
        `${(100 * avg((p) => p.ass)).toFixed(1)}%`.padStart(9),
        `${(100 * avg((p) => p.opp)).toFixed(1)}%`.padStart(9),
        `${(100 * avg((p) => p.won)).toFixed(1)}%`.padStart(8),
      ].join(" "),
    );
  }
}

/** Two labels' "today" arms, paired by position: the spymaster settings compared. */
function compare(a: string, b: string) {
  const rows = readFileSync(OUT, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Row & { clue: string });
  const by = (l: string) => new Map(rows.filter((r) => r.label === l).map((r) => [r.id, r]));
  const A = by(a);
  const B = by(b);
  const ids = [...A.keys()].filter((id) => B.has(id));
  const score = (r: Row) => {
    const t = raceTable(r.rates);
    const vals = r.floor.map((f) =>
      turnValue(
        f.map((x) => x.kind),
        r,
        t,
      ),
    );
    const m = (f: (v: (typeof vals)[number]) => number) =>
      vals.reduce((s, v) => s + f(v), 0) / Math.max(1, vals.length);
    return {
      w: m((v) => v.w),
      found: m((v) => v.found),
      won: m((v) => (v.end === "won" ? 1 : 0)),
      ass: m((v) => (v.end === "assassin" ? 1 : 0)),
      opp: m((v) => (v.end === "opponent" ? 1 : 0)),
    };
  };
  const diffs: number[] = [];
  const byState = new Map<string, number[][]>();
  const totals = { a: [0, 0, 0, 0, 0], b: [0, 0, 0, 0, 0] };
  for (const id of ids) {
    const ra = A.get(id) as Row & { clue: string };
    const rb = B.get(id) as Row & { clue: string };
    const sa = score(ra);
    const sb = score(rb);
    diffs.push(sb.w - sa.w);
    const st = id.split("-")[1] ?? "";
    byState.set(st, [...(byState.get(st) ?? []), [sa.w, sb.w]]);
    for (const [i, v] of [sa.w, sa.found, sa.won, sa.ass, sa.opp].entries()) {
      totals.a[i] = (totals.a[i] ?? 0) + v;
    }
    for (const [i, v] of [sb.w, sb.found, sb.won, sb.ass, sb.opp].entries()) {
      totals.b[i] = (totals.b[i] ?? 0) + v;
    }
    if (flag("show"))
      console.log(
        `${id.padEnd(10)} ${ra.clue.padEnd(18)} ${(100 * sa.w).toFixed(0).padStart(4)}  ${rb.clue.padEnd(18)} ${(100 * sb.w).toFixed(0).padStart(4)}`,
      );
  }
  const n = ids.length;
  const mean = diffs.reduce((s, x) => s + x, 0) / n;
  const sd = Math.sqrt(diffs.reduce((s, x) => s + (x - mean) ** 2, 0) / Math.max(1, n - 1));
  console.log(`${n} positions paired: ${a} v ${b}`);
  const line = (name: string, t: number[]) =>
    console.log(
      `  ${name.padEnd(14)} win ${((100 * (t[0] ?? 0)) / n).toFixed(1)}%  found ${((t[1] ?? 0) / n).toFixed(2)}  won-now ${((100 * (t[2] ?? 0)) / n).toFixed(1)}%  assassin ${((100 * (t[3] ?? 0)) / n).toFixed(1)}%  opp-card ${((100 * (t[4] ?? 0)) / n).toFixed(1)}%`,
    );
  line(a, totals.a);
  line(b, totals.b);
  console.log(
    `  Δ win ${(100 * mean).toFixed(2)} pts, t = ${(mean / (sd / Math.sqrt(n))).toFixed(2)}`,
  );
  for (const [st, v] of byState)
    console.log(
      `    ${st.padEnd(5)} n=${v.length}  ${((100 * v.reduce((s, x) => s + (x[0] ?? 0), 0)) / v.length).toFixed(1)} → ${((100 * v.reduce((s, x) => s + (x[1] ?? 0), 0)) / v.length).toFixed(1)}`,
    );
}

if (args.includes("--table")) {
  table();
} else if (flag("compare")) {
  const [a, b] = (flag("compare") ?? "").split(",");
  compare(a ?? "", b ?? "");
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
