export type ExpeditionColor = "yellow" | "blue" | "white" | "green" | "red";
export type CardType = "wager" | "number";
export type AIEngine = "ismcts-v1" | "ismcts-v2" | "ismcts-v3";
export type Player = "human" | "ai";
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
  playerExpeditions: Expeditions;
  aiExpeditions: Expeditions;
  playerHand: Card[];
  aiHand: Card[];
  currentPlayer: Player;
  turnPhase: TurnPhase;
  phase: GamePhase;
  aiEngine: AIEngine;
  lastDiscardedColor: ExpeditionColor | null;
  turnCount: number;
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
  player: Player;
  action: "play-expedition" | "play-discard" | "draw-pile" | "draw-discard";
  card: Card;
  color?: ExpeditionColor;
}

export interface GameLog {
  id: string;
  timestamp: number;
  aiEngine: AIEngine;
  initialDeal: {
    playerHand: Card[];
    aiHand: Card[];
    drawPile: Card[];
  };
  actions: ActionLogEntry[];
  finalScores: { player: PlayerScore; ai: PlayerScore } | null;
}

export const AI_ENGINE_LABELS: Record<AIEngine, string> = {
  "ismcts-v1": "IS-MCTS v1",
  "ismcts-v2": "IS-MCTS v2",
  "ismcts-v3": "IS-MCTS v3",
};

export const AI_ENGINE_DESCRIPTIONS: Record<AIEngine, string> = {
  "ismcts-v1": "Original IS-MCTS with weak rollout heuristic. Serves as baseline for comparison.",
  "ismcts-v2":
    "Improved IS-MCTS with strong rollout heuristic, reward normalization, and combined play+draw tree search.",
  "ismcts-v3":
    "Rewritten heuristic: wager-first priority, value-scaled discard penalties, zero-tolerance for unplayable draws. 8000 iterations.",
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
