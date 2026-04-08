import type { CardType, GameState, Selection } from "../types";
import { HAND_SIZES } from "../types";
import { evaluateRound } from "./evaluate";
import { applyPick, getLegalActions, swapHands, toMiniMaxState, undoPick } from "./fast-game";
import type { MiniMaxPlayerState, MiniMaxState, MinimaxAction, TranspositionEntry } from "./types";
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

// ── Entry point ─────────────────────────────────────────────────────────

function getMinimaxSelection(
  gs: GameState,
  aiIndex: number,
  cachedTransTable: Map<string, TranspositionEntry>,
): Selection {
  if (gs.turn === 1) {
    return heuristicPick(gs, aiIndex);
  }

  const mmState = toMiniMaxState(gs, aiIndex);
  const result = minimaxSearch(mmState, true, -Infinity, Infinity, cachedTransTable);

  if (!result.bestAction) {
    return heuristicPick(gs, aiIndex);
  }

  return actionToSelection(result.bestAction, gs, aiIndex);
}

export function createMinimaxStrategy(): (gs: GameState, aiIndex: number) => Selection {
  let cachedTransTable = new Map<string, TranspositionEntry>();
  let cachedRound = -1;

  return (gs: GameState, aiIndex: number): Selection => {
    // Reset trans table on new round
    if (gs.round !== cachedRound || gs.turn === 1) {
      cachedTransTable = new Map();
      cachedRound = gs.round;
    }
    return getMinimaxSelection(gs, aiIndex, cachedTransTable);
  };
}

// ── Turn 1 heuristic (no information) ───────────────────────────────────

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
  switch (type) {
    case "squid-nigiri":
      return hasWasabi ? 9 : 3;
    case "salmon-nigiri":
      return hasWasabi ? 6 : 2;
    case "egg-nigiri":
      return hasWasabi ? 3 : 1;
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

// ── Core minimax with alpha-beta + transposition table ──────────────────

interface SearchResult {
  value: number;
  bestAction: MinimaxAction | null;
}

function minimaxSearch(
  state: MiniMaxState,
  isMaxNode: boolean,
  alpha: number,
  beta: number,
  transTable: Map<string, TranspositionEntry>,
): SearchResult {
  const handSize = HAND_SIZES[2]; // always 2-player = 10

  // Terminal: round over
  if (state.turn > handSize) {
    return { value: evaluateRound(state), bestAction: null };
  }

  // Check transposition table
  const stateHash = hashState(state, isMaxNode);
  const cached = transTable.get(stateHash);
  if (cached) {
    return { value: cached.value, bestAction: cached.bestAction };
  }

  const pickerIdx = isMaxNode ? 0 : 1;
  const player = state.players[pickerIdx];
  const actions = getLegalActions(player);
  const sortedActions = orderActions(actions, player);

  let bestValue = isMaxNode ? -Infinity : Infinity;
  let bestAction: MinimaxAction | null = null;
  let currentAlpha = alpha;
  let currentBeta = beta;

  for (const action of sortedActions) {
    applyPick(state.players[pickerIdx], action);

    let childValue: number;
    if (isMaxNode) {
      childValue = minimaxSearch(state, false, currentAlpha, currentBeta, transTable).value;
    } else {
      swapHands(state.players);
      state.turn++;
      childValue = minimaxSearch(state, true, currentAlpha, currentBeta, transTable).value;
      state.turn--;
      swapHands(state.players);
    }

    undoPick(state.players[pickerIdx], action);

    if (isMaxNode) {
      if (childValue > bestValue) {
        bestValue = childValue;
        bestAction = action;
      }
      currentAlpha = Math.max(currentAlpha, bestValue);
    } else {
      if (childValue < bestValue) {
        bestValue = childValue;
        bestAction = action;
      }
      currentBeta = Math.min(currentBeta, bestValue);
    }

    if (currentBeta <= currentAlpha) break;
  }

  transTable.set(stateHash, { value: bestValue, bestAction });
  return { value: bestValue, bestAction };
}

// ── State hashing (packed — 4 values per char) ──────────────────────────

function hashState(state: MiniMaxState, isMaxNode: boolean): string {
  const a = state.players[0];
  const b = state.players[1];
  const turnByte = (isMaxNode ? 1 : 0) + state.turn * 2;
  return String.fromCharCode(
    (turnByte << 12) | (a.hand[0] << 8) | (a.hand[1] << 4) | a.hand[2],
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

// ── Move ordering heuristic ─────────────────────────────────────────────

function orderActions(actions: MinimaxAction[], player: MiniMaxPlayerState): MinimaxAction[] {
  return [...actions].sort((a, b) => actionPriority(b, player) - actionPriority(a, player));
}

function actionPriority(action: MinimaxAction, player: MiniMaxPlayerState): number {
  if (action.type === 1) {
    return cardPriority(action.card, player) + cardPriority(action.second, player) + 0.5;
  }
  return cardPriority(action.card, player);
}

function cardPriority(card: number, player: MiniMaxPlayerState): number {
  const tab = player.tableau;

  // Nigiri with wasabi available — highest priority
  if (card >= T_EGG && card <= T_SQUID && player.unusedWasabi > 0) {
    return 10 + NIGIRI_VALUES[card - T_EGG];
  }

  switch (card) {
    case T_SASHIMI:
      return tab[T_SASHIMI] % 3 === 2 ? 10 : 3;
    case T_TEMPURA:
      return tab[T_TEMPURA] % 2 === 1 ? 8 : 3;
    case T_EGG:
      return 4;
    case T_SALMON:
      return 5;
    case T_SQUID:
      return 6;
    case T_DUMPLING:
      return 2 + Math.min(tab[T_DUMPLING], 4);
    case T_MAKI3:
      return 4;
    case T_MAKI2:
      return 3;
    case T_MAKI1:
      return 1.5;
    case T_WASABI:
      return 5;
    case T_PUDDING:
      return 2;
    case T_CHOPSTICKS:
      return 1;
    default:
      return 0;
  }
}

// ── Convert MinimaxAction back to Selection (with card IDs) ─────────────

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

  return { cardId: hand[0].id };
}
