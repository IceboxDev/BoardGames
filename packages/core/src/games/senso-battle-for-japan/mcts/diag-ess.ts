// Effective-sample-size diagnostic for the deal sampler (Phase 0 of the
// posterior-sampling plan). Plays Tenka self-play games and records, for every
// searched card decision, how many deals the root averaged over and how much
// of that weight survived the likelihood weighting. Not bundled.
//
//   tsx .../diag-ess.ts <players> <games> [budgetMs] [tenkaJson] [outJsonl]
//
// Prints median / p10 ESS by round and by round-third, plus deals, distinct
// deals and the sampler's acceptance rate — the numbers the sampler must move.
import { appendFileSync, writeFileSync } from "node:fs";
import { applyAction, createInitialState, settleTrick } from "../game-engine";
import { getActivePlayer, getLegalActions } from "../rules";
import type { GameState } from "../types";
import { configureTenka, DEFAULT_TENKA } from "./config";
import { TENKA } from "./index";
import { pickPlayTenka } from "./ismcts";

const [playersArg = "5", gamesArg = "10", budgetArg = "200", tenkaJson = "", out = ""] =
  process.argv.slice(2);
const players = Number(playersArg);
const games = Number(gamesArg);
configureTenka({ timeMs: Number(budgetArg) });
if (tenkaJson) configureTenka(JSON.parse(tenkaJson));
if (out) writeFileSync(out, "");

interface Row {
  n: number;
  game: number;
  round: number;
  trick: number;
  third: 0 | 1 | 2;
  plies: number;
  sampler: string;
  deals: number;
  ess: number;
  maxShare: number;
  distinct: number;
  accept: number;
  samplerMs: number;
  ms: number;
}

function phaseOf(s: GameState) {
  return s.phase;
}

const rows: Row[] = [];
for (let g = 0; g < games; g++) {
  const seed = (Math.imul(g + 1, 0x9e3779b1) ^ 0x5e750) >>> 0;
  const state = createInitialState(players, Array(players).fill("tenka"), seed, { log: false });
  let lines = "";
  while (phaseOf(state) !== "game-over") {
    if (phaseOf(state) === "trick-settle") {
      settleTrick(state);
      continue;
    }
    const seat = getActivePlayer(state);
    const legal = getLegalActions(state);
    let action = legal[0];
    if (phaseOf(state) === "trick") {
      const r = pickPlayTenka(state, legal, seat, DEFAULT_TENKA);
      action = r.action;
      if (r.stats.mode !== "forced") {
        // Position within the round: completed tricks over the round's trick count.
        const totalTricks =
          state.tricks.length + state.players.reduce((m, p) => Math.max(m, p.hand.length), 0);
        const third = Math.min(
          2,
          Math.floor((3 * state.tricks.length) / Math.max(1, totalTricks)),
        ) as 0 | 1 | 2;
        const row: Row = {
          n: players,
          game: g,
          round: state.round,
          trick: state.tricks.length,
          third,
          plies: state.tricks.reduce((m, t) => m + t.plays.length, 0) + state.table.length,
          sampler: r.stats.sampler,
          deals: r.stats.deals,
          ess: r.stats.ess,
          maxShare: r.stats.maxShare,
          distinct: r.stats.distinctDeals,
          accept: r.stats.accept,
          samplerMs: r.stats.samplerMs,
          ms: r.stats.ms,
        };
        rows.push(row);
        if (out) lines += `${JSON.stringify(row)}\n`;
      }
    } else {
      action = TENKA.pickAction(state, legal, seat);
    }
    applyAction(state, action);
  }
  if (out) appendFileSync(out, lines);
}

function q(xs: number[], p: number): number {
  if (xs.length === 0) return Number.NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
}
const fmt = (x: number) => (Number.isNaN(x) ? "  -  " : x.toFixed(1).padStart(6));
function line(label: string, set: Row[]) {
  const ess = set.map((r) => r.ess);
  const deals = set.map((r) => r.deals);
  const distinct = set.map((r) => r.distinct);
  const share = set.map((r) => r.maxShare);
  const acc = set.map((r) => r.accept);
  console.log(
    `${label.padEnd(14)} n=${String(set.length).padStart(5)} · ESS p10 ${fmt(q(ess, 0.1))} med ${fmt(q(ess, 0.5))} · deals med ${fmt(q(deals, 0.5))} distinct med ${fmt(q(distinct, 0.5))} · maxShare med ${q(share, 0.5).toFixed(3)} p90 ${q(share, 0.9).toFixed(3)} · accept med ${q(acc, 0.5).toFixed(2)}`,
  );
}
const searched = rows.filter((r) => r.sampler !== "none");
console.log(
  `${players}p · ${games} games · budget ${budgetArg} ms · ${DEFAULT_TENKA.sampler} sampler${tenkaJson ? ` · ${tenkaJson}` : ""} · ${searched.length} searched decisions`,
);
line("all", searched);
for (const third of [0, 1, 2] as const) {
  line(
    `round-third ${third}`,
    searched.filter((r) => r.third === third),
  );
}
for (let round = 1; round <= 8; round++) {
  line(
    `round ${round}`,
    searched.filter((r) => r.round === round),
  );
}
line(
  "plies ≥ 20",
  searched.filter((r) => r.plies >= 20),
);
line(
  "plies ≥ 30",
  searched.filter((r) => r.plies >= 30),
);
const samplerMs = searched.map((r) => r.samplerMs);
console.log(
  `sampler seed ms med ${q(samplerMs, 0.5).toFixed(1)} p90 ${q(samplerMs, 0.9).toFixed(1)} · decision ms med ${q(
    searched.map((r) => r.ms),
    0.5,
  ).toFixed(0)}`,
);
