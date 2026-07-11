// ── Primitives ──────────────────────────────────────────────────────────────

export const RESOURCE_TYPES = ["wood", "stone", "clay", "ore", "glass", "loom", "papyrus"] as const;
export type ResourceType = (typeof RESOURCE_TYPES)[number];

export const RAW_RESOURCES = ["wood", "stone", "clay", "ore"] as const;
export const MANUFACTURED_RESOURCES = ["glass", "loom", "papyrus"] as const;

export const SCIENCE_SYMBOLS = ["gear", "compass", "tablet"] as const;
export type ScienceSymbol = (typeof SCIENCE_SYMBOLS)[number];

export const CARD_COLORS = ["brown", "grey", "blue", "yellow", "red", "green", "purple"] as const;
export type CardColor = (typeof CARD_COLORS)[number];

export type Age = 1 | 2 | 3;

/** Whose board an effect counts cards/stages/tokens on. */
export type CountScope = "self" | "left" | "right";

// ── Costs & effects ─────────────────────────────────────────────────────────

export interface Cost {
  /** Coins paid to the bank (e.g. Tree Farm). */
  coins?: number;
  resources?: Partial<Record<ResourceType, number>>;
}

export type CardEffect =
  /** Produces 1 unit per turn; >1 entries = choose one. `count` = fixed multi-output. */
  | { kind: "production"; resources: readonly ResourceType[]; count?: number }
  | { kind: "points"; amount: number }
  | { kind: "shields"; amount: number }
  | { kind: "science"; symbol: ScienceSymbol }
  | { kind: "coins"; amount: number }
  | { kind: "coins-per-card"; color: CardColor; scopes: readonly CountScope[]; amount: number }
  | { kind: "coins-per-stage"; scopes: readonly CountScope[]; amount: number }
  | { kind: "points-per-card"; color: CardColor; scopes: readonly CountScope[]; amount: number }
  | { kind: "points-per-stage"; scopes: readonly CountScope[]; amount: number }
  | { kind: "points-per-defeat"; scopes: readonly CountScope[]; amount: number }
  | {
      kind: "trade-discount";
      resources: "raw" | "manufactured";
      neighbors: readonly ("left" | "right")[];
    }
  /** Counts as any one science symbol, resolved optimally at scoring. */
  | { kind: "science-wildcard" };

// ── Cards ───────────────────────────────────────────────────────────────────

export interface CardDef {
  /** Stable rules key — chains and guild counting reference names. */
  name: string;
  age: Age;
  color: CardColor;
  cost: Cost;
  effects: readonly CardEffect[];
  /** Names of earlier cards that let this one be built for free. */
  chainFrom?: readonly string[];
  /** Player counts at which one more copy enters the deck (printed "3+", "4+"...). */
  copies: readonly number[];
}

/**
 * A physical card instance: `${name}@${age}#${copyIndex}` — unique and
 * serializable. The age is part of the id because Loom/Glassworks/Press exist
 * as separate physical cards in ages 1 and 2.
 */
export type CardId = string;

export function cardIdName(id: CardId): string {
  const at = id.lastIndexOf("@");
  return at === -1 ? id : id.slice(0, at);
}

export function makeCardId(name: string, age: Age, copyIndex: number): CardId {
  return `${name}@${age}#${copyIndex}`;
}

// ── Wonders ─────────────────────────────────────────────────────────────────

export type WonderStageEffect =
  | CardEffect
  /** Halikarnassos: build one card from the discard pile for free. */
  | { kind: "play-discarded" }
  /** Olympia A: build one card per age for free. */
  | { kind: "free-build-per-age" }
  /** Babylon B: play the 7th card at the end of each age instead of discarding it. */
  | { kind: "play-seventh-card" }
  /** Olympia B: copy one guild from a neighbor at game end (scoring only). */
  | { kind: "copy-guild" };

export interface WonderStage {
  cost: Cost;
  effects: readonly WonderStageEffect[];
}

export interface WonderSide {
  initialResource: ResourceType;
  stages: readonly WonderStage[];
}

export const WONDER_IDS = [
  "giza",
  "babylon",
  "olympia",
  "rhodes",
  "ephesos",
  "alexandria",
  "halikarnassos",
] as const;
export type WonderId = (typeof WONDER_IDS)[number];

export interface WonderDef {
  id: WonderId;
  name: string;
  sides: { A: WonderSide; B: WonderSide };
}

// ── Player & game state ─────────────────────────────────────────────────────

export interface PlayerState {
  wonderId: WonderId;
  side: "A" | "B";
  stagesBuilt: number;
  coins: number;
  /** Played cards (color/effects derivable via the card def). */
  tableau: CardId[];
  /** Military conflict tokens, e.g. [1, -1, 3]. List kept for UI + Strategists Guild. */
  militaryTokens: number[];
  /** Olympia A once-per-age free build. */
  freeBuildUsedThisAge: boolean;
  // ── Edifice expansion (all empty/0 in a base game) ──
  /** VP-token values gained from constructed Edifices. */
  victoryTokens: number[];
  /** Debt-token values (negative VP) from failed Edifices. */
  debtTokens: number[];
  /** Extra shields from Edifice rewards (added to military strength). */
  bonusShields: number;
  /** Extra production (choice-of-one sets) from Edifice rewards. */
  bonusProduction: ResourceType[][];
}

