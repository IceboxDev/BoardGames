// ---------------------------------------------------------------------------
// FastRound — a mutable, allocation-free model of one round's trick phase.
//
// Tenka runs ~10k search iterations per decision; each iteration plays out a
// whole round. On `GameState` that costs ~0.4 ms (structuredClone-style copies,
// string card ids, re-enumerated legal lists). Here every card is an index
// into `FULL_DECK`, hands are an `owner` table, and apply/undo mutate typed
// arrays in place. Parity with the engine is pinned by fast-round.test.ts.
// ---------------------------------------------------------------------------

import type { Rng } from "../../../lib/rng";
import { reachableTier } from "../ai-tricks";
import { FULL_DECK } from "../deck";
import { RULINGS } from "../rulings";
import type { CardId, Clan, GameState } from "../types";
import { CLANS } from "../types";

export const N_CARDS = 54;
/** Card index → clan (suit) index in CLANS order; -1 for a Ninja. */
export const CARD_SUIT = new Int8Array(N_CARDS);
/** Card index → rank 2..14; 0 for a Ninja. */
export const CARD_RANK = new Uint8Array(N_CARDS);
export const CARD_ID: readonly CardId[] = FULL_DECK;
export const CARD_INDEX: Readonly<Record<string, number>> = Object.fromEntries(
  FULL_DECK.map((id, i) => [id, i]),
);
export const WOOD = CARD_INDEX["ninja-wood"];
export const JADE = CARD_INDEX["ninja-jade"];
for (let i = 0; i < N_CARDS; i++) {
  const id = FULL_DECK[i];
  if (id === "ninja-wood" || id === "ninja-jade") {
    CARD_SUIT[i] = -1;
    CARD_RANK[i] = 0;
  } else {
    const dash = id.indexOf("-");
    CARD_SUIT[i] = CLANS.indexOf(id.slice(0, dash) as Clan);
    CARD_RANK[i] = Number(id.slice(dash + 1));
  }
}

/** `owner[card]` values below 0. */
export const PLAYED = -2;
/** Not in the observer's hand and not played: a hidden card to be determinized. */
export const OUT = -3;

const UNDO_STRIDE = 5;
const MAX_PLIES = 5 * 13 + 2;

export interface FastRound {
  n: number;
  owner: Int8Array;
  handSize: Uint8Array;
  tricksWon: Uint8Array;
  trump: number;
  leader: number;
  turn: number;
  /** Cards on the table this trick, in play order (seat = (leader + i) % n). */
  table: Int8Array;
  tableLen: number;
  /** -1 while the table is empty or when a Ninja was led. */
  leadSuit: number;
  /** Total plies remaining in the round. */
  cardsLeft: number;
  undo: Int16Array;
  undoLen: number;
}

export function createFastRound(n: number): FastRound {
  return {
    n,
    owner: new Int8Array(N_CARDS).fill(OUT),
    handSize: new Uint8Array(n),
    tricksWon: new Uint8Array(n),
    trump: 0,
    leader: 0,
    turn: 0,
    table: new Int8Array(5),
    tableLen: 0,
    leadSuit: -1,
    cardsLeft: 0,
    undo: new Int16Array(UNDO_STRIDE * MAX_PLIES),
    undoLen: 0,
  };
}

/**
 * Build the observer's view of the current trick phase: `me`'s cards are
 * owned, played cards are PLAYED, everything else is OUT (to be dealt by
 * `redeterminize`). Hand sizes of the other seats are public.
 * With `me < 0` (a fully known state, e.g. tests) every hand is owned.
 */
