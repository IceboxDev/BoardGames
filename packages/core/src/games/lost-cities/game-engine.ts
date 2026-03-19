import { buildDeck, dealHands, shuffle } from "./deck";
import type { Card, DrawAction, Expeditions, GameState, PlayAction } from "./types";
import { emptyDiscardPiles, emptyExpeditions, opponent } from "./types";

export function createInitialState(): GameState {
  const deck = shuffle(buildDeck());
  const { hands, drawPile } = dealHands(deck);

  return {
    drawPile,
    discardPiles: emptyDiscardPiles(),
    expeditions: [emptyExpeditions(), emptyExpeditions()],
    hands,
    currentPlayer: 0,
    turnPhase: "play",
    phase: "playing",
    lastDiscardedColor: null,
    turnCount: 0,
    knownOpponentCards: [[], []],
  };
}

export function applyPlay(state: GameState, action: PlayAction): GameState {
  const p = state.currentPlayer;
  const hand = state.hands[p].filter((c) => c.id !== action.card.id);
  const newHands: [Card[], Card[]] = [...state.hands];
  newHands[p] = hand;

  // Remove played card from opponent's known-card tracking
  const newKnown: [number[], number[]] = [
    state.knownOpponentCards[0].filter((id) => id !== action.card.id),
    state.knownOpponentCards[1].filter((id) => id !== action.card.id),
  ];

  if (action.kind === "expedition") {
    const color = action.card.color;
    const newExp: [Expeditions, Expeditions] = [
      { ...state.expeditions[0] },
      { ...state.expeditions[1] },
    ];
    newExp[p] = { ...newExp[p], [color]: [...state.expeditions[p][color], action.card] };

    return {
      ...state,
      hands: newHands,
      expeditions: newExp,
      turnPhase: "draw",
      lastDiscardedColor: null,
      knownOpponentCards: newKnown,
    };
  }

  const color = action.card.color;
  const pile = [...state.discardPiles[color], action.card];

  return {
    ...state,
    hands: newHands,
    discardPiles: {
      ...state.discardPiles,
      [color]: pile,
    },
    turnPhase: "draw",
    lastDiscardedColor: color,
    knownOpponentCards: newKnown,
  };
}

export function applyDraw(state: GameState, action: DrawAction): GameState {
  const p = state.currentPlayer;
  const opp = opponent(p);

  let drawnCard: Card;
  let newDrawPile = state.drawPile;
  let newDiscardPiles = state.discardPiles;

  if (action.kind === "draw-pile") {
    drawnCard = state.drawPile[state.drawPile.length - 1];
    newDrawPile = state.drawPile.slice(0, -1);
  } else {
    const pile = state.discardPiles[action.color];
    drawnCard = pile[pile.length - 1];
    newDiscardPiles = {
      ...state.discardPiles,
      [action.color]: pile.slice(0, -1),
    };
  }

  const newHands: [Card[], Card[]] = [...state.hands];
  newHands[p] = [...state.hands[p], drawnCard];
  const gameOver = action.kind === "draw-pile" && newDrawPile.length === 0;

  // When drawing from discard, the opponent sees which card was taken
  const newKnown: [number[], number[]] = [
    [...state.knownOpponentCards[0]],
    [...state.knownOpponentCards[1]],
  ];
  if (action.kind === "discard-pile") {
    newKnown[opp] = [...newKnown[opp], drawnCard.id];
  }

  return {
    ...state,
    hands: newHands,
    drawPile: newDrawPile,
    discardPiles: newDiscardPiles,
    currentPlayer: gameOver ? state.currentPlayer : opponent(state.currentPlayer),
    turnPhase: "play",
    phase: gameOver ? "game-over" : state.phase,
    lastDiscardedColor: null,
    turnCount: state.turnCount + 1,
    knownOpponentCards: newKnown,
  };
}
