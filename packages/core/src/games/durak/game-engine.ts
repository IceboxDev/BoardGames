import { buildDeck, findFirstAttacker, shuffleInPlace } from "./deck";
import { canBeat, getMaxBoutCards, getTableRanks } from "./rules";
import type { Action, AIStrategyId, Card, GameState, Player } from "./types";
import { HAND_SIZE } from "./types";

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

export function createInitialState(
  playerCount: number,
  strategies: (AIStrategyId | null)[],
): GameState {
  const deck = buildDeck();
  shuffleInPlace(deck);

  const players: Player[] = [];
  for (let i = 0; i < playerCount; i++) {
    const hand = deck.splice(0, HAND_SIZE);
    players.push({
      index: i,
      type: strategies[i] === null ? "human" : "ai",
      hand,
      isOut: false,
      aiStrategy: strategies[i] ?? undefined,
    });
  }

  // The top card of the remaining deck determines trump suit.
  // It goes under the draw pile (last card drawn).
  const trumpCard = deck.shift();
  if (!trumpCard) throw new Error("Deck is empty after dealing — cannot determine trump");
  deck.push(trumpCard);

  const hands = players.map((p) => p.hand);
  const attackerIndex = findFirstAttacker(hands, trumpCard.suit);
  const defenderIndex = nextActivePlayer(players, attackerIndex);

  return {
    phase: "attacking",
    players,
    drawPile: deck,
    trumpCard,
    trumpSuit: trumpCard.suit,
    discardPile: [],
    table: [],
    attackerIndex,
    defenderIndex,
    defenderStartHandSize: players[defenderIndex].hand.length,
    turnCount: 0,
    durak: null,
    actionLog: [],
  };
}

// ---------------------------------------------------------------------------
// Player cycling
// ---------------------------------------------------------------------------

/** Next player who is still in the game (not isOut), wrapping around. */
function nextActivePlayer(players: Player[], fromIndex: number): number {
  const n = players.length;
  for (let offset = 1; offset < n; offset++) {
    const idx = (fromIndex + offset) % n;
    if (!players[idx].isOut) return idx;
  }
  return fromIndex;
}

// ---------------------------------------------------------------------------
// Apply action (immutable wrapper)
// ---------------------------------------------------------------------------

export function applyActionPure(state: GameState, action: Action): GameState {
  const next = structuredClone(state);
  applyAction(next, action);
  return next;
}

// ---------------------------------------------------------------------------
// Apply action (mutating)
// ---------------------------------------------------------------------------

export function applyAction(state: GameState, action: Action): void {
  switch (action.type) {
    case "attack":
      handleAttack(state, action.cardId);
      break;
    case "defend":
      handleDefend(state, action.attackIndex, action.cardId);
      break;
    case "throw-in":
      handleThrowIn(state, action.cardId);
      break;
    case "take":
      handleTake(state);
      break;
    case "pass":
      handlePass(state);
      break;
  }
}

// ---------------------------------------------------------------------------
// Action handlers
// ---------------------------------------------------------------------------

function findCardInHand(player: Player, cardId: number): Card {
  const card = player.hand.find((c) => c.id === cardId);
  if (!card) throw new Error(`Card ${cardId} not in player ${player.index}'s hand`);
  return card;
}

function removeCardFromHand(player: Player, cardId: number): Card {
  const idx = player.hand.findIndex((c) => c.id === cardId);
  if (idx === -1) throw new Error(`Card ${cardId} not in player ${player.index}'s hand`);
  return player.hand.splice(idx, 1)[0];
}

function handleAttack(state: GameState, cardId: number): void {
  const attacker = state.players[state.attackerIndex];
  const card = findCardInHand(attacker, cardId);

  if (state.table.length > 0) {
    if (!state.table.every((p) => p.defense !== null)) {
      throw new Error("Cannot attack while there are undefended cards on the table");
    }
    const maxCards = getMaxBoutCards(state);
    if (state.table.length >= maxCards) {
      throw new Error("Table card limit reached — cannot play more attack cards");
    }
    const ranks = getTableRanks(state.table);
    if (!ranks.has(card.rank)) {
      throw new Error(`Card rank ${card.rank} does not match any rank on the table`);
    }
  }

  removeCardFromHand(attacker, cardId);
  state.table.push({ attack: card, defense: null });
  state.actionLog.push({
    turn: state.turnCount,
    playerIndex: state.attackerIndex,
    action: "attack",
    card,
  });
  state.phase = "defending";
}

function handleDefend(state: GameState, attackIndex: number, cardId: number): void {
  if (attackIndex < 0 || attackIndex >= state.table.length) {
    throw new Error(`Invalid attack index ${attackIndex}`);
  }
  const pair = state.table[attackIndex];
  if (pair.defense !== null) {
    throw new Error(`Attack at index ${attackIndex} is already defended`);
  }

  const defender = state.players[state.defenderIndex];
  const card = findCardInHand(defender, cardId);
  if (!canBeat(pair.attack, card, state.trumpSuit)) {
    throw new Error(`Card ${cardId} cannot beat the attack card at index ${attackIndex}`);
  }

  removeCardFromHand(defender, cardId);
  state.actionLog.push({
    turn: state.turnCount,
    playerIndex: state.defenderIndex,
    action: "defend",
    card,
    attackCard: pair.attack,
  });
  pair.defense = card;

  // Check if all pairs are now defended
  if (state.table.every((p) => p.defense !== null)) {
    // Attacker can throw in more or pass
    // But first check if attacker CAN throw in (has matching ranks and limit not reached)
    const maxCards = getMaxBoutCards(state);
    if (state.table.length >= maxCards) {
      // Limit reached — auto-resolve successful defense
      resolveBout(state, true);
      return;
    }

    const attacker = state.players[state.attackerIndex];
    const ranks = getTableRanks(state.table);
    const canThrowIn = attacker.hand.some((c) => ranks.has(c.rank));

    if (!canThrowIn || attacker.hand.length === 0) {
      // Nothing to throw in — auto-resolve successful defense
      resolveBout(state, true);
      return;
    }

    state.phase = "attacking";
  }
  // If there are still undefended pairs, stay in "defending"
}

