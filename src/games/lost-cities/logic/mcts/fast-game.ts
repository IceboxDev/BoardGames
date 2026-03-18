import {
  CARD_INFO,
  DRAW_PILE_KEY,
  type DrawActionFast,
  drawDiscardKey,
  EXPEDITION_COST,
  type FastState,
  LENGTH_BONUS,
  LENGTH_BONUS_THRESHOLD,
  NUM_COLORS,
  type PlayActionFast,
  playDiscardKey,
  playExpeditionKey,
} from "./types";

// --- Clone ---

export function cloneState(s: FastState): FastState {
  return {
    drawPile: s.drawPile.slice(),
    discardPiles: s.discardPiles.map((p) => p.slice()),
    expeditions: s.expeditions.map((e) => e.slice()),
    hands: s.hands.map((h) => h.slice()),
    currentPlayer: s.currentPlayer,
    turnPhase: s.turnPhase,
    lastDiscardedColor: s.lastDiscardedColor,
    gameOver: s.gameOver,
  };
}

// --- Expedition legality check ---

export function canPlayToExpedition(cardId: number, expedition: number[]): boolean {
  const info = CARD_INFO[cardId];
  if (expedition.length === 0) return true;
  const lastInfo = CARD_INFO[expedition[expedition.length - 1]];
  if (info.type === 0) return lastInfo.type === 0; // wager only before numbers
  return info.value > lastInfo.value;
}

// --- Legal actions ---

export function getLegalPlays(s: FastState): PlayActionFast[] {
  const hand = s.hands[s.currentPlayer];
  const expOffset = s.currentPlayer * NUM_COLORS;
  const actions: PlayActionFast[] = [];

  for (const cardId of hand) {
    const info = CARD_INFO[cardId];
    if (canPlayToExpedition(cardId, s.expeditions[expOffset + info.color])) {
      actions.push({ key: playExpeditionKey(cardId), cardId, kind: 0 });
    }
    actions.push({ key: playDiscardKey(cardId), cardId, kind: 1 });
  }

  return actions;
}

export function getLegalDraws(s: FastState): DrawActionFast[] {
  const actions: DrawActionFast[] = [];

  if (s.drawPile.length > 0) {
    actions.push({ key: DRAW_PILE_KEY, kind: 0, color: -1 });
  }

  for (let c = 0; c < NUM_COLORS; c++) {
    if (s.discardPiles[c].length > 0 && c !== s.lastDiscardedColor) {
      actions.push({ key: drawDiscardKey(c), kind: 1, color: c });
    }
  }

  return actions;
}

// --- Apply actions (mutates in place) ---

export function applyPlayFast(s: FastState, action: PlayActionFast): void {
  const hand = s.hands[s.currentPlayer];
  const idx = hand.indexOf(action.cardId);
  hand.splice(idx, 1);

  if (action.kind === 0) {
    // expedition
    const info = CARD_INFO[action.cardId];
    s.expeditions[s.currentPlayer * NUM_COLORS + info.color].push(action.cardId);
    s.lastDiscardedColor = -1;
  } else {
    // discard
    const info = CARD_INFO[action.cardId];
    s.discardPiles[info.color].push(action.cardId);
    s.lastDiscardedColor = info.color;
  }

  s.turnPhase = 1; // draw
}

export function applyDrawFast(s: FastState, action: DrawActionFast): void {
  let drawnCard: number;

  if (action.kind === 0) {
    // draw pile
    drawnCard = s.drawPile.pop()!;
    if (s.drawPile.length === 0) {
      s.gameOver = true;
    }
  } else {
    // discard pile
    drawnCard = s.discardPiles[action.color].pop()!;
  }

  s.hands[s.currentPlayer].push(drawnCard);
  s.currentPlayer = 1 - s.currentPlayer;
  s.turnPhase = 0; // play
  s.lastDiscardedColor = -1;
}

// --- Scoring ---

export function scoreExpeditionFast(expedition: number[]): number {
  if (expedition.length === 0) return 0;

  let wagerCount = 0;
  let cardValues = 0;

  for (const cardId of expedition) {
    const info = CARD_INFO[cardId];
    if (info.type === 0) wagerCount++;
    else cardValues += info.value;
  }

  const subtotal = (cardValues - EXPEDITION_COST) * (1 + wagerCount);
  const bonus = expedition.length >= LENGTH_BONUS_THRESHOLD ? LENGTH_BONUS : 0;
  return subtotal + bonus;
}

export function scorePlayerFast(s: FastState, player: number): number {
  let total = 0;
  const offset = player * NUM_COLORS;
  for (let c = 0; c < NUM_COLORS; c++) {
    total += scoreExpeditionFast(s.expeditions[offset + c]);
  }
  return total;
}
