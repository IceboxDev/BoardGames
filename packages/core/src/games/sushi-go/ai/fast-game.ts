import type { GameState } from "../types";
import {
  CARD_TYPE_INDEX,
  type MiniMaxPlayerState,
  type MiniMaxState,
  type MinimaxAction,
  NUM_TYPES,
  T_CHOPSTICKS,
  T_EGG,
  T_SQUID,
  T_WASABI,
} from "./types";

// ── Convert full GameState to compact MiniMaxState ──────────────────────

export function toMiniMaxState(gs: GameState, aiIndex: number): MiniMaxState {
  const oppIndex = aiIndex === 0 ? 1 : 0;

  const toCompact = (i: number): MiniMaxPlayerState => {
    const p = gs.players[i];
    const hand = new Uint8Array(NUM_TYPES);
    for (const c of p.hand) hand[CARD_TYPE_INDEX[c.type]]++;
    const tableau = new Uint8Array(NUM_TYPES);
    for (const c of p.tableau) tableau[CARD_TYPE_INDEX[c.type]]++;
    const boostedNigiri = new Uint8Array(3);
    for (const id of p.wasabiBoostedNigiriIds) {
      const card = p.tableau.find((c) => c.id === id);
      if (card) boostedNigiri[CARD_TYPE_INDEX[card.type] - T_EGG]++;
    }
    return { hand, tableau, unusedWasabi: p.unusedWasabi, boostedNigiri, puddings: p.puddings };
  };

  return {
    players: [toCompact(aiIndex), toCompact(oppIndex)],
    turn: gs.turn,
    round: gs.round,
  };
}

// ── Clone a player state ───────────────────────────────────────────────

export function clonePlayer(p: MiniMaxPlayerState): MiniMaxPlayerState {
  return {
    hand: new Uint8Array(p.hand),
    tableau: new Uint8Array(p.tableau),
    unusedWasabi: p.unusedWasabi,
    boostedNigiri: new Uint8Array(p.boostedNigiri),
    puddings: p.puddings,
  };
}

// ── Apply a pick action (mutates player in place) ───────────────────────

export function applyPick(player: MiniMaxPlayerState, action: MinimaxAction): void {
  if (action.type === 0) {
    // Single pick
    player.hand[action.card]--;
    addToTableau(player, action.card);
  } else {
    // Chopsticks: pick two cards, return chopsticks to hand
    player.hand[action.card]--;
    addToTableau(player, action.card);
    player.hand[action.second]--;
    addToTableau(player, action.second);
    // Return chopsticks from tableau to hand
    player.tableau[T_CHOPSTICKS]--;
    player.hand[T_CHOPSTICKS]++;
  }
}

function addToTableau(player: MiniMaxPlayerState, card: number): void {
  player.tableau[card]++;
  if (card === T_WASABI) {
    player.unusedWasabi++;
  } else if (card >= T_EGG && card <= T_SQUID && player.unusedWasabi > 0) {
    player.unusedWasabi--;
    player.boostedNigiri[card - T_EGG]++;
  }
}

// ── Undo a pick action (reverse of applyPick — mutates in place) ────────

export function undoPick(player: MiniMaxPlayerState, action: MinimaxAction): void {
  if (action.type === 0) {
    undoAddToTableau(player, action.card);
    player.hand[action.card]++;
  } else {
    // Reverse chopsticks return
    player.hand[T_CHOPSTICKS]--;
    player.tableau[T_CHOPSTICKS]++;
    // Reverse second card
    undoAddToTableau(player, action.second);
    player.hand[action.second]++;
    // Reverse first card
    undoAddToTableau(player, action.card);
    player.hand[action.card]++;
  }
}

function undoAddToTableau(player: MiniMaxPlayerState, card: number): void {
  player.tableau[card]--;
  if (card === T_WASABI) {
    player.unusedWasabi--;
  } else if (card >= T_EGG && card <= T_SQUID && player.boostedNigiri[card - T_EGG] > 0) {
    // Was this nigiri boosted? If boostedNigiri count > 0 for this type, undo the boost
    player.boostedNigiri[card - T_EGG]--;
    player.unusedWasabi++;
  }
}

// ── Swap hands between two players ──────────────────────────────────────

export function swapHands(players: [MiniMaxPlayerState, MiniMaxPlayerState]): void {
  const tmp = players[0].hand;
  players[0].hand = players[1].hand;
  players[1].hand = tmp;
}

// ── Get legal actions, deduplicated by card type ────────────────────────

export function getLegalActions(player: MiniMaxPlayerState): MinimaxAction[] {
  const actions: MinimaxAction[] = [];

  // Collect unique types present in hand
  const uniqueTypes: number[] = [];
  for (let t = 0; t < NUM_TYPES; t++) {
    if (player.hand[t] > 0) {
      actions.push({ type: 0, card: t });
      uniqueTypes.push(t);
    }
  }

  // Chopsticks: pick two cards
  if (player.tableau[T_CHOPSTICKS] > 0 && handSize(player) >= 2) {
    const n = uniqueTypes.length;
    for (let i = 0; i < n; i++) {
      for (let j = i; j < n; j++) {
        // For same type, need at least 2 in hand
        if (i === j && player.hand[uniqueTypes[i]] < 2) continue;
        actions.push({ type: 1, card: uniqueTypes[i], second: uniqueTypes[j] });
      }
    }
  }

  return actions;
}

// ── Helpers ─────────────────────────────────────────────────────────────

function handSize(player: MiniMaxPlayerState): number {
  let s = 0;
  for (let t = 0; t < NUM_TYPES; t++) s += player.hand[t];
  return s;
}
