import { buildDeck, dealHands, shuffle } from "./deck";
import type { AIEngine, Card, DrawAction, GameState, PlayAction } from "./types";
import { emptyDiscardPiles, emptyExpeditions } from "./types";

export function createInitialState(aiEngine: AIEngine): GameState {
  const deck = shuffle(buildDeck());
  const { playerHand, aiHand, drawPile } = dealHands(deck);

  return {
    drawPile,
    discardPiles: emptyDiscardPiles(),
    playerExpeditions: emptyExpeditions(),
    aiExpeditions: emptyExpeditions(),
    playerHand,
    aiHand,
    currentPlayer: "human",
    turnPhase: "play",
    phase: "playing",
    aiEngine,
    lastDiscardedColor: null,
    turnCount: 0,
  };
}

export function applyPlay(state: GameState, action: PlayAction): GameState {
  const isHuman = state.currentPlayer === "human";
  const handKey = isHuman ? "playerHand" : "aiHand";
  const expedKey = isHuman ? "playerExpeditions" : "aiExpeditions";
  const hand = state[handKey].filter((c) => c.id !== action.card.id);

  if (action.kind === "expedition") {
    const color = action.card.color;
    const expedition = [...state[expedKey][color], action.card];

    return {
      ...state,
      [handKey]: hand,
      [expedKey]: {
        ...state[expedKey],
        [color]: expedition,
      },
      turnPhase: "draw",
      lastDiscardedColor: null,
    };
  }

  // Discard
  const color = action.card.color;
  const pile = [...state.discardPiles[color], action.card];

  return {
    ...state,
    [handKey]: hand,
    discardPiles: {
      ...state.discardPiles,
      [color]: pile,
    },
    turnPhase: "draw",
    lastDiscardedColor: color,
  };
}

export function applyDraw(state: GameState, action: DrawAction): GameState {
  const isHuman = state.currentPlayer === "human";
  const handKey = isHuman ? "playerHand" : "aiHand";

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

  const newHand = [...state[handKey], drawnCard];
  const gameOver = action.kind === "draw-pile" && newDrawPile.length === 0;

  return {
    ...state,
    [handKey]: newHand,
    drawPile: newDrawPile,
    discardPiles: newDiscardPiles,
    currentPlayer: gameOver
      ? state.currentPlayer
      : state.currentPlayer === "human"
        ? "ai"
        : "human",
    turnPhase: "play",
    phase: gameOver ? "game-over" : state.phase,
    lastDiscardedColor: null,
    turnCount: state.turnCount + 1,
  };
}
