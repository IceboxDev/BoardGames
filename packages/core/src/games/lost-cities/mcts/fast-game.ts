import {
  CARD_INFO,
  CARDS_PER_COLOR,
  DISCARD_KEYS,
  DRAW_DISCARD_KEYS,
  DRAW_PILE_KEY,
  type DrawActionFast,
  EXPEDITION_COST,
  EXPEDITION_KEYS,
  type FastState,
  LENGTH_BONUS,
  LENGTH_BONUS_THRESHOLD,
  NUM_COLORS,
  type PlayActionFast,
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
    pinnedOpponentCards: s.pinnedOpponentCards,
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

/** True if this card cannot be played to either player's expedition in its color (current state). */
export function isDiscardDeadToBoth(s: FastState, player: number, cardId: number): boolean {
  const info = CARD_INFO[cardId];
  const c = info.color;
  const expOffset = player * NUM_COLORS;
  const oppOffset = (1 - player) * NUM_COLORS;
  const myExp = s.expeditions[expOffset + c];
  const oppExp = s.expeditions[oppOffset + c];
  return !canPlayToExpedition(cardId, myExp) && !canPlayToExpedition(cardId, oppExp);
}

/** Count hand cards still legally playable on that player's own expeditions (terminal rollout shaping). */
export function countUnplayedPlayableToOwnExpeditions(s: FastState, player: number): number {
  const expOffset = player * NUM_COLORS;
  let n = 0;
  for (const cardId of s.hands[player]) {
    const c = CARD_INFO[cardId].color;
    if (canPlayToExpedition(cardId, s.expeditions[expOffset + c])) {
      n++;
    }
  }
  return n;
}

/** Cards in hand that cannot be played to own expedition in that color (ordering deadlock). Empty expedition accepts any card. */
export function countStrandedUnplayableToOwnExpeditions(s: FastState, player: number): number {
  const expOffset = player * NUM_COLORS;
  let n = 0;
  for (const cardId of s.hands[player]) {
    const c = CARD_INFO[cardId].color;
    const exp = s.expeditions[expOffset + c];
    if (exp.length > 0 && !canPlayToExpedition(cardId, exp)) {
      n++;
    }
  }
  return n;
}

/** Cards of `color` still in draw pile, hands, and discard piles (full determinized rollout state). */
export function countCardsOfColorRemainingInPlay(s: FastState, color: number): number {
  let onExp = 0;
  for (let p = 0; p < 2; p++) {
    onExp += s.expeditions[p * NUM_COLORS + color].length;
  }
  return CARDS_PER_COLOR - onExp;
}

/** Number cards of `color` with value strictly below `maxValue` in draw pile and opponent hand (IS-MCTS rollout: full state). */
export function countUnseenLowerNumbersInColorForPlayer(
  s: FastState,
  player: number,
  color: number,
  maxValue: number,
): number {
  const opp = 1 - player;
  let n = 0;
  for (const id of s.drawPile) {
    const inf = CARD_INFO[id];
    if (inf.color === color && inf.type === 1 && inf.value < maxValue) {
      n++;
    }
  }
  for (const id of s.hands[opp]) {
    const inf = CARD_INFO[id];
    if (inf.color === color && inf.type === 1 && inf.value < maxValue) {
      n++;
    }
  }
  return n;
}

// --- Legal actions ---

export function getLegalPlays(s: FastState): PlayActionFast[] {
  const hand = s.hands[s.currentPlayer];
  const expOffset = s.currentPlayer * NUM_COLORS;
  const actions: PlayActionFast[] = [];

  for (const cardId of hand) {
    const info = CARD_INFO[cardId];
    if (canPlayToExpedition(cardId, s.expeditions[expOffset + info.color])) {
      actions.push({ key: EXPEDITION_KEYS[cardId], cardId, kind: 0 });
    }
    actions.push({ key: DISCARD_KEYS[cardId], cardId, kind: 1 });
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
      actions.push({ key: DRAW_DISCARD_KEYS[c], kind: 1, color: c });
    }
  }

  return actions;
}

// --- Apply actions (mutates in place) ---

export function applyPlayFast(s: FastState, action: PlayActionFast): void {
  const hand = s.hands[s.currentPlayer];
  const idx = hand.indexOf(action.cardId);
  hand[idx] = hand[hand.length - 1];
  hand.pop();

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
    const popped = s.drawPile.pop();
    if (popped === undefined) throw new Error("Draw pile is empty");
    drawnCard = popped;
    if (s.drawPile.length === 0) {
      s.gameOver = true;
    }
  } else {
    // discard pile
    const popped = s.discardPiles[action.color].pop();
    if (popped === undefined) throw new Error("Discard pile is empty");
    drawnCard = popped;
  }

  s.hands[s.currentPlayer].push(drawnCard);
  s.currentPlayer = 1 - s.currentPlayer;
  s.turnPhase = 0; // play
  s.lastDiscardedColor = -1;
}

// --- Buffer-based legal actions (zero-alloc for rollout) ---

const _playBuffer: PlayActionFast[] = Array.from({ length: 24 }, () => ({
  key: "",
  cardId: 0,
  kind: 0,
}));
const _drawBuffer: DrawActionFast[] = Array.from({ length: 6 }, () => ({
  key: "",
  kind: 0,
  color: -1,
}));

export function getLegalPlaysInto(s: FastState): { buffer: PlayActionFast[]; count: number } {
  const hand = s.hands[s.currentPlayer];
  const expOffset = s.currentPlayer * NUM_COLORS;
  let count = 0;

  for (const cardId of hand) {
    const info = CARD_INFO[cardId];
    if (canPlayToExpedition(cardId, s.expeditions[expOffset + info.color])) {
      const slot = _playBuffer[count];
      slot.key = EXPEDITION_KEYS[cardId];
      slot.cardId = cardId;
      slot.kind = 0;
      count++;
    }
    const slot = _playBuffer[count];
    slot.key = DISCARD_KEYS[cardId];
    slot.cardId = cardId;
    slot.kind = 1;
    count++;
  }

  return { buffer: _playBuffer, count };
}

export function getLegalDrawsInto(s: FastState): { buffer: DrawActionFast[]; count: number } {
  let count = 0;

  if (s.drawPile.length > 0) {
    const slot = _drawBuffer[count];
    slot.key = DRAW_PILE_KEY;
    slot.kind = 0;
    slot.color = -1;
    count++;
  }

  for (let c = 0; c < NUM_COLORS; c++) {
    if (s.discardPiles[c].length > 0 && c !== s.lastDiscardedColor) {
      const slot = _drawBuffer[count];
      slot.key = DRAW_DISCARD_KEYS[c];
      slot.kind = 1;
      slot.color = c;
      count++;
    }
  }

  return { buffer: _drawBuffer, count };
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
