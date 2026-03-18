// ── Card Info Lookup ────────────────────────────────────────────────────────

export const NUM_CARD_TYPES = 13;
export const TOTAL_CARDS = 56;

/**
 * Card type IDs for fast lookup.
 * Matches the order in the full deck build.
 */
export const CT_EXPLODING = 0;
export const CT_DEFUSE = 1;
export const CT_ATTACK = 2;
export const CT_SKIP = 3;
export const CT_FAVOR = 4;
export const CT_SHUFFLE = 5;
export const CT_SEE_FUTURE = 6;
export const CT_NOPE = 7;
export const CT_TACOCAT = 8;
export const CT_CATTERMELON = 9;
export const CT_POTATO = 10;
export const CT_BEARD = 11;
export const CT_RAINBOW = 12;

const _cardTypeForId: number[] = [];
const counts = [4, 6, 4, 4, 4, 4, 5, 5, 4, 4, 4, 4, 4];
for (let t = 0; t < counts.length; t++) {
  for (let i = 0; i < counts[t]; i++) {
    _cardTypeForId.push(t);
  }
}
export const CARD_TYPE_FOR_ID: readonly number[] = _cardTypeForId;

// ── Game Phase IDs ──────────────────────────────────────────────────────────

export const PH_ACTION = 0;
export const PH_NOPE = 1;
export const PH_CHOOSING_TARGET = 2;
export const PH_FAVOR = 3;
export const PH_CHOOSING_NAME = 4;
export const PH_CHOOSING_DISCARD = 5;
export const PH_PEEKING = 6;
export const PH_EXPLODING = 7;
export const PH_REINSERTING = 8;
export const PH_GAME_OVER = 9;

// ── Fast Action ─────────────────────────────────────────────────────────────

export const ACT_PLAY_CARD = 0;
export const ACT_END_ACTION = 1;
export const ACT_NOPE = 2;
export const ACT_PASS_NOPE = 3;
export const ACT_SELECT_TARGET = 4;
export const ACT_GIVE_CARD = 5;
export const ACT_NAME_TYPE = 6;
export const ACT_SELECT_DISCARD = 7;
export const ACT_ACK_PEEK = 8;
export const ACT_DEFUSE = 9;
export const ACT_REINSERT = 10;
export const ACT_SKIP_DEFUSE = 11;
export const ACT_PLAY_COMBO = 12;

export interface FastAction {
  kind: number;
  key: string;
  cardId: number;
  cardIds: number[];
  targetIndex: number;
  position: number;
  cardType: number;
}

export function makeAction(kind: number, extra: Partial<FastAction> = {}): FastAction {
  return {
    kind,
    key: extra.key ?? `${kind}`,
    cardId: extra.cardId ?? -1,
    cardIds: extra.cardIds ?? [],
    targetIndex: extra.targetIndex ?? -1,
    position: extra.position ?? -1,
    cardType: extra.cardType ?? -1,
  };
}

// ── Fast State ──────────────────────────────────────────────────────────────

export interface FastState {
  drawPile: number[];
  discardPile: number[];
  hands: number[][];
  alive: boolean[];
  currentPlayer: number;
  turnsRemaining: number;
  phase: number;
  gameOver: boolean;
  winner: number;
  playerCount: number;

  // Nope context
  nopeSourcePlayer: number;
  nopeEffectType: number;
  nopeChainLength: number;
  nopePollingPlayer: number;
  nopePassed: boolean[];

  // Favor context
  favorFrom: number;
  favorTarget: number;

  // Steal context
  stealFrom: number;
  stealTarget: number;
  stealIsNamed: boolean;

  // Explosion context
  explodingPlayer: number;
  explodingCardId: number;
}

// ── MCTS Node ───────────────────────────────────────────────────────────────

export interface MCTSNode {
  actionKey: string;
  parent: MCTSNode | null;
  children: Map<string, MCTSNode>;
  visits: number;
  totalReward: number;
}

export interface MCTSConfig {
  iterations: number;
  explorationConstant: number;
}

export const DEFAULT_MCTS_CONFIG: MCTSConfig = {
  iterations: 2000,
  explorationConstant: 1.0,
};
