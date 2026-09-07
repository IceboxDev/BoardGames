// ---------------------------------------------------------------------------
// Sensō: Battle for Japan — shared types and display constants.
//
// Regions and squares are 0-BASED everywhere in the model: region 0 is the
// rulebook's "Region 01", square 0 is the TOP square of a region (its highest
// VP value). `REGION_LABELS` / `regionLabel()` are the only place the 1-based
// rulebook numbering appears.
// ---------------------------------------------------------------------------

export type Clan = "takeda" | "uesugi" | "oda" | "mori";
export const CLANS: readonly Clan[] = ["takeda", "uesugi", "oda", "mori"];

/** 2–10 literal, J=11, Q=12, K=13, A=14 (aces high). */
export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;
export const RANKS: readonly Rank[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

export type NinjaId = "ninja-wood" | "ninja-jade";
export type ClanCardId = `${Clan}-${Rank}`;
/** Flat string ids keep legal actions JSON-trivial for the structural validator. */
export type CardId = ClanCardId | NinjaId;

export type Phase = "trick" | "trick-settle" | "rewards" | "bonus" | "game-over";
export type PlayerType = "human" | "ai";

export type RewardTier = 1 | 3 | 5 | 7;
export type RewardKind = "balance" | "determination" | "aggression";

export interface Player {
  index: number;
  type: PlayerType;
  aiStrategy?: AIStrategyId;
  /** `null` = the Emperor (5-player games only): no cubes, no suit. */
  clan: Clan | null;
  hand: CardId[];
  /** Conflicts won this round; reset at every deal. */
  tricksWon: number;
}

export interface TrickPlay {
  seat: number;
  card: CardId;
}

export interface CompletedTrick {
  round: number;
  trick: number;
  plays: TrickPlay[];
  winner: number;
}

/** One player's turn in the Conflict Rewards phase. Focus (tier 7) = two picks. */
export interface RewardSlot {
  player: number;
  tier: RewardTier;
  picksLeft: 1 | 2;
  used: RewardKind[];
}

/** A region locked for every seat except `by` until the rewards phase ends. */
export interface AffectedRegion {
  region: number;
  by: number;
}

/** `board[region][square]`; invariant: cubes are contiguous from square 0 (the top). */
export type Board = (Clan | null)[][];

export interface GameState {
  phase: Phase;
  /** The only source of randomness. NEVER exposed in the player view. */
  seed: number;
  players: Player[];
  emperorSeat: number | null;
  /** Clans dealt to a seat; the others keep their setup cubes as neutrals. */
  seatedClans: Clan[];
  board: Board;
  /** Cubes not on the map, per clan. 0 (and never used) for unseated clans. */
  supply: Record<Clan, number>;
  round: number;
  firstPlayer: number;
  /** The CURRENT half's face-up Faction Advantage row (rounds 1–4 or 5–8). */
  advantageRow: Clan[];
  trumpSuit: Clan;
  /** 1-based within the round. */
  trickNumber: number;
  leader: number;
  /** Seat to act while `phase === "trick"`. */
  turn: number;
  table: TrickPlay[];
  /** `null` while the table is empty or when a Ninja was led. */
  leadSuit: Clan | null;
  /** Every card played so far this round (public information for the AI). */
  played: CardId[];
  /** Every conflict settled so far this round (public — the AI reads voids off it). */
  tricks: CompletedTrick[];
  /** Non-null only during `trick-settle`. */
  completedTrick: CompletedTrick | null;
  /** The previous completed trick, kept for the UI across the next trick. */
  lastTrick: CompletedTrick | null;
  rewardQueue: RewardSlot[];
  affected: AffectedRegion[];
  bonusQueue: number[];
  logEnabled: boolean;
  log: LogEntry[];
  result: SensoResult | null;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/**
 * Reward actions carry `as` ONLY for the Emperor seat — the clan whose cubes
 * count as "own" for that reward. Clan seats omit the key entirely (the
 * structural validator treats an `undefined` value as absent, but keeping the
 * key off the wire is cleaner).
 */
export type RewardAction =
  | { type: "balance-swap"; region: number; square: number; as?: Clan }
  | { type: "balance-move"; region: number; square: number; to: number; as?: Clan }
  | { type: "balance-replace"; region: number; square: number; to: number; as?: Clan }
  | { type: "determination"; region: number; as?: Clan }
  | { type: "aggression"; region: number; square: number; as?: Clan };

export type Action =
  | { type: "play"; card: CardId }
  | RewardAction
  | { type: "bonus-place"; region: number }
  | { type: "pass" };

export function isRewardAction(action: Action): action is RewardAction {
  return (
    action.type === "balance-swap" ||
    action.type === "balance-move" ||
    action.type === "balance-replace" ||
    action.type === "determination" ||
    action.type === "aggression"
  );
}

export function rewardKindOf(action: RewardAction): RewardKind {
  switch (action.type) {
    case "balance-swap":
    case "balance-move":
    case "balance-replace":
      return "balance";
    case "determination":
      return "determination";
    case "aggression":
      return "aggression";
  }
}

// ---------------------------------------------------------------------------
// Log (fully public — surfaced verbatim through the player view)
// ---------------------------------------------------------------------------

export interface CubeEffect {
  kind: "placed" | "removed" | "moved" | "swapped";
  clan: Clan;
  region: number;
  square: number;
  toRegion?: number;
  toSquare?: number;
}

export type LogEntry =
  | { kind: "round-start"; round: number; trump: Clan; firstPlayer: number; cardsEach: number }
  | { kind: "trick-won"; round: number; trick: number; winner: number; plays: TrickPlay[] }
  | {
      kind: "reward";
      round: number;
      player: number;
      tier: RewardTier;
      action: RewardAction;
      effects: CubeEffect[];
    }
  | { kind: "reward-pass"; round: number; player: number; tier: RewardTier }
  | { kind: "bonus"; player: number; region: number; square: number; clan: Clan }
  | { kind: "bonus-pass"; player: number }
  | { kind: "advantage-row"; half: 1 | 2; row: Clan[] }
  | { kind: "game-over"; scores: number[]; winner: number | null };

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

export interface SeatBreakdown {
  seat: number;
  clan: Clan | null;
  cubeVp: number;
  controlVp: number;
  emperorVp: number;
  regionsControlled: number;
  cubes: number;
}

export interface SensoResult {
  scores: number[];
  /** `null` only on an unbreakable draw. */
  winner: number | null;
  /** ≥ 1 seat; > 1 only on an unbreakable draw. */
  winners: number[];
  /** `placements[seat]` = 1-based rank; ties share a rank. */
  placements: number[];
  breakdown: SeatBreakdown[];
  tiebreak: "score" | "cubes" | "emperor" | "draw";
  finalBoard: Board;
}

// ---------------------------------------------------------------------------
// Player view (hidden information stripped)
// ---------------------------------------------------------------------------

export interface SensoPlayerView {
  phase: Phase;
  round: number;
  trumpSuit: Clan;
  advantageRow: Clan[];
  firstPlayer: number;
  leader: number;
  turn: number;
  trickNumber: number;
  /** The viewer's seat, or -1 for a spectator. */
  me: number;
  myClan: Clan | null;
  hand: CardId[];
  players: {
    index: number;
    type: PlayerType;
    aiStrategy?: AIStrategyId;
    clan: Clan | null;
    handCount: number;
    tricksWon: number;
  }[];
  emperorSeat: number | null;
  seatedClans: Clan[];
  table: TrickPlay[];
  leadSuit: Clan | null;
  played: CardId[];
  tricks: CompletedTrick[];
  completedTrick: CompletedTrick | null;
  lastTrick: CompletedTrick | null;
  board: Board;
  supply: Record<Clan, number>;
  rewardQueue: RewardSlot[];
  affected: AffectedRegion[];
  bonusQueue: number[];
  /** Live projection of the end-game scoring on the current board. */
  scores: number[];
  log: LogEntry[];
  result: SensoResult | null;
}

// ---------------------------------------------------------------------------
// AI
// ---------------------------------------------------------------------------

export type AIStrategyId = "random" | "heuristic-v1" | "aggressive" | "shogun" | "tenka";

/** Wall-clock budget for a search strategy. `timeMs: 0` = iteration-capped (deterministic). */
export interface AiBudget {
  timeMs: number;
}

export interface AIStrategy {
  id: AIStrategyId;
  pickAction(state: GameState, legalActions: Action[], player: number, budget?: AiBudget): Action;
}

export const AI_STRATEGY_LABELS: Record<AIStrategyId, string> = {
  random: "Random",
  "heuristic-v1": "Daimyō",
  aggressive: "Warlord",
  shogun: "Shōgun",
  tenka: "Tenka",
};

export const AI_STRATEGY_DESCRIPTIONS: Record<AIStrategyId, string> = {
  random: "Plays random legal moves. Good for testing.",
  "heuristic-v1":
    "Chases the next reward threshold with safe winners and spends rewards where they score most.",
  aggressive: "Fights for every trick and prefers striking the leader's cubes off the map.",
  shogun:
    "Samples what the other hands could be, plays the round out before every card, and looks one reward ahead of the table.",
  tenka:
    "Weighs every possible deal by how the other hands have actually been played, then plays each card out with a policy learned from search.",
};

// ---------------------------------------------------------------------------
// Display constants
// ---------------------------------------------------------------------------

export const CLAN_LABELS: Record<Clan, string> = {
  takeda: "Takeda",
  uesugi: "Uesugi",
  oda: "Oda",
  mori: "Mōri",
};

export const CLAN_KANJI: Record<Clan, string> = {
  takeda: "武田",
  uesugi: "上杉",
  oda: "織田",
  mori: "毛利",
};

export const CLAN_SHORT: Record<Clan, string> = {
  takeda: "武",
  uesugi: "上",
  oda: "織",
  mori: "毛",
};

export const NINJA_LABELS: Record<NinjaId, string> = {
  "ninja-wood": "Wood Ninja",
  "ninja-jade": "Jade Ninja",
};

export const RANK_LABELS: Record<Rank, string> = {
  2: "2",
  3: "3",
  4: "4",
  5: "5",
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

export const REWARD_THRESHOLDS: Record<RewardKind | "focus", RewardTier> = {
  balance: 1,
  determination: 3,
  aggression: 5,
  focus: 7,
};

export const REWARD_LABELS: Record<RewardKind, string> = {
  balance: "Balance",
  determination: "Determination",
  aggression: "Aggression",
};

export const ROUNDS = 8;
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 5;

/** Rulebook numbering for a 0-based region index. */
export function regionLabel(region: number): string {
  return String(region + 1);
}

/** Display label for a seat's faction. */
export function factionLabel(clan: Clan | null): string {
  return clan === null ? "Emperor" : CLAN_LABELS[clan];
}
