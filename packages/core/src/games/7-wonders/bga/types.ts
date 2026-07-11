/**
 * BGA-native spectator view. A mirror of a live Board Game Arena table, built
 * entirely from BGA's own `gamedatas` dictionaries + notification stream — it
 * deliberately does NOT reuse our engine's card/wonder definitions, so it
 * renders any wonder (incl. Ur/Carthage) and any expansion BGA sends without
 * our core needing to know about them. BGA is the source of truth for a mirror.
 */

export type BgaScienceCounts = {
  gear: number;
  compass: number;
  tablet: number;
  wild: number;
};

export interface BgaTableauCard {
  name: string;
  /** BGA category: raw | man | civ | com | mil | sci | gui. */
  category: string;
}

export interface BgaWonderStage {
  /** Formatted cost, e.g. "🪨🪨" or "2🪙". */
  cost: string;
  /** Formatted effect summary, e.g. "3 VP" / "2🛡" / "science". */
  effect: string;
  built: boolean;
}

export interface BgaPlayerView {
  id: string;
  name: string;
  /** Seat index in play order (0-based). */
  seat: number;
  wonderName: string;
  side: string;
  coins: number;
  shields: number;
  /** Conflict tokens gained so far (+victory / -defeat), in resolution order. */
  militaryTokens: number[];
  wonderInitial: string;
  stages: BgaWonderStage[];
  stagesBuilt: number;
  tableau: BgaTableauCard[];
  science: BgaScienceCounts;
  /** Ages (1–3) this player holds an Edifice participation pawn for. */
  edificePawns: number[];
  /** Deduced current hand (card counting). Null until it can be known. */
  hand: BgaHand | null;
}

export interface BgaHand {
  /**
   * Candidate/known card names. When `cards.length === size` the hand is known
   * exactly; when larger, some candidates were buried under Wonders (unknown
   * which); when smaller, the remainder is unidentified.
   */
  cards: string[];
  /** Actual number of cards in the hand right now. */
  size: number;
  /** Filled by deck elimination rather than direct observation. */
  deduced: boolean;
  /** Residual uncertainty (e.g. Age III guilds under elimination). */
  uncertain: boolean;
}

export type BgaEdificeStatus = "project" | "built" | "failed";

export interface BgaEdificeView {
  /** Board slot 1–3 (== the game Age it belongs to). */
  slot: number;
  name: string;
  cost: string;
  reward: string;
  penalty: string;
  tokensLeft: number;
  status: BgaEdificeStatus;
  /** Names of players who participated. */
  participants: string[];
}

export interface BgaSpectatorView {
  age: number;
  turn: number;
  discardCount: number;
  /** Players in seat order. */
  players: BgaPlayerView[];
  /** Edifice slots (present only in an Edifice game). */
  edifices: BgaEdificeView[];
  /** True once the game has ended (results notif seen). */
  finished: boolean;
}
