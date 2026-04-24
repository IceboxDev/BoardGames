import type { Action, BoutPair, Card, GameState, Rank, Suit } from "./types";
import { HAND_SIZE } from "./types";

// ---------------------------------------------------------------------------
// Bout limits
// ---------------------------------------------------------------------------

/** Max cards that can be on the table in a single bout. */
export function getMaxBoutCards(state: GameState): number {
  return Math.min(HAND_SIZE, state.defenderStartHandSize);
}

// ---------------------------------------------------------------------------
// Card comparison
// ---------------------------------------------------------------------------

/** Can `defense` beat `attack` given the trump suit? */
export function canBeat(attack: Card, defense: Card, trumpSuit: Suit): boolean {
  if (defense.suit === attack.suit) {
    return defense.rank > attack.rank;
  }
  if (defense.suit === trumpSuit && attack.suit !== trumpSuit) {
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Table helpers
// ---------------------------------------------------------------------------

/** All ranks currently on the table (both attack and defense cards). */
export function getTableRanks(table: BoutPair[]): Set<Rank> {
  const ranks = new Set<Rank>();
  for (const pair of table) {
    ranks.add(pair.attack.rank);
    if (pair.defense) ranks.add(pair.defense.rank);
  }
  return ranks;
}

function allDefended(table: BoutPair[]): boolean {
  return table.length > 0 && table.every((p) => p.defense !== null);
}

// ---------------------------------------------------------------------------
// Active player
// ---------------------------------------------------------------------------

export function getActivePlayer(state: GameState): number {
  if (state.phase === "defending") return state.defenderIndex;
  if (state.phase === "attacking" || state.phase === "throwing-in") return state.attackerIndex;
  return state.attackerIndex;
}

// ---------------------------------------------------------------------------
// Legal actions
// ---------------------------------------------------------------------------

export function getLegalActions(state: GameState): Action[] {
  if (state.phase === "game-over" || state.phase === "idle") return [];

  if (state.phase === "attacking") return getAttackActions(state);
  if (state.phase === "defending") return getDefendActions(state);
  if (state.phase === "throwing-in") return getThrowInActions(state);

  return [];
}

function getAttackActions(state: GameState): Action[] {
  const attacker = state.players[state.attackerIndex];
  const maxCards = getMaxBoutCards(state);
  const actions: Action[] = [];

  if (state.table.length === 0) {
    // Must play at least one card — any card is valid
    for (const card of attacker.hand) {
      actions.push({ type: "attack", cardId: card.id });
    }
  } else if (allDefended(state.table)) {
    // Throw-in: only matching ranks, and can pass
    if (state.table.length < maxCards) {
      const ranks = getTableRanks(state.table);
      for (const card of attacker.hand) {
        if (ranks.has(card.rank)) {
          actions.push({ type: "attack", cardId: card.id });
        }
      }
    }
    actions.push({ type: "pass" });
  }
  // If there are undefended cards on the table, it's the defender's turn — shouldn't reach here

  return actions;
}

function getDefendActions(state: GameState): Action[] {
  const defender = state.players[state.defenderIndex];
  const actions: Action[] = [];

  for (let i = 0; i < state.table.length; i++) {
    const pair = state.table[i];
    if (pair.defense !== null) continue;
    for (const card of defender.hand) {
      if (canBeat(pair.attack, card, state.trumpSuit)) {
        actions.push({ type: "defend", attackIndex: i, cardId: card.id });
      }
    }
  }

  actions.push({ type: "take" });
  return actions;
}

function getThrowInActions(state: GameState): Action[] {
  const attacker = state.players[state.attackerIndex];
  const maxCards = getMaxBoutCards(state);
  const actions: Action[] = [];

  if (state.table.length < maxCards) {
    const ranks = getTableRanks(state.table);
    for (const card of attacker.hand) {
      if (ranks.has(card.rank)) {
        actions.push({ type: "throw-in", cardId: card.id });
      }
    }
  }

  actions.push({ type: "pass" });
  return actions;
}
