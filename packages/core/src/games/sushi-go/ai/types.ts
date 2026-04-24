import type { CardType } from "../types";

// ── Card type numeric encoding ────────────────────────────────────────

export const NUM_TYPES = 12;

// Indices into Uint8Array count arrays
export const T_TEMPURA = 0;
export const T_SASHIMI = 1;
export const T_DUMPLING = 2;
export const T_MAKI1 = 3;
export const T_MAKI2 = 4;
export const T_MAKI3 = 5;
export const T_EGG = 6;
export const T_SALMON = 7;
export const T_SQUID = 8;
export const T_WASABI = 9;
export const T_PUDDING = 10;
export const T_CHOPSTICKS = 11;

/** Map CardType string → numeric index */
export const CARD_TYPE_INDEX: Record<CardType, number> = {
  tempura: T_TEMPURA,
  sashimi: T_SASHIMI,
  dumpling: T_DUMPLING,
  "maki-1": T_MAKI1,
  "maki-2": T_MAKI2,
  "maki-3": T_MAKI3,
  "egg-nigiri": T_EGG,
  "salmon-nigiri": T_SALMON,
  "squid-nigiri": T_SQUID,
  wasabi: T_WASABI,
  pudding: T_PUDDING,
  chopsticks: T_CHOPSTICKS,
};

/** Map numeric index → CardType string (for UI conversion) */
export const INDEX_CARD_TYPE: CardType[] = [
  "tempura",
  "sashimi",
  "dumpling",
  "maki-1",
  "maki-2",
  "maki-3",
  "egg-nigiri",
  "salmon-nigiri",
  "squid-nigiri",
  "wasabi",
  "pudding",
  "chopsticks",
];

/** Nigiri point values indexed by (typeIndex - T_EGG) */
export const NIGIRI_VALUES = [1, 2, 3]; // egg=1, salmon=2, squid=3

/** Maki counts indexed by (typeIndex - T_MAKI1) */
export const MAKI_COUNTS = [1, 2, 3];

// ── Compact state for search (count-based, no Card IDs) ──────────────

export interface MiniMaxPlayerState {
  hand: Uint8Array; // NUM_TYPES counts
  tableau: Uint8Array; // NUM_TYPES counts
  unusedWasabi: number;
  /** Per-nigiri-type boost counts: index 0=egg, 1=salmon, 2=squid */
  boostedNigiri: Uint8Array; // 3 elements
  puddings: number; // from prior rounds
}

export interface MiniMaxState {
  players: [MiniMaxPlayerState, MiniMaxPlayerState];
  turn: number; // 2..10 within round
  round: number;
  /** Score difference (AI minus opponent) from prior completed rounds. */
  priorScoreDiff: number;
}

// ── Actions & tree nodes ────────────────────────────────────────────────

export type MinimaxAction =
  | { type: 0; card: number } // pick: card is type index
  | { type: 1; card: number; second: number }; // chopsticks: two type indices

// ── Transposition table entry ───────────────────────────────────────────

export interface TranspositionEntry {
  value: number;
  bestAction: MinimaxAction | null;
}

// ── Nash equilibrium types ─────────────────────────────────────────────

export interface NashTransEntry {
  value: number;
  p1Actions: MinimaxAction[];
  p2Actions: MinimaxAction[];
  p1Strategy: number[]; // probability weights over p1Actions
  p2Strategy: number[]; // probability weights over p2Actions
}