function handleTake(state: GameState): void {
  state.actionLog.push({
    turn: state.turnCount,
    playerIndex: state.defenderIndex,
    action: "take",
  });
  // Defender gives up — switch to throwing-in so attacker can add more cards
  const attacker = state.players[state.attackerIndex];
  const maxCards = getMaxBoutCards(state);
  const ranks = getTableRanks(state.table);
  const canThrowIn =
    attacker.hand.length > 0 &&
    state.table.length < maxCards &&
    attacker.hand.some((c) => ranks.has(c.rank));

  if (canThrowIn) {
    state.phase = "throwing-in";
  } else {
    // Nothing to add — immediately resolve failed defense
    resolveBout(state, false);
  }
}

function handleThrowIn(state: GameState, cardId: number): void {
  const attacker = state.players[state.attackerIndex];
  const maxCards = getMaxBoutCards(state);
  if (state.table.length >= maxCards) {
    throw new Error("Table card limit reached — cannot throw in more cards");
  }
  const card = findCardInHand(attacker, cardId);
  const ranks = getTableRanks(state.table);
  if (!ranks.has(card.rank)) {
    throw new Error(`Card rank ${card.rank} does not match any rank on the table`);
  }

  removeCardFromHand(attacker, cardId);
  state.table.push({ attack: card, defense: null });
  state.actionLog.push({
    turn: state.turnCount,
    playerIndex: state.attackerIndex,
    action: "throw-in",
    card,
  });

  // Check if limit is now reached — auto-resolve if so
  if (state.table.length >= maxCards || attacker.hand.length === 0) {
    resolveBout(state, false);
  }
  // Otherwise stay in throwing-in
}

function handlePass(state: GameState): void {
  if (state.phase === "attacking" && state.table.length === 0) {
    throw new Error("Cannot pass without playing at least one attack card");
  }

  state.actionLog.push({
    turn: state.turnCount,
    playerIndex: state.attackerIndex,
    action: "pass",
  });
  if (state.phase === "attacking") {
    // Attacker done — all pairs were defended — successful defense
    resolveBout(state, true);
  } else if (state.phase === "throwing-in") {
    // Attacker done throwing in — failed defense
    resolveBout(state, false);
  }
}

// ---------------------------------------------------------------------------
// Bout resolution
// ---------------------------------------------------------------------------

function resolveBout(state: GameState, successfulDefense: boolean): void {
  state.turnCount++;

  state.actionLog.push({
    turn: state.turnCount,
    playerIndex: successfulDefense ? state.defenderIndex : state.attackerIndex,
    action: successfulDefense ? "bout-won" : "bout-lost",
  });

  if (successfulDefense) {
    // All table cards go to discard
    for (const pair of state.table) {
      state.discardPile.push(pair.attack);
      if (pair.defense) state.discardPile.push(pair.defense);
    }
  } else {
    // Defender takes all table cards
    const defender = state.players[state.defenderIndex];
    for (const pair of state.table) {
      defender.hand.push(pair.attack);
      if (pair.defense) defender.hand.push(pair.defense);
    }
  }

  state.table = [];

  // Replenish hands (attacker first, then other players in order, defender last)
  replenishHands(state);

  // Mark players with empty hands as out (only when draw pile is also empty)
  if (state.drawPile.length === 0) {
    for (const player of state.players) {
      if (!player.isOut && player.hand.length === 0) {
        player.isOut = true;
      }
    }
  }

  // Check game over
  const activePlayers = state.players.filter((p) => !p.isOut);
  if (activePlayers.length <= 1) {
    state.phase = "game-over";
    if (activePlayers.length === 1) {
      state.durak = activePlayers[0].index;
    } else {
      // All players out simultaneously — draw
      state.durak = null;
    }
    return;
  }

  // Advance attacker/defender
  if (successfulDefense) {
    // Defender becomes the new attacker
    state.attackerIndex = state.defenderIndex;
  } else {
    // Player after defender becomes the new attacker (defender loses their turn)
    state.attackerIndex = nextActivePlayer(state.players, state.defenderIndex);
  }
  state.defenderIndex = nextActivePlayer(state.players, state.attackerIndex);

  // Edge case: if the new attacker or defender is out, keep advancing
  // (nextActivePlayer already handles this)

  state.defenderStartHandSize = state.players[state.defenderIndex].hand.length;
  state.phase = "attacking";
}

function replenishHands(state: GameState): void {
  if (state.drawPile.length === 0) return;

  // Attacker draws first
  drawUpTo(state, state.attackerIndex);

  // Other players in order (excluding attacker and defender)
  const n = state.players.length;
  for (let offset = 1; offset < n; offset++) {
    const idx = (state.attackerIndex + offset) % n;
    if (idx === state.defenderIndex) continue;
    if (state.players[idx].isOut) continue;
    drawUpTo(state, idx);
  }

  // Defender draws last
  drawUpTo(state, state.defenderIndex);
}

function drawUpTo(state: GameState, playerIndex: number): void {
  const player = state.players[playerIndex];
  while (player.hand.length < HAND_SIZE && state.drawPile.length > 0) {
    // biome-ignore lint/style/noNonNullAssertion: drawPile.length > 0 guarantees shift() returns a card
    player.hand.push(state.drawPile.shift()!);
  }
}
