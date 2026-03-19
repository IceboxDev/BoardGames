// --- Card info lookup table (built once, shared across all simulations) ---

export interface CardInfo {
  color: number; // 0-4 mapping to EXPEDITION_COLORS order
  type: number; // 0=wager, 1=number
  value: number; // 0 for wager, 2-10 for number
}

export const NUM_COLORS = 5;
export const NUM_CARDS = 60;
export const CARDS_PER_COLOR = 12; // 3 wagers + 9 numbers
export const WAGERS_PER_COLOR = 3;
export const HAND_SIZE = 8;
export const EXPEDITION_COST = 20;
export const LENGTH_BONUS_THRESHOLD = 8;
export const LENGTH_BONUS = 20;

const _cardInfo: CardInfo[] = [];
for (let color = 0; color < NUM_COLORS; color++) {
  for (let w = 0; w < WAGERS_PER_COLOR; w++) {
    _cardInfo.push({ color, type: 0, value: 0 });
  }
  for (let v = 2; v <= 10; v++) {
    _cardInfo.push({ color, type: 1, value: v });
  }
}
export const CARD_INFO: readonly CardInfo[] = _cardInfo;

// --- Fast mutable game state for MCTS simulation ---

export interface FastState {
  drawPile: number[];
  discardPiles: number[][]; // 5 arrays of card IDs (full stacks, not just tops)
  expeditions: number[][]; // 10 arrays: [0..4] = player 0, [5..9] = player 1
  hands: number[][]; // 2 arrays: [0] = player 0 (human), [1] = player 1 (AI)
  currentPlayer: number; // 0 or 1
  turnPhase: number; // 0=play, 1=draw
  lastDiscardedColor: number; // -1 = none, 0-4 = color index
  gameOver: boolean;
  pinnedOpponentCards: number[]; // cards known to be in opponent hand (drawn from discard)
}

// --- MCTS tree node ---

export interface MCTSNode {
  actionKey: string;
  parent: MCTSNode | null;
  children: Map<string, MCTSNode>;
  visits: number;
  totalReward: number;
}

// --- Configuration ---

export interface MCTSConfig {
  iterations: number;
  explorationConstant: number; // UCB1 C parameter
  useStrictFilters?: boolean; // when true, filter playable discards and unplayable draw-from-discard
  useSoftDrawFilter?: boolean; // when true, only filter unplayable draws with no color support
}

export const DEFAULT_CONFIG: MCTSConfig = {
  iterations: 6000,
  explorationConstant: 0.7,
};

// --- Fast action types ---

export interface PlayActionFast {
  key: string;
  cardId: number;
  kind: number; // 0=expedition, 1=discard
}

export interface DrawActionFast {
  key: string;
  kind: number; // 0=draw-pile, 1=discard-pile
  color: number; // only meaningful when kind=1
}

// --- Rollout heuristic function types ---

export type PickPlayFn = (s: FastState, plays: PlayActionFast[], count: number) => PlayActionFast;
export type PickDrawFn = (s: FastState, draws: DrawActionFast[], count: number) => DrawActionFast;

// --- Action key encoding/decoding (precomputed for zero-alloc lookups) ---

const _expeditionKeys: string[] = [];
const _discardKeys: string[] = [];
for (let id = 0; id < NUM_CARDS; id++) {
  const info = _cardInfo[id];
  _expeditionKeys[id] = `e:${info.color}:${info.value}`;
  _discardKeys[id] = `d:${info.color}:${info.value}`;
}
export const EXPEDITION_KEYS: readonly string[] = _expeditionKeys;
export const DISCARD_KEYS: readonly string[] = _discardKeys;

const _drawDiscardKeys: string[] = [];
for (let c = 0; c < NUM_COLORS; c++) {
  _drawDiscardKeys[c] = `P:${c}`;
}
export const DRAW_DISCARD_KEYS: readonly string[] = _drawDiscardKeys;

export function playExpeditionKey(cardId: number): string {
  return _expeditionKeys[cardId];
}

export function playDiscardKey(cardId: number): string {
  return _discardKeys[cardId];
}

export const DRAW_PILE_KEY = "D";

export function drawDiscardKey(color: number): string {
  return _drawDiscardKeys[color];
}
