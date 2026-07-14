/**
 * Dump seeded 7 Wonders games from the TS engine for C++ cross-validation.
 * Run: `pnpm tsx scripts/dump-7wonders-parity.ts`.
 *
 * Phase 1 (this file): deals only — a byte-for-byte check that the C++ setup
 * reproduces the TS shuffle/deal for a seed. Emitted as plain whitespace ints
 * (CardType ids in [...CARDS, ...GUILDS] order) to tests/fixtures/deals.txt.
 * Phase 8 extends this with full move-by-move game traces.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { CARDS, GUILDS } from "../packages/core/src/games/7-wonders/cards.ts";
import { EDIFICES } from "../packages/core/src/games/7-wonders/edifice.ts";
import {
  applyPendingAction,
  applyReveal,
  applySelection,
  createInitialState,
} from "../packages/core/src/games/7-wonders/game-engine.ts";
import { getActivePlayer, getLegalActions } from "../packages/core/src/games/7-wonders/rules.ts";
import { determineWinner, scoreFinal } from "../packages/core/src/games/7-wonders/scoring.ts";
import { cardIdName, WONDER_IDS } from "../packages/core/src/games/7-wonders/types.ts";
import type { CardId, SevenWondersAction } from "../packages/core/src/games/7-wonders/types.ts";
import { createRng } from "../packages/core/src/lib/rng.ts";

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "../cpp/seven-wonders/tests/fixtures");
mkdirSync(OUT, { recursive: true });

const ALL = [...CARDS, ...GUILDS];
function cardTypeId(id: CardId): number {
  const name = cardIdName(id);
  const age = Number.parseInt(id.slice(id.lastIndexOf("@") + 1), 10);
  const idx = ALL.findIndex((c) => c.name === name && c.age === age);
  if (idx < 0) throw new Error(`no CardType for ${id}`);
  return idx;
}
const edificeId = (name: string) => {
  const i = EDIFICES.findIndex((e) => e.name === name);
  if (i < 0) throw new Error(`no edifice ${name}`);
  return i;
};

const PLAYERS = 5;
const seeds: Array<{ seed: number; sideMode: 0 | 1 | 2; edifice: boolean }> = [];
for (let s = 1; s <= 200; s++) {
  seeds.push({ seed: s * 2654435761, sideMode: 2, edifice: s % 2 === 0 });
}

const out: number[] = [seeds.length];
for (const { seed, sideMode, edifice } of seeds) {
  const modeStr = sideMode === 0 ? "A" : sideMode === 1 ? "B" : "random";
  const st = createInitialState({ playerCount: PLAYERS, seed, sideMode: modeStr, edifice });
  out.push(seed >>> 0, sideMode, edifice ? 1 : 0);
  for (const p of st.players) out.push(WONDER_IDS.indexOf(p.wonderId), p.side === "A" ? 0 : 1);
  for (const hand of st.hands) for (const id of hand) out.push(cardTypeId(id));
  for (const id of st.ageDecks[2]) out.push(cardTypeId(id));
  for (const id of st.ageDecks[3]) out.push(cardTypeId(id));
  if (edifice && st.edifices) out.push(...st.edifices.map((e) => edificeId(e.card)));
  else out.push(-1, -1, -1);
}

writeFileSync(resolve(OUT, "deals.txt"), out.join("\n") + "\n");
console.log(`Wrote ${seeds.length} deals -> ${resolve(OUT, "deals.txt")}`);

// ── Phase 2: full game traces (canonical legal set + chosen + final scores) ──
// Canonical action = [code, cardTypeId, left, right, participate], engine-neutral
// so C++ (hand-index moves) and TS (cardId actions) produce identical tuples.
function canon(a: SevenWondersAction): [number, number, number, number, number] {
  const base = (
    x:
      | { type: "play-card"; cardId: CardId; payment: { kind: string; left?: number; right?: number } }
      | { type: "build-wonder"; cardId: CardId; payment: { left: number; right: number }; participate?: boolean }
      | { type: "discard"; cardId: CardId },
    seventh: boolean,
  ): [number, number, number, number, number] => {
    const off = seventh ? 10 : 0;
    if (x.type === "discard") return [0 + off, cardTypeId(x.cardId), 0, 0, 0];
    if (x.type === "build-wonder")
      return [4 + off, cardTypeId(x.cardId), x.payment.left, x.payment.right, x.participate ? 1 : 0];
    // play-card
    if (x.payment.kind === "resources")
      return [1 + off, cardTypeId(x.cardId), x.payment.left ?? 0, x.payment.right ?? 0, 0];
    if (x.payment.kind === "chain") return [2 + off, cardTypeId(x.cardId), 0, 0, 0];
    return [3 + off, cardTypeId(x.cardId), 0, 0, 0]; // free-build
  };
  if (a.type === "pick-discard") return [5, cardTypeId(a.cardId), 0, 0, 0];
  if (a.type === "skip-pending") return [6, 0, 0, 0, 0];
  if (a.type === "play-seventh") return base(a.action, true);
  return base(a, false);
}

const traceSeeds: Array<{ seed: number; sideMode: 0 | 1 | 2; edifice: boolean }> = [];
for (let s = 1; s <= 150; s++) {
  traceSeeds.push({ seed: (s * 1013904223 + 12345) >>> 0, sideMode: 2, edifice: s % 2 === 0 });
}

const tr: number[] = [traceSeeds.length];
for (const { seed, sideMode, edifice } of traceSeeds) {
  const modeStr = sideMode === 0 ? "A" : sideMode === 1 ? "B" : "random";
  let st = createInitialState({ playerCount: PLAYERS, seed, sideMode: modeStr, edifice });
  const policy = createRng((seed ^ 0x5bd1e995) >>> 0);
  const decisions: number[] = [];
  let dcount = 0;

  const decide = (player: number) => {
    const legal = getLegalActions(st, player);
    const chosen = legal[Math.floor(policy() * legal.length)];
    decisions.push(player, legal.length);
    for (const a of legal) decisions.push(...canon(a));
    decisions.push(...canon(chosen));
    dcount++;
    return chosen;
  };

  while (st.phase !== "game-over") {
    if (st.phase === "selecting") {
      for (let i = 0; i < PLAYERS; i++)
        if (st.selections[i] === null) st = applySelection(st, i, decide(i));
      if (st.phase === "revealing") st = applyReveal(st);
    } else if (st.phase === "revealing") {
      st = applyReveal(st);
    } else {
      const ap = getActivePlayer(st);
      st = applyPendingAction(st, ap, decide(ap));
    }
  }

  const breakdowns = scoreFinal(st);
  const winner = determineWinner(st, breakdowns);
  tr.push(seed >>> 0, sideMode, edifice ? 1 : 0, dcount, ...decisions);
  for (const b of breakdowns) tr.push(b.total);
  tr.push(winner);
}

writeFileSync(resolve(OUT, "traces.txt"), tr.join("\n") + "\n");
console.log(`Wrote ${traceSeeds.length} game traces -> ${resolve(OUT, "traces.txt")}`);
