// ── Nash Equilibrium AI for 2-player Sushi Go ─────────────────────────
//
// Models Sushi Go correctly as a simultaneous-move game. At each turn,
// both players choose cards at the same time. We solve for the Nash
// equilibrium via backward induction: at each state, build the payoff
// matrix (all action pairs), solve the zero-sum LP, and cache the value.
//
// Transposition table stores only the game value (a single number) to
// minimize memory. Actions and strategies are only computed at the root.
//
// For large action spaces (chopsticks in play), uses the double oracle
// algorithm to avoid building the full m×n payoff matrix while producing
// the exact same Nash equilibrium.

import type { CardType, GameState, Selection } from "../types";
import { CARD_LABELS, HAND_SIZES, isNigiri, nigiriValue } from "../types";
import { evaluateRound } from "./evaluate";
import { applyPick, getLegalActions, swapHands, toMiniMaxState, undoPick } from "./fast-game";
import { solveZeroSum } from "./lp-solver";
import type { MiniMaxPlayerState, MiniMaxState, MinimaxAction, NashTransEntry } from "./types";
import {
  INDEX_CARD_TYPE,
  NIGIRI_VALUES,
  T_CHOPSTICKS,
  T_DUMPLING,
  T_EGG,
  T_MAKI1,
  T_MAKI2,
  T_MAKI3,
  T_PUDDING,
  T_SALMON,
  T_SASHIMI,
  T_SQUID,
  T_TEMPURA,
  T_WASABI,
} from "./types";

// ── Analysis types (exposed to UI) ────────────────────────────────────

export interface NashActionLabel {
  label: string;
  cards: CardType[];
}

export interface NashAnalysis {
  p1Actions: NashActionLabel[];
  p2Actions: NashActionLabel[];
  payoffs: number[][];
  p1Strategy: number[];
  p2Strategy: number[];
  gameValue: number;
}

// ── Last analysis (set after each AI move) ────────────────────────────

let _lastAnalysis: NashAnalysis | null = null;

/** Returns the analysis from the AI's most recent Nash solve, or null for turn 1. */
export function getLastNashAnalysis(): NashAnalysis | null {
  return _lastAnalysis;
}

// ── Threshold: use double oracle when matrix would exceed this many cells ──
const DOUBLE_ORACLE_THRESHOLD = 100;

// ── Pre-allocated flat matrix buffers (one per turn depth, avoids GC) ──
// Maximum cells for non-DO path = DOUBLE_ORACLE_THRESHOLD. Turns 2-10 → 9 buffers.
const MATRIX_POOL: Float64Array[] = Array.from(
  { length: 10 },
  () => new Float64Array(DOUBLE_ORACLE_THRESHOLD),
);

// ── Entry point (factory — each call creates an isolated cache) ────────

export function createNashStrategy(): (gs: GameState, aiIndex: number) => Selection {
  // Value-only cache: hash → game value. ~37x less memory than full entries.
  let valueCache: Map<string, number> | null = null;
  let cachedRound = -1;
  let cachedAiIndex = -1;

  return (gs: GameState, aiIndex: number): Selection => {
    if (gs.turn === 1) {
      _lastAnalysis = null;
      return heuristicPick(gs, aiIndex);
    }

    // Rebuild at turn 2 or when round/index changes
    if (gs.turn === 2 || cachedRound !== gs.round || cachedAiIndex !== aiIndex) {
      valueCache = new Map();
      cachedRound = gs.round;
      cachedAiIndex = aiIndex;
    }

    const state = toMiniMaxState(gs, aiIndex);
    // biome-ignore lint/style/noNonNullAssertion: guaranteed initialized above
    const vc = valueCache!;

    // Solve the tree (populates valueCache with game values)
    nashValue(state, vc);

    // Build the root entry: actions, payoff matrix, LP solve
    const rootEntry = buildRootEntry(state, vc);

    // Build UI analysis
    _lastAnalysis = {
      p1Actions: rootEntry.p1Actions.map(formatAction),
      p2Actions: rootEntry.p2Actions.map(formatAction),
      payoffs: buildPayoffMatrix(state, rootEntry.p1Actions, rootEntry.p2Actions, vc),
      p1Strategy: rootEntry.p1Strategy,
      p2Strategy: rootEntry.p2Strategy,
      gameValue: rootEntry.value,
    };

    // AI is always player index 0 in MiniMaxState (toMiniMaxState puts AI first)
    const action = sampleAction(rootEntry.p1Actions, rootEntry.p1Strategy);
    return actionToSelection(action, gs, aiIndex);
  };
}

// ── Build root entry: re-solve LP at root to get actions + strategies ──

