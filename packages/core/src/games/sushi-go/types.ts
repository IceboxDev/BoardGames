// ── Card Types ──────────────────────────────────────────────────────────────

export type CardType =
  | "tempura"
  | "sashimi"
  | "dumpling"
  | "maki-1"
  | "maki-2"
  | "maki-3"
  | "salmon-nigiri"
  | "squid-nigiri"
  | "egg-nigiri"
  | "pudding"
  | "wasabi"
  | "chopsticks";

export interface Card {
  id: number;
  type: CardType;
}

// ── Deck Composition (108 cards) ───────────────────────────────────────────

export const DECK_COMPOSITION: Record<CardType, number> = {
  tempura: 14,
  sashimi: 14,
  dumpling: 14,
  "maki-1": 6,
  "maki-2": 12,
  "maki-3": 8,
  "salmon-nigiri": 10,
  "squid-nigiri": 5,
  "egg-nigiri": 5,
  pudding: 10,
  wasabi: 6,
  chopsticks: 4,
};

// ── Hand Sizes ─────────────────────────────────────────────────────────────

export const HAND_SIZES: Record<number, number> = {
  2: 10,
  3: 9,
  4: 8,
  5: 7,
};

// ── Display Constants ──────────────────────────────────────────────────────

export const CARD_LABELS: Record<CardType, string> = {
  tempura: "Tempura",
  sashimi: "Sashimi",
  dumpling: "Dumpling",
  "maki-1": "Maki Roll x1",
  "maki-2": "Maki Roll x2",
  "maki-3": "Maki Roll x3",
  "salmon-nigiri": "Salmon Nigiri",
  "squid-nigiri": "Squid Nigiri",
  "egg-nigiri": "Egg Nigiri",
  pudding: "Pudding",
  wasabi: "Wasabi",
  chopsticks: "Chopsticks",
};

export const CARD_COLORS: Record<CardType, string> = {
  tempura: "#f5a623",
  sashimi: "#2ecc71",
  dumpling: "#f7dc6f",
  "maki-1": "#e74c3c",
  "maki-2": "#e74c3c",
  "maki-3": "#e74c3c",
  "salmon-nigiri": "#f1948a",
  "squid-nigiri": "#bb8fce",
  "egg-nigiri": "#f9e79f",
  pudding: "#f5b7b1",
  wasabi: "#58d68d",
  chopsticks: "#aeb6bf",
};

export const CARD_EMOJI: Record<CardType, string> = {
  tempura: "\u{1F364}",
  sashimi: "\u{1F41F}",
  dumpling: "\u{1F95F}",
  "maki-1": "\u{1F534}",
  "maki-2": "\u{1F534}",
  "maki-3": "\u{1F534}",
  "salmon-nigiri": "\u{1F363}",
  "squid-nigiri": "\u{1F991}",
  "egg-nigiri": "\u{1F95A}",
  pudding: "\u{1F36E}",
  wasabi: "\u{1F33F}",
  chopsticks: "\u{1F962}",
};

// ── Scoring Constants ──────────────────────────────────────────────────────

export const DUMPLING_SCORES = [0, 1, 3, 6, 10, 15] as const;

// ── Action Log ────────────────────────────────────────────────────────────

export type SushiGoLogAction = "reveal" | "chopsticks" | "round-end" | "game-end";

export interface CategoryScoreBreakdown {
  maki: number;
  tempura: number;
  sashimi: number;
  dumpling: number;
  nigiri: number;
  total: number;
}

export interface RoundEndSnapshot {
  tableau: Card[];
  wasabiBoostedNigiriIds: number[];
  puddings: number;
}

export interface ActionLogEntry {
  round: number;
  turn: number;
  playerIndex: number;
  action: SushiGoLogAction;
  cards?: Card[];
  usedChopsticks?: boolean;
  scores?: number[];
  /** Per-player category breakdown (round-end, game-end) */
  categoryScores?: CategoryScoreBreakdown[];
  /** Player board snapshots at round end (before tableau is cleared) */
  roundSnapshots?: RoundEndSnapshot[];
  /** Maki roll totals per player (for round-end display) */
  makiTotals?: number[];
  /** Pudding scores (game-end only) */
  puddingScores?: number[];
}

// ── Game Phases ────────────────────────────────────────────────────────────

export type GamePhase = "selecting" | "revealing" | "game-over";

// ── Player State ───────────────────────────────────────────────────────────

export interface PlayerState {
  hand: Card[];
  tableau: Card[];
  unusedWasabi: number;
  wasabiBoostedNigiriIds: number[];
  puddings: number;
}

// ── Selection ──────────────────────────────────────────────────────────────

export interface Selection {
  cardId: number;
  secondCardId?: number;
  chopsticksId?: number;
}

export interface RevealedCards {
  playerIndex: number;
  cards: Card[];
  returnedChopsticks: boolean;
}

// ── Game State ─────────────────────────────────────────────────────────────

export interface GameState {
  phase: GamePhase;
  round: number;
  turn: number;
  playerCount: number;
  players: PlayerState[];
  selections: (Selection | null)[];
  lastRevealed: RevealedCards[];
  roundScores: number[][];
  totalScores: number[];
  actionLog: ActionLogEntry[];
}

// ── Actions ────────────────────────────────────────────────────────────────

export type SushiGoAction =
  | { type: "select-card"; cardId: number }
  | { type: "select-with-chopsticks"; cardId: number; secondCardId: number };

// ── Helpers ────────────────────────────────────────────────────────────────

export function makiCount(type: CardType): number {
  if (type === "maki-1") return 1;
  if (type === "maki-2") return 2;
  if (type === "maki-3") return 3;
  return 0;
}

export function isNigiri(type: CardType): boolean {
  return type === "egg-nigiri" || type === "salmon-nigiri" || type === "squid-nigiri";
}

export function nigiriValue(type: CardType): number {
  if (type === "egg-nigiri") return 1;
  if (type === "salmon-nigiri") return 2;
  if (type === "squid-nigiri") return 3;
  return 0;
}
