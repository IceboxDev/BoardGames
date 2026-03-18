// ── Card Types ──────────────────────────────────────────────────────────────

export type CardType =
  | "exploding-kitten"
  | "defuse"
  | "attack"
  | "skip"
  | "favor"
  | "shuffle"
  | "see-the-future"
  | "nope"
  | "tacocat"
  | "cattermelon"
  | "potato-cat"
  | "beard-cat"
  | "rainbow-ralphing-cat";

export type CatBreed =
  | "tacocat"
  | "cattermelon"
  | "potato-cat"
  | "beard-cat"
  | "rainbow-ralphing-cat";

export const CAT_BREEDS: CatBreed[] = [
  "tacocat",
  "cattermelon",
  "potato-cat",
  "beard-cat",
  "rainbow-ralphing-cat",
];

export const ACTION_CARD_TYPES: CardType[] = [
  "attack",
  "skip",
  "favor",
  "shuffle",
  "see-the-future",
  "nope",
];

export interface Card {
  id: number;
  type: CardType;
}

// ── Deck Composition (56 cards, Original Edition) ───────────────────────────

export const DECK_COMPOSITION: Record<CardType, number> = {
  "exploding-kitten": 4,
  defuse: 6,
  attack: 4,
  skip: 4,
  favor: 4,
  shuffle: 4,
  "see-the-future": 5,
  nope: 5,
  tacocat: 4,
  cattermelon: 4,
  "potato-cat": 4,
  "beard-cat": 4,
  "rainbow-ralphing-cat": 4,
};

// ── Display Constants ───────────────────────────────────────────────────────

export const CARD_LABELS: Record<CardType, string> = {
  "exploding-kitten": "Exploding Kitten",
  defuse: "Defuse",
  attack: "Attack",
  skip: "Skip",
  favor: "Favor",
  shuffle: "Shuffle",
  "see-the-future": "See the Future",
  nope: "Nope",
  tacocat: "Tacocat",
  cattermelon: "Cattermelon",
  "potato-cat": "Potato Cat",
  "beard-cat": "Beard Cat",
  "rainbow-ralphing-cat": "Rainbow Ralphing Cat",
};

export const CARD_COLORS: Record<CardType, string> = {
  "exploding-kitten": "#ea580c",
  defuse: "#059669",
  attack: "#b91c1c",
  skip: "#1d4ed8",
  favor: "#a16207",
  shuffle: "#15803d",
  "see-the-future": "#7e22ce",
  nope: "#4b5563",
  tacocat: "#92400e",
  cattermelon: "#65a30d",
  "potato-cat": "#ca8a04",
  "beard-cat": "#0f766e",
  "rainbow-ralphing-cat": "#c026d3",
};

export const CARD_EMOJI: Record<CardType, string> = {
  "exploding-kitten": "💣",
  defuse: "🔧",
  attack: "⚔️",
  skip: "🚫",
  favor: "🙏",
  shuffle: "🔀",
  "see-the-future": "🔮",
  nope: "✋",
  tacocat: "🌮",
  cattermelon: "🍉",
  "potato-cat": "🥔",
  "beard-cat": "🧔",
  "rainbow-ralphing-cat": "🌈",
};

// ── Game Phases ──────────────────────────────────────────────────────────────

export type GamePhase =
  | "setup"
  | "action-phase"
  | "nope-window"
  | "resolving-favor"
  | "choosing-target"
  | "choosing-card-name"
  | "choosing-discard"
  | "peeking"
  | "drawing"
  | "exploding"
  | "reinserting"
  | "game-over";

// ── Players ─────────────────────────────────────────────────────────────────

export type PlayerType = "human" | "ai";

export interface PlayerState {
  index: number;
  type: PlayerType;
  hand: Card[];
  alive: boolean;
  aiStrategy?: AIStrategyId;
}

// ── Actions (Discriminated Unions) ──────────────────────────────────────────

