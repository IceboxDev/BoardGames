export type ExpeditionColor = "yellow" | "blue" | "white" | "green" | "red";
export type CardType = "wager" | "number";
export type AIEngine = "ismcts-v1" | "ismcts-v4" | "ismcts-v5" | "ismcts-v6";
export type PlayerIndex = 0 | 1;

export function opponent(p: PlayerIndex): PlayerIndex {
  return (1 - p) as PlayerIndex;
}
export type TurnPhase = "play" | "draw";
export type GamePhase = "idle" | "playing" | "animating" | "game-over";

export interface Card {
  id: number;
  color: ExpeditionColor;
  type: CardType;
  value: number; // 0 for wager, 2-10 for number
}

export interface Expeditions {
  yellow: Card[];
  blue: Card[];
  white: Card[];
  green: Card[];
  red: Card[];
}

export interface DiscardPiles {
  yellow: Card[];
  blue: Card[];
  white: Card[];
  green: Card[];
  red: Card[];
}

export interface PlayToExpedition {
  kind: "expedition";
  card: Card;
}

export interface PlayToDiscard {
  kind: "discard";
  card: Card;
}

export type PlayAction = PlayToExpedition | PlayToDiscard;

export interface DrawFromPile {
  kind: "draw-pile";
}

export interface DrawFromDiscard {
  kind: "discard-pile";
  color: ExpeditionColor;
}

export type DrawAction = DrawFromPile | DrawFromDiscard;

export interface AIMove {
  play: PlayAction;
  draw: DrawAction;
}

export interface GameState {
  drawPile: Card[];
  discardPiles: DiscardPiles;
  expeditions: [Expeditions, Expeditions];
  hands: [Card[], Card[]];
  currentPlayer: PlayerIndex;
  turnPhase: TurnPhase;
  phase: GamePhase;
  lastDiscardedColor: ExpeditionColor | null;
  turnCount: number;
  /** Cards the opponent is known to hold (drawn from discard), per player perspective */
  knownOpponentCards: [number[], number[]];
}

export interface ExpeditionScore {
  color: ExpeditionColor;
  cardValues: number;
  expeditionCost: number;
  wagerMultiplier: number;
  subtotal: number;
  lengthBonus: number;
  total: number;
  cardCount: number;
  started: boolean;
}

export interface PlayerScore {
  expeditions: ExpeditionScore[];
  total: number;
}

export interface GameResult {
  id: string;
  timestamp: number;
  aiEngine: AIEngine;
  playerScore: PlayerScore;
  aiScore: PlayerScore;
  won: boolean;
  margin: number;
  turnCount: number;
}

export interface ActionLogEntry {
  turn: number;
  player: PlayerIndex;
  action: "play-expedition" | "play-discard" | "draw-pile" | "draw-discard";
  card: Card;
  color?: ExpeditionColor;
}

export const AI_ENGINE_LABELS: Record<AIEngine, string> = {
  "ismcts-v1": "Baseline",
  "ismcts-v4": "Strict",
  "ismcts-v5": "Adaptive",
  "ismcts-v6": "Adaptive+",
};

export const AI_ENGINE_DESCRIPTIONS: Record<AIEngine, string> = {
  "ismcts-v1": "Baseline MCTS with weak rollout heuristic. 4k iterations.",
  "ismcts-v4":
    "Strict tree filters, wager-first, low-first ordering, tighter expedition starts, opponent-aware discards. 8k iterations.",
  "ismcts-v5":
    "Game-stage aware rollout, conservative starts, opponent-aware discards, known-card pinning. 16k iterations.",
  "ismcts-v6":
    "Adaptive rollout plus dead-to-both discard shaping and terminal penalty for stranded playable cards. 16k iterations.",
};

export const EXPEDITION_COLORS: ExpeditionColor[] = ["yellow", "blue", "white", "green", "red"];

export const COLOR_HEX: Record<ExpeditionColor, string> = {
  yellow: "#f59e0b",
  blue: "#3b82f6",
  white: "#d1d5db",
  green: "#22c55e",
  red: "#ef4444",
};

export const COLOR_LABELS: Record<ExpeditionColor, string> = {
  yellow: "Desert",
  blue: "Undersea",
  white: "Himalaya",
  green: "Rainforest",
  red: "Volcano",
};

export function emptyExpeditions(): Expeditions {
  return { yellow: [], blue: [], white: [], green: [], red: [] };
}

export function emptyDiscardPiles(): DiscardPiles {
  return { yellow: [], blue: [], white: [], green: [], red: [] };
}