function buildRootEntry(state: MiniMaxState, valueCache: Map<string, number>): NashTransEntry {
  const p1Actions = getLegalActions(state.players[0]);
  const p2Actions = getLegalActions(state.players[1]);
  const A = buildPayoffMatrix(state, p1Actions, p2Actions, valueCache);
  const nash = solveZeroSum(A);
  return {
    value: nash.gameValue,
    p1Actions,
    p2Actions,
    p1Strategy: nash.p1Strategy,
    p2Strategy: nash.p2Strategy,
  };
}

// ── Build payoff matrix from cached values ─────────────────────────────

function buildPayoffMatrix(
  state: MiniMaxState,
  p1Actions: MinimaxAction[],
  p2Actions: MinimaxAction[],
  valueCache: Map<string, number>,
): number[][] {
  const m = p1Actions.length;
  const n = p2Actions.length;
  const A: number[][] = Array.from({ length: m }, () => Array(n).fill(0));
  const p0 = state.players[0];
  const p1 = state.players[1];

  for (let i = 0; i < m; i++) {
    applyPick(p0, p1Actions[i]);
    for (let j = 0; j < n; j++) {
      applyPick(p1, p2Actions[j]);
      swapHands(state.players);
      state.turn++;

      A[i][j] = valueCache.get(hashState(state)) ?? 0;

      state.turn--;
      swapHands(state.players);
      undoPick(p1, p2Actions[j]);
    }
    undoPick(p0, p1Actions[i]);
  }

  return A;
}

// ── Format action for display ─────────────────────────────────────────

function formatAction(action: MinimaxAction): NashActionLabel {
  if (action.type === 0) {
    const cardType = INDEX_CARD_TYPE[action.card];
    return { label: CARD_LABELS[cardType], cards: [cardType] };
  }
  const type1 = INDEX_CARD_TYPE[action.card];
  const type2 = INDEX_CARD_TYPE[action.second];
  return {
    label: `${CARD_LABELS[type1]} + ${CARD_LABELS[type2]}`,
    cards: [type1, type2],
  };
}

// ── Core Nash backward induction (returns value only) ──────────────────

function nashValue(state: MiniMaxState, valueCache: Map<string, number>): number {
  const handSize = HAND_SIZES[2];

  // Terminal: round over
  if (state.turn > handSize) {
    return evaluateRound(state);
  }

  const stateHash = hashState(state);
  const cached = valueCache.get(stateHash);
  if (cached !== undefined) return cached;

  const p1Actions = getLegalActions(state.players[0]);
  const p2Actions = getLegalActions(state.players[1]);

  const m = p1Actions.length;
  const n = p2Actions.length;

  // For large matrices (chopsticks in play), use double oracle
  const value =
    m * n > DOUBLE_ORACLE_THRESHOLD
      ? nashValueDoubleOracle(state, p1Actions, p2Actions, valueCache)
      : nashValueFull(state, p1Actions, p2Actions, valueCache);

  valueCache.set(stateHash, value);
  return value;
}

// ── Full matrix solve ──────────────────────────────────────────────────