export function fastFromState(state: GameState, me: number): FastRound {
  const f = createFastRound(state.players.length);
  f.trump = CLANS.indexOf(state.trumpSuit);
  f.leader = state.leader;
  f.turn = state.turn;
  f.leadSuit = state.leadSuit === null ? -1 : CLANS.indexOf(state.leadSuit);
  for (const card of state.played) f.owner[CARD_INDEX[card]] = PLAYED;
  state.players.forEach((p, seat) => {
    f.handSize[seat] = p.hand.length;
    f.tricksWon[seat] = p.tricksWon;
    f.cardsLeft += p.hand.length;
    if (me < 0 || seat === me) for (const card of p.hand) f.owner[CARD_INDEX[card]] = seat;
  });
  f.tableLen = state.table.length;
  state.table.forEach((play, i) => {
    f.table[i] = CARD_INDEX[play.card];
  });
  return f;
}

export function resetFrom(dst: FastRound, src: FastRound): void {
  dst.owner.set(src.owner);
  dst.handSize.set(src.handSize);
  dst.tricksWon.set(src.tricksWon);
  dst.trump = src.trump;
  dst.leader = src.leader;
  dst.turn = src.turn;
  dst.table.set(src.table);
  dst.tableLen = src.tableLen;
  dst.leadSuit = src.leadSuit;
  dst.cardsLeft = src.cardsLeft;
  dst.undoLen = 0;
}

export function cloneFast(src: FastRound): FastRound {
  const f = createFastRound(src.n);
  resetFrom(f, src);
  return f;
}

// ---------------------------------------------------------------------------
// Trick resolution
// ---------------------------------------------------------------------------

/** Winning power of a card in a trick with the given lead; -1 = cannot win. */
export function winKey(card: number, trump: number, leadSuit: number): number {
  if (card === JADE) return 300;
  if (card === WOOD) return 200;
  const suit = CARD_SUIT[card];
  if (suit === trump) return 100 + CARD_RANK[card];
  if (suit === leadSuit) return CARD_RANK[card];
  return -1;
}

