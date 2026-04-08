// ---------------------------------------------------------------------------
// Card primitives
// ---------------------------------------------------------------------------

export type Suit = "hearts" | "diamonds" | "clubs" | "spades";

/** 6–10 literal, J=11, Q=12, K=13, A=14 */
export type Rank = 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;

export interface Card {
  id: number;
  suit: Suit;
  rank: Rank;
}

// ---------------------------------------------------------------------------
// Game state
// ---------------------------------------------------------------------------

export type GamePhase = "idle" | "attacking" | "defending" | "throwing-in" | "game-over";

export interface BoutPair {
  attack: Card;
  defense: Card | null;
}

export type PlayerType = "human" | "ai";

export interface Player {
  index: number;
  type: PlayerType;
  hand: Card[];
  isOut: boolean;
  aiStrategy?: AIStrategyId;
}

export interface GameState {
  phase: GamePhase;
  players: Player[];
  drawPile: Card[];
  trumpCard: Card;
  trumpSuit: Suit;
  discardPile: Card[];
  table: BoutPair[];
  attackerIndex: number;
  defenderIndex: number;
  /** Captured at bout start — limits max attack cards for this bout */
  defenderStartHandSize: number;
  turnCount: number;
  /** Index of the losing player, or null if draw */
  durak: number | null;
  actionLog: ActionLogEntry[];
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export type Action =
  | { type: "attack"; cardId: number }
  | { type: "defend"; attackIndex: number; cardId: number }
  | { type: "throw-in"; cardId: number }
  | { type: "take" }
  | { type: "pass" };

// ---------------------------------------------------------------------------
// AI
// ---------------------------------------------------------------------------

export type AIStrategyId = "random" | "heuristic-v1";

export interface AIStrategy {
  pickAction(state: GameState, legalActions: Action[], player: number): Action;
}

export const AI_STRATEGY_LABELS: Record<AIStrategyId, string> = {
  random: "Random",
  "heuristic-v1": "Heuristic v1",
};

export const AI_STRATEGY_DESCRIPTIONS: Record<AIStrategyId, string> = {
  random: "Plays random legal moves. Good for testing.",
  "heuristic-v1": "Plays low cards first, saves trumps. A solid beginner opponent.",
};

// ---------------------------------------------------------------------------
// Player view (hidden info stripped)
// ---------------------------------------------------------------------------

export interface DurakPlayerView {
  phase: GamePhase;
  hand: Card[];
  trumpCard: Card;
  trumpSuit: Suit;
  table: BoutPair[];
  drawPileCount: number;
  discardPileCount: number;
  players: {
    index: number;
    type: PlayerType;
    handCount: number;
    isOut: boolean;
    aiStrategy?: AIStrategyId;
  }[];
  attackerIndex: number;
  defenderIndex: number;
  turnCount: number;
  durak: number | null;
  actionLog: ActionLogEntry[];
}

export interface DurakResult {
  durak: number | null;
  isDraw: boolean;
  turnCount: number;
}

// ---------------------------------------------------------------------------
// Action Log
// ---------------------------------------------------------------------------

export type ActionLogAction =
  | "attack"
  | "defend"
  | "throw-in"
  | "take"
  | "pass"
  | "bout-won"
  | "bout-lost";

export interface ActionLogEntry {
  turn: number;
  playerIndex: number;
  action: ActionLogAction;
  card?: Card;
  attackCard?: Card; // for defend — which attack card was beaten
}

// ---------------------------------------------------------------------------
// Display constants
// ---------------------------------------------------------------------------

export const RANK_LABELS: Record<Rank, string> = {
  6: "6",
  7: "7",
  8: "8",
  9: "9",
  10: "10",
  11: "J",
  12: "Q",
  13: "K",
  14: "A",
};

export const SUIT_SYMBOLS: Record<Suit, string> = {
  hearts: "\u2665",
  diamonds: "\u2666",
  clubs: "\u2663",
  spades: "\u2660",
};

export const SUIT_COLORS: Record<Suit, "red" | "black"> = {
  hearts: "red",
  diamonds: "red",
  clubs: "black",
  spades: "black",
};

export const ALL_SUITS: Suit[] = ["hearts", "diamonds", "clubs", "spades"];
export const ALL_RANKS: Rank[] = [6, 7, 8, 9, 10, 11, 12, 13, 14];

export const HAND_SIZE = 6;