function nashValueFull(
  state: MiniMaxState,
  p1Actions: MinimaxAction[],
  p2Actions: MinimaxAction[],
  valueCache: Map<string, number>,
): number {
  const m = p1Actions.length;
  const n = p2Actions.length;
  const p0 = state.players[0];
  const p1 = state.players[1];

  // Fast path: 1x1 — no matrix, no LP, just evaluate the single outcome
  if (m === 1 && n === 1) {
    applyPick(p0, p1Actions[0]);
    applyPick(p1, p2Actions[0]);
    swapHands(state.players);
    state.turn++;
    const v = nashValue(state, valueCache);
    state.turn--;
    swapHands(state.players);
    undoPick(p1, p2Actions[0]);
    undoPick(p0, p1Actions[0]);
    return v;
  }

  // Fast path: 1xN — P0 has no choice, value = min over P1's actions
  if (m === 1) {
    let minV = Infinity;
    applyPick(p0, p1Actions[0]);
    for (let j = 0; j < n; j++) {
      applyPick(p1, p2Actions[j]);
      swapHands(state.players);
      state.turn++;
      const v = nashValue(state, valueCache);
      if (v < minV) minV = v;
      state.turn--;
      swapHands(state.players);
      undoPick(p1, p2Actions[j]);
    }
    undoPick(p0, p1Actions[0]);
    return minV;
  }

  // Fast path: Mx1 — P1 has no choice, value = max over P0's actions
  if (n === 1) {
    let maxV = -Infinity;
    for (let i = 0; i < m; i++) {
      applyPick(p0, p1Actions[i]);
      applyPick(p1, p2Actions[0]);
      swapHands(state.players);
      state.turn++;
      const v = nashValue(state, valueCache);
      if (v > maxV) maxV = v;
      state.turn--;
      swapHands(state.players);
      undoPick(p1, p2Actions[0]);
      undoPick(p0, p1Actions[i]);
    }
    return maxV;
  }

  // General case: use pre-allocated flat buffer to avoid GC
  const flat = MATRIX_POOL[state.turn - 1];
  for (let i = 0; i < m; i++) {
    applyPick(p0, p1Actions[i]);
    const rowOff = i * n;
    for (let j = 0; j < n; j++) {
      applyPick(p1, p2Actions[j]);
      swapHands(state.players);
      state.turn++;

      flat[rowOff + j] = nashValue(state, valueCache);

      state.turn--;
      swapHands(state.players);
      undoPick(p1, p2Actions[j]);
    }
    undoPick(p0, p1Actions[i]);
  }

  // Fast path: 2x2 — closed-form Nash equilibrium
  if (m === 2 && n === 2) {
    const a = flat[0];
    const b = flat[1];
    const c = flat[n];
    const d = flat[n + 1];
    const denom = a - b - c + d;
    if (Math.abs(denom) > 1e-12) {
      const p = (d - c) / denom;
      if (p >= -1e-9 && p <= 1 + 1e-9) {
        return (a * d - b * c) / denom;
      }
    }
    return Math.max(Math.min(a, b), Math.min(c, d));
  }

  // Saddle point check on flat buffer — avoids 2D array + LP if pure strategy
  let maximin = -Infinity;
  for (let i = 0; i < m; i++) {
    let rowMin = Infinity;
    const off = i * n;
    for (let j = 0; j < n; j++) {
      if (flat[off + j] < rowMin) rowMin = flat[off + j];
    }
    if (rowMin > maximin) maximin = rowMin;
  }
  let minimax = Infinity;
  for (let j = 0; j < n; j++) {
    let colMax = -Infinity;
    for (let i = 0; i < m; i++) {
      if (flat[i * n + j] > colMax) colMax = flat[i * n + j];
    }
    if (colMax < minimax) minimax = colMax;
  }
  if (Math.abs(maximin - minimax) < 1e-10) return maximin;

  // Convert flat buffer to 2D array for LP solver
  const A: number[][] = Array.from({ length: m }, (_, i) => {
    const row = new Array(n);
    const off = i * n;
    for (let j = 0; j < n; j++) row[j] = flat[off + j];
    return row;
  });

  return solveZeroSum(A).gameValue;
}

// ── Double oracle: lazily expand subgame until Nash equilibrium found ───
//
// Instead of building the full m×n payoff matrix, iteratively:
//   1. Seed with heuristic-best action per player
//   2. Solve small subgame Nash equilibrium
//   3. Find best response for each player (evaluates one row/column)
//   4. If no profitable deviation exists → done (exact Nash eq)
//   5. Otherwise add best response to subgame and repeat
//
// Convergence: if Nash support has k actions, evaluates ~k*(m+n) cells
// instead of m*n. For chopstick states (m,n ~ 30-50, k ~ 2-4) this is
// an order of magnitude faster.