export type Action =
  | { type: "play-card"; cardId: number }
  | { type: "play-combo"; cardIds: number[] }
  | { type: "end-action-phase" }
  | { type: "nope"; cardId: number }
  | { type: "pass-nope" }
  | { type: "select-target"; targetIndex: number }
  | { type: "give-card"; cardId: number }
  | { type: "name-card-type"; cardType: CardType }
  | { type: "select-discard-card"; cardId: number }
  | { type: "acknowledge-peek" }
  | { type: "play-defuse"; cardId: number }
  | { type: "reinsert-kitten"; position: number }
  | { type: "skip-defuse" };

// ── Sub-phase Context Types ─────────────────────────────────────────────────

export interface NopeWindowState {
  pendingAction: Action;
  pendingCardIds: number[];
  sourcePlayerIndex: number;
  effectType: CardType | "pair" | "triple" | "five-different";
  nopeChain: { playerIndex: number; cardId: number }[];
  currentPollingIndex: number;
  passedPlayerIndices: number[];
}

export interface FavorContext {
  fromPlayer: number;
  targetPlayer: number;
}

export interface StealContext {
  fromPlayer: number;
  targetPlayer: number | null;
  isNamedSteal: boolean;
  namedType: CardType | null;
}

export interface DiscardPickContext {
  playerIndex: number;
}

export interface PeekContext {
  playerIndex: number;
  cards: Card[];
}

export interface ExplosionContext {
  playerIndex: number;
  kittenCard: Card;
}

// ── Game State ──────────────────────────────────────────────────────────────

export interface GameState {
  phase: GamePhase;
  drawPile: Card[];
  discardPile: Card[];
  players: PlayerState[];
  currentPlayerIndex: number;
  turnsRemaining: number;
  turnCount: number;

  nopeWindow: NopeWindowState | null;
  favorContext: FavorContext | null;
  stealContext: StealContext | null;
  discardPickContext: DiscardPickContext | null;
  peekContext: PeekContext | null;
  explosionContext: ExplosionContext | null;

  actionLog: ActionLogEntry[];
  winner: number | null;
}

// ── Action Log ──────────────────────────────────────────────────────────────

export type ActionLogAction =
  | "play-card"
  | "play-combo"
  | "draw"
  | "nope"
  | "defuse"
  | "exploded"
  | "reinsert"
  | "favor-give"
  | "steal"
  | "peek"
  | "skip-turn"
  | "attack"
  | "shuffle";

export interface ActionLogEntry {
  turn: number;
  playerIndex: number;
  action: ActionLogAction;
  cardType?: CardType;
  cardIds?: number[];
  targetPlayerIndex?: number;
  detail?: string;
}

// ── AI Strategy Types ───────────────────────────────────────────────────────

export type AIStrategyId = "random" | "heuristic-v1" | "ismcts-v1";

export interface AIStrategy {
  id: AIStrategyId;
  label: string;
  description: string;
  pickAction: (state: GameState, legalActions: Action[], playerIndex: number) => Action;
  mctsConfig?: { iterations: number; explorationConstant: number };
}

export const AI_STRATEGY_LABELS: Record<AIStrategyId, string> = {
  random: "Random",
  "heuristic-v1": "Heuristic v1",
  "ismcts-v1": "IS-MCTS v1",
};

export const AI_STRATEGY_DESCRIPTIONS: Record<AIStrategyId, string> = {
  random: "Picks uniformly from legal actions. Baseline for comparison.",
  "heuristic-v1":
    "Hand-coded priorities: conserve defuses, strategic noping, steal from leaders, reinsert kitten deep.",
  "ismcts-v1":
    "Information Set MCTS with determinization for hidden information. Full tree search.",
};

// ── Game Result (Persistence) ───────────────────────────────────────────────

export interface GameResult {
  id: string;
  timestamp: number;
  playerCount: number;
  aiStrategies: AIStrategyId[];
  winner: number;
  winnerIsHuman: boolean;
  turnCount: number;
  eliminationOrder: number[];
}

// ── Helpers ─────────────────────────────────────────────────────────────────

export function isCatCard(type: CardType): type is CatBreed {
  return (CAT_BREEDS as string[]).includes(type);
}

export function isActionCard(type: CardType): boolean {
  return (ACTION_CARD_TYPES as string[]).includes(type);
}

export function canBeUsedInCombo(type: CardType): boolean {
  return type !== "exploding-kitten";
}