/** Index into `table` of the current winner (the lead card wins by default). */
export function winningIndex(f: FastRound): number {
  let best = 0;
  let bestKey = -2;
  for (let i = 0; i < f.tableLen; i++) {
    const key = winKey(f.table[i], f.trump, f.leadSuit);
    if (key > bestKey) {
      bestKey = key;
      best = i;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Apply / undo
// ---------------------------------------------------------------------------

export function applyFast(f: FastRound, card: number): void {
  const seat = f.turn;
  const base = f.undoLen * UNDO_STRIDE;
  f.undo[base] = card;
  f.undo[base + 1] = seat;
  f.undo[base + 2] = f.leadSuit;
  f.undo[base + 3] = f.leader;
  f.undo[base + 4] = -1;
  f.undoLen++;

  f.owner[card] = PLAYED;
  f.handSize[seat]--;
  f.cardsLeft--;
  f.table[f.tableLen++] = card;
  if (f.tableLen === 1) f.leadSuit = CARD_SUIT[card];

  if (f.tableLen === f.n) {
    const winner = (f.leader + winningIndex(f)) % f.n;
    f.undo[base + 4] = winner;
    f.tricksWon[winner]++;
    f.leader = winner;
    f.turn = winner;
    f.tableLen = 0;
    f.leadSuit = -1;
  } else {
    f.turn = (seat + 1) % f.n;
  }
}

export function undoFast(f: FastRound): void {
  f.undoLen--;
  const base = f.undoLen * UNDO_STRIDE;
  const card = f.undo[base];
  const seat = f.undo[base + 1];
  const winner = f.undo[base + 4];
  if (winner >= 0) {
    f.tricksWon[winner]--;
    // Later plays (since undone) reused the table slots, so rebuild the
    // completed trick's earlier cards from their own undo records.
    f.tableLen = f.n - 1;
    const first = f.undoLen - f.tableLen;
    for (let i = 0; i < f.tableLen; i++) f.table[i] = f.undo[(first + i) * UNDO_STRIDE];
  } else {
    f.tableLen--;
  }
  f.leadSuit = f.undo[base + 2];
  f.leader = f.undo[base + 3];
  f.turn = seat;
  f.owner[card] = seat;
  f.handSize[seat]++;
  f.cardsLeft++;
}

// ---------------------------------------------------------------------------
// Legal moves and the one-card policy
// ---------------------------------------------------------------------------

/** Fill `buf` with the seat's legal cards; returns the count. */
export function legalInto(f: FastRound, seat: number, buf: Int8Array): number {
  let count = 0;
  if (f.leadSuit >= 0) {
    for (let c = 0; c < N_CARDS; c++) {
      if (f.owner[c] === seat && CARD_SUIT[c] === f.leadSuit) buf[count++] = c;
    }
    if (count > 0) {
      if (!RULINGS.ninjaFollowsSuit) {
        if (f.owner[WOOD] === seat) buf[count++] = WOOD;
        if (f.owner[JADE] === seat) buf[count++] = JADE;
      }
      return count;
    }
  }
  for (let c = 0; c < N_CARDS; c++) if (f.owner[c] === seat) buf[count++] = c;
  return count;
}

/** Card strength for tie-breaks (mirrors deck.cardStrength). */
export function strengthOf(card: number, trump: number): number {
  if (card === JADE) return 200;
  if (card === WOOD) return 100;
  return CARD_SUIT[card] === trump ? 50 + CARD_RANK[card] : CARD_RANK[card];
}

/**
 * Could a card that currently wins the trick still be beaten by a card some
 * other seat holds? Checks the seats' actual cards (perfect information
 * inside a determinization), ignoring their follow-suit constraints — the
 * same conservative test Daimyō applies with the public "unseen" set.
 */
function beatable(
  f: FastRound,
  seat: number,
  card: number,
  leadSuit: number,
  honest: boolean,
): boolean {
  const mine = winKey(card, f.trump, leadSuit);
  if (mine >= 300) return false;
  for (let c = 0; c < N_CARDS; c++) {
    const o = f.owner[c];
    // Honest: every card the seat cannot see (Daimyō's public "unseen" set,
    // undealt cards included). Otherwise the dealt hands of the other seats.
    if (honest ? o === seat || o === PLAYED : o < 0 || o === seat) continue;
    if (winKey(c, f.trump, leadSuit) > mine) return true;
  }
  return false;
}

/**
 * Port of Daimyō's careful policy (ai-tricks.pickPlay) on the fast state:
 * cheapest safe winner; a Ninja only when every remaining trick is needed or
 * on the last trick; the cheapest winner when last to play; else the weakest
 * card. Returns a card index from `buf[0..count)`.
 */
export function fastPickPlay(
  f: FastRound,
  seat: number,
  buf: Int8Array,
  count: number,
  honest = false,
): number {
  if (count === 1) return buf[0];
  const remaining = f.handSize[seat];
  const t = f.tricksWon[seat];
  const reachable = reachableTier(t, remaining);
  const chasing = t < reachable;
  const slack = t + remaining - reachable;
  const isLast = f.tableLen === f.n - 1;
  const currentBest = f.tableLen === 0 ? -2 : winKey(f.table[winningIndex(f)], f.trump, f.leadSuit);

  let safeBest = -1;
  let safeBestStrength = Number.POSITIVE_INFINITY;
  let safeNinja = -1;
  let winBest = -1;
  let winBestStrength = Number.POSITIVE_INFINITY;
  let dumpBest = -1;
  let dumpBestStrength = Number.POSITIVE_INFINITY;
  let anyBest = -1;
  let anyBestStrength = Number.POSITIVE_INFINITY;

  for (let i = 0; i < count; i++) {
    const card = buf[i];
    const lead = f.tableLen === 0 ? CARD_SUIT[card] : f.leadSuit;
    const key = winKey(card, f.trump, lead);
    const winsNow = f.tableLen === 0 ? true : key > currentBest;
    const strength = strengthOf(card, f.trump);
    const ninja = card === WOOD || card === JADE;
    if (strength < anyBestStrength) {
      anyBest = card;
      anyBestStrength = strength;
    }
    if (!ninja && strength < dumpBestStrength) {
      dumpBest = card;
      dumpBestStrength = strength;
    }
    if (!winsNow) continue;
    if (strength < winBestStrength) {
      winBest = card;
      winBestStrength = strength;
    }
    const safe = isLast || !beatable(f, seat, card, lead, honest);
    if (!safe) continue;
    if (ninja) {
      if (safeNinja === -1 || strength < strengthOf(safeNinja, f.trump)) safeNinja = card;
    } else if (strength < safeBestStrength) {
      safeBest = card;
      safeBestStrength = strength;
    }
  }

  if (safeBest !== -1) return safeBest;
  if (safeNinja !== -1 && ((chasing && slack <= 0) || remaining === 1)) return safeNinja;
  if (isLast && winBest !== -1) return winBest;
  return dumpBest !== -1 ? dumpBest : anyBest;
}

// ---------------------------------------------------------------------------
// Determinization
// ---------------------------------------------------------------------------

export interface RootInfo {
  me: number;
  base: FastRound;
  /** Card indices the observer cannot see (owner OUT in `base`). */
  unseen: Int8Array;
  /** Per seat: bit `suit` set when the seat is known to hold none of that suit. */
  voidMask: Uint8Array;
  /** Seats to deal, most constrained first. */
  dealOrder: Int8Array;
}

export function buildRoot(state: GameState, me: number, voids: ReadonlySet<string>): RootInfo {
  const base = fastFromState(state, me);
  const unseen: number[] = [];
  for (let c = 0; c < N_CARDS; c++) if (base.owner[c] === OUT) unseen.push(c);
  const voidMask = new Uint8Array(base.n);
  for (const v of voids) {
    const [seat, suit] = v.split(":");
    const s = CLANS.indexOf(suit as Clan);
    if (s >= 0) voidMask[Number(seat)] |= 1 << s;
  }
  const others: number[] = [];
  for (let seat = 0; seat < base.n; seat++) if (seat !== me) others.push(seat);
  others.sort((a, b) => popcount(voidMask[b]) - popcount(voidMask[a]));
  return { me, base, unseen: Int8Array.from(unseen), voidMask, dealOrder: Int8Array.from(others) };
}

function popcount(x: number): number {
  let n = 0;
  for (let v = x; v; v >>= 1) n += v & 1;
  return n;
}

function allowed(root: RootInfo, seat: number, card: number): boolean {
  const suit = CARD_SUIT[card];
  return suit < 0 || (root.voidMask[seat] & (1 << suit)) === 0;
}

/**
 * Deal the unseen cards to the other seats in place, respecting hand sizes
 * and revealed voids (≤ 12 attempts, then unconstrained). `f` must be a copy
 * of `root.base` (call `resetFrom` first).
 */
export function redeterminize(f: FastRound, root: RootInfo, rng: Rng, scratch: Int8Array): void {
  const m = root.unseen.length;
  for (let attempt = 0; attempt < 13; attempt++) {
    const constrained = attempt < 12;
    // Fisher–Yates into the scratch buffer.
    scratch.set(root.unseen);
    for (let i = m - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const t = scratch[i];
      scratch[i] = scratch[j];
      scratch[j] = t;
    }
    // Mark all unseen as OUT again (a previous attempt may have assigned some).
    for (let i = 0; i < m; i++) f.owner[root.unseen[i]] = OUT;
    let ok = true;
    for (let k = 0; k < root.dealOrder.length && ok; k++) {
      const seat = root.dealOrder[k];
      let need = f.handSize[seat];
      for (let i = 0; i < m && need > 0; i++) {
        const card = scratch[i];
        if (f.owner[card] !== OUT) continue;
        if (constrained && !allowed(root, seat, card)) continue;
        f.owner[card] = seat;
        need--;
      }
      if (need > 0) ok = false;
    }
    if (ok) return;
  }
}