function nashValueDoubleOracle(
  state: MiniMaxState,
  allP1: MinimaxAction[],
  allP2: MinimaxAction[],
  valueCache: Map<string, number>,
): number {
  const p0 = state.players[0];
  const p1 = state.players[1];
  const totalP1 = allP1.length;
  const totalP2 = allP2.length;

  // Sparse payoff storage: payoffCache[i * totalP2 + j] = value (NaN = not yet evaluated)
  const payoffCache = new Float64Array(totalP1 * totalP2);
  payoffCache.fill(NaN);

  // Evaluate a single cell and cache it
  function evalCell(i: number, j: number): number {
    const idx = i * totalP2 + j;
    if (!Number.isNaN(payoffCache[idx])) return payoffCache[idx];

    applyPick(p0, allP1[i]);
    applyPick(p1, allP2[j]);
    swapHands(state.players);
    state.turn++;

    const v = nashValue(state, valueCache);
    payoffCache[idx] = v;

    state.turn--;
    swapHands(state.players);
    undoPick(p1, allP2[j]);
    undoPick(p0, allP1[i]);

    return v;
  }

  // Seed: pick heuristic-best action for each player
  const s1 = [bestHeuristicAction(allP1, state.players[0])]; // indices into allP1
  const s2 = [bestHeuristicAction(allP2, state.players[1])]; // indices into allP2
  const inS1 = new Uint8Array(totalP1);
  const inS2 = new Uint8Array(totalP2);
  inS1[s1[0]] = 1;
  inS2[s2[0]] = 1;

  // Evaluate initial cell
  evalCell(s1[0], s2[0]);

  const MAX_ITER = totalP1 + totalP2; // guaranteed to converge within this
  for (let iter = 0; iter < MAX_ITER; iter++) {
    // Build subgame matrix from current support sets
    const subM = s1.length;
    const subN = s2.length;
    const subA: number[][] = Array.from({ length: subM }, (_, si) => {
      const row = Array(subN);
      const i = s1[si];
      for (let sj = 0; sj < subN; sj++) {
        row[sj] = evalCell(i, s2[sj]);
      }
      return row;
    });

    // Solve subgame
    const subNash = solveZeroSum(subA);

    // Find P1's best response: for each P1 action, compute expected value
    // against P2's current mixed strategy (over s2)
    let bestP1Val = -Infinity;
    let bestP1Idx = -1;
    for (let i = 0; i < totalP1; i++) {
      let ev = 0;
      for (let sj = 0; sj < subN; sj++) {
        ev += subNash.p2Strategy[sj] * evalCell(i, s2[sj]);
      }
      if (ev > bestP1Val) {
        bestP1Val = ev;
        bestP1Idx = i;
      }
    }

    // Find P2's best response: for each P2 action, compute expected value
    // against P1's current mixed strategy (over s1). P2 minimizes.
    let bestP2Val = Infinity;
    let bestP2Idx = -1;
    for (let j = 0; j < totalP2; j++) {
      let ev = 0;
      for (let si = 0; si < subM; si++) {
        ev += subNash.p1Strategy[si] * evalCell(s1[si], j);
      }
      if (ev < bestP2Val) {
        bestP2Val = ev;
        bestP2Idx = j;
      }
    }

    // Check convergence: no profitable deviation for either player
    const subGameValue = subNash.gameValue;
    const p1Improves = bestP1Val > subGameValue + 1e-9 && !inS1[bestP1Idx];
    const p2Improves = bestP2Val < subGameValue - 1e-9 && !inS2[bestP2Idx];

    if (!p1Improves && !p2Improves) {
      return subGameValue;
    }

    // Add best responses to support sets
    if (p1Improves) {
      s1.push(bestP1Idx);
      inS1[bestP1Idx] = 1;
    }
    if (p2Improves) {
      s2.push(bestP2Idx);
      inS2[bestP2Idx] = 1;
    }
  }

  // Fallback: shouldn't reach here, but solve full matrix if we do
  return nashValueFull(state, allP1, allP2, valueCache);
}

// ── Heuristic action scoring for double oracle seeding ────────────────

function actionHeuristicValue(action: MinimaxAction, player: MiniMaxPlayerState): number {
  if (action.type === 0) {
    return cardHeuristicValue(action.card, player);
  }
  // Chopsticks pair: sum of both cards, small bonus for using chopsticks
  return cardHeuristicValue(action.card, player) + cardHeuristicValue(action.second, player) + 0.5;
}

function cardHeuristicValue(card: number, player: MiniMaxPlayerState): number {
  const tab = player.tableau;

  // Nigiri with wasabi — highest value
  if (card >= T_EGG && card <= T_SQUID && player.unusedWasabi > 0) {
    return NIGIRI_VALUES[card - T_EGG] * 3;
  }

  switch (card) {
    case T_TEMPURA:
      return tab[T_TEMPURA] % 2 === 1 ? 5 : 2.5;
    case T_SASHIMI:
      return tab[T_SASHIMI] % 3 === 2 ? 10 : 3.3;
    case T_DUMPLING:
      return Math.min(1 + tab[T_DUMPLING], 5);
    case T_MAKI3:
      return 2.4;
    case T_MAKI2:
      return 1.6;
    case T_MAKI1:
      return 0.8;
    case T_EGG:
      return 1;
    case T_SALMON:
      return 2;
    case T_SQUID:
      return 3;
    case T_WASABI:
      return 4;
    case T_PUDDING:
      return 2.6;
    case T_CHOPSTICKS:
      return 1.5;
    default:
      return 0;
  }
}

function bestHeuristicAction(actions: MinimaxAction[], player: MiniMaxPlayerState): number {
  let bestIdx = 0;
  let bestVal = -Infinity;
  for (let i = 0; i < actions.length; i++) {
    const v = actionHeuristicValue(actions[i], player);
    if (v > bestVal) {
      bestVal = v;
      bestIdx = i;
    }
  }
  return bestIdx;
}

