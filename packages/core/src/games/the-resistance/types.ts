import type { RngCarrier } from "../../lib/rng";
import type { MissionCard, ResistanceRecord, Role, Variants, WinReason } from "./record";

export const AI_STRATEGY_LABELS = {
  random: "Rookie",
  analyst: "Analyst",
} as const;
export type AIStrategyId = keyof typeof AI_STRATEGY_LABELS;

export const AI_STRATEGY_DESCRIPTIONS: Record<AIStrategyId, string> = {
  random: "Proposes, votes and sabotages at random",
  analyst: "Plays what the Solver recommends: best odds as Resistance, one-spy teams as a Spy",
};

export type Phase = "proposing" | "voting" | "mission" | "game-over";

/**
 * The whole game is its record plus what's still secret mid-phase. Roles and
 * every played card live in `record` (the replay log is the record itself);
 * the player view strips them.
 */
export interface GameState extends RngCarrier {
  record: ResistanceRecord & { roles: Role[] };
  phase: Phase;
  /** `pendingVotes[seat]` during `voting`. */
  pendingVotes: (boolean | null)[];
  /** `pendingCards[seat]` during `mission` (team members only). */
  pendingCards: (MissionCard | null)[];
  /** `null` = a person. */
  strategies: (AIStrategyId | null)[];
}

export type ResistanceAction =
  | { type: "propose"; mission: number; team: number[] }
  | { type: "vote"; approve: boolean }
  | { type: "play"; card: MissionCard };

export interface ResistanceSeatView {
  seat: number;
  isAi: boolean;
  /** Has voted (voting) / played (mission) — never WHAT. */
  submitted: boolean;
}

export interface ResistancePlayerView {
  phase: Phase;
  playerCount: number;
  variants: Variants;
  /** Public record: votes once revealed, fail counts only, no roles until the end. */
  record: ResistanceRecord;
  /** The viewer's seat, or -1 for a spectator. */
  seat: number;
  role: Role | null;
  /** Spies the viewer knows (itself included when a spy). Empty for the Resistance. */
  knownSpies: number[];
  leader: number;
  rejections: number;
  missionResults: (boolean | null)[];
  seats: ResistanceSeatView[];
  /** The viewer's own pending vote/card, so a reconnect shows it. */
  myVote: boolean | null;
  myCard: MissionCard | null;
  /** The table has enabled the live Solver panel. */
  liveSolver: boolean;
}

export interface ResistanceResult {
  winner: Role;
  winReason: WinReason;
  roles: Role[];
}