/**
 * How a build is paid for. Only the coin split to neighbors affects game
 * state — which specific resource came from where does not. Coin costs to the
 * bank are implied by the card def.
 */
export type Payment =
  | { kind: "resources"; left: number; right: number }
  | { kind: "chain" }
  | { kind: "free-build" };

export interface BuildWonderAction {
  type: "build-wonder";
  cardId: CardId;
  payment: { kind: "resources"; left: number; right: number };
  /** Edifice: also participate in this Age's project (pay its coin cost, take a pawn). */
  participate?: boolean;
}

export type SevenWondersAction =
  | { type: "play-card"; cardId: CardId; payment: Payment }
  | BuildWonderAction
  | { type: "discard"; cardId: CardId }
  // Pending-phase actions (turn-based, not simultaneous):
  | { type: "pick-discard"; cardId: CardId }
  | { type: "skip-pending" }
  | {
      type: "play-seventh";
      action:
        | { type: "play-card"; cardId: CardId; payment: Payment }
        | BuildWonderAction
        | { type: "discard"; cardId: CardId };
    };

export type Selection = SevenWondersAction;

export type PendingKind = "babylon-seventh" | "halikarnassos";

export interface PendingAction {
  kind: PendingKind;
  playerIndex: number;
}

export type GamePhase = "selecting" | "revealing" | "pending" | "game-over";

// ── Action log ──────────────────────────────────────────────────────────────

export interface RevealedPlay {
  playerIndex: number;
  action: "play-card" | "build-wonder" | "discard";
  /** Hidden for discards/wonder builds only in the UI — always present in state. */
  cardId: CardId;
  payment?: Payment;
}

export interface MilitaryOutcome {
  playerIndex: number;
  /** Tokens gained this age against [left, right]: +1/+3/+5, -1, or 0 for ties. */
  tokens: number[];
}

export type LogEntry =
  | { type: "reveal"; age: Age; turn: number; plays: RevealedPlay[] }
  | {
      type: "pending";
      age: Age;
      turn: number;
      playerIndex: number;
      kind: PendingKind;
      play: RevealedPlay | null;
    }
  | { type: "military"; age: Age; outcomes: MilitaryOutcome[] }
  | { type: "age-start"; age: Age }
  | {
      type: "edifice";
      age: Age;
      card: string;
      outcome: "built" | "failed";
      /** Player indices who participated. */
      participants: number[];
    }
  | { type: "game-end"; totals: number[]; winner: number };

// ── Game state ──────────────────────────────────────────────────────────────

export interface SevenWondersConfig {
  playerCount: number;
  seed: number;
  sideMode: "A" | "B" | "random";
  /** Enable the Edifice expansion (communal projects). */
  edifice?: boolean;
}

export type EdificeSlotStatus = "project" | "built" | "failed";

export interface EdificeSlot {
  age: Age;
  /** Edifice card name (key into EDIFICES). */
  card: string;
  pawnsTotal: number;
  pawnsLeft: number;
  status: EdificeSlotStatus;
  /** Player indices holding a participation pawn for this project. */
  participants: number[];
}

export interface GameState {
  seed: number;
  playerCount: number;
  age: Age;
  /** 1..6 within an age. */
  turn: number;
  phase: GamePhase;
  players: PlayerState[];
  /** hands[i] = player i's current hand. */
  hands: CardId[][];
  selections: (Selection | null)[];
  discard: CardId[];
  /** Resolved in order; babylon-seventh before halikarnassos. */
  pendingQueue: PendingAction[];
  /** Pre-shuffled at setup so the whole game is a pure function of (seed, actions). */
  ageDecks: { 2: CardId[]; 3: CardId[] };
  /** Edifice projects, one per Age (index 0 = Age I). Absent in a base game. */
  edifices?: EdificeSlot[];
  lastRevealed: RevealedPlay[];
  actionLog: LogEntry[];
}

/** Zeroed Edifice-related PlayerState fields (base games leave these untouched). */
export function emptyEdificeFields(): Pick<
  PlayerState,
  "victoryTokens" | "debtTokens" | "bonusShields" | "bonusProduction"
> {
  return { victoryTokens: [], debtTokens: [], bonusShields: 0, bonusProduction: [] };
}

export const STARTING_COINS = 3;
export const TURNS_PER_AGE = 6;
export const DISCARD_COIN_VALUE = 3;
export const MILITARY_VICTORY_POINTS: Record<Age, number> = { 1: 1, 2: 3, 3: 5 };
export const MILITARY_DEFEAT_POINTS = -1;

// ── Small helpers ───────────────────────────────────────────────────────────

export function leftOf(playerIndex: number, playerCount: number): number {
  return (playerIndex + 1) % playerCount;
}

export function rightOf(playerIndex: number, playerCount: number): number {
  return (playerIndex - 1 + playerCount) % playerCount;
}

/** Hands pass clockwise (to the left neighbor) in ages 1 & 3, counter-clockwise in age 2. */
export function passDirection(age: Age): "left" | "right" {
  return age === 2 ? "right" : "left";
}