// ── State hashing (tightly packed — 4 values per char) ────────────────
// All values are 0-15, so 4 bits each. Pack 4 per UTF-16 char.
// 1 turn + 29*2 player values = 59 values → 15 chars.

function hashState(state: MiniMaxState): string {
  const a = state.players[0];
  const b = state.players[1];
  return String.fromCharCode(
    (state.turn << 12) | (a.hand[0] << 8) | (a.hand[1] << 4) | a.hand[2],
    (a.hand[3] << 12) | (a.hand[4] << 8) | (a.hand[5] << 4) | a.hand[6],
    (a.hand[7] << 12) | (a.hand[8] << 8) | (a.hand[9] << 4) | a.hand[10],
    (a.hand[11] << 12) | (a.tableau[0] << 8) | (a.tableau[1] << 4) | a.tableau[2],
    (a.tableau[3] << 12) | (a.tableau[4] << 8) | (a.tableau[5] << 4) | a.tableau[6],
    (a.tableau[7] << 12) | (a.tableau[8] << 8) | (a.tableau[9] << 4) | a.tableau[10],
    (a.tableau[11] << 12) |
      (a.boostedNigiri[0] << 8) |
      (a.boostedNigiri[1] << 4) |
      a.boostedNigiri[2],
    (a.unusedWasabi << 12) | (a.puddings << 8) | (b.hand[0] << 4) | b.hand[1],
    (b.hand[2] << 12) | (b.hand[3] << 8) | (b.hand[4] << 4) | b.hand[5],
    (b.hand[6] << 12) | (b.hand[7] << 8) | (b.hand[8] << 4) | b.hand[9],
    (b.hand[10] << 12) | (b.hand[11] << 8) | (b.tableau[0] << 4) | b.tableau[1],
    (b.tableau[2] << 12) | (b.tableau[3] << 8) | (b.tableau[4] << 4) | b.tableau[5],
    (b.tableau[6] << 12) | (b.tableau[7] << 8) | (b.tableau[8] << 4) | b.tableau[9],
    (b.tableau[10] << 12) | (b.tableau[11] << 8) | (b.boostedNigiri[0] << 4) | b.boostedNigiri[1],
    (b.boostedNigiri[2] << 12) | (b.unusedWasabi << 8) | (b.puddings << 4),
  );
}

// ── Sample from mixed strategy ─────────────────────────────────────────

function sampleAction(actions: MinimaxAction[], weights: number[]): MinimaxAction {
  let r = Math.random();
  for (let i = 0; i < actions.length; i++) {
    r -= weights[i];
    if (r <= 0) return actions[i];
  }
  return actions[actions.length - 1];
}

// ── Turn 1 heuristic (same as minimax — no info available) ─────────────

function heuristicPick(gs: GameState, aiIndex: number): Selection {
  const hand = gs.players[aiIndex].hand;
  const hasWasabi = gs.players[aiIndex].unusedWasabi > 0;

  let bestIdx = 0;
  let bestScore = -Infinity;

  for (let i = 0; i < hand.length; i++) {
    const type = hand[i].type;
    const score = heuristicCardValue(type, hasWasabi);
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }

  return { cardId: hand[bestIdx].id };
}

function heuristicCardValue(type: CardType, hasWasabi: boolean): number {
  if (isNigiri(type)) {
    const base = nigiriValue(type);
    return hasWasabi ? base * 3 : base;
  }
  switch (type) {
    case "tempura":
      return 2.5;
    case "sashimi":
      return 3.3;
    case "dumpling":
      return 2;
    case "maki-3":
      return 2.4;
    case "maki-2":
      return 1.6;
    case "maki-1":
      return 0.8;
    case "wasabi":
      return 4;
    case "pudding":
      return 2.6;
    case "chopsticks":
      return 1.5;
    default:
      return 0;
  }
}

// ── Convert MinimaxAction to Selection (with card IDs) ─────────────────

function actionToSelection(action: MinimaxAction, gs: GameState, aiIndex: number): Selection {
  const hand = gs.players[aiIndex].hand;

  if (action.type === 0) {
    const targetType = INDEX_CARD_TYPE[action.card];
    const card = hand.find((c) => c.type === targetType);
    if (card) return { cardId: card.id };
  } else {
    const type1 = INDEX_CARD_TYPE[action.card];
    const type2 = INDEX_CARD_TYPE[action.second];
    const card1 = hand.find((c) => c.type === type1);
    if (card1) {
      const card2 = hand.find((c) => c.type === type2 && c.id !== card1.id);
      if (card2) return { cardId: card1.id, secondCardId: card2.id };
    }
  }

  // Fallback: shouldn't happen
  return { cardId: hand[0].id };
}
