import { z } from "zod";
import type { RngCarrier } from "../../lib/rng";
import type { CodenamesAiModel } from "../codenames/ai/models";
import type { DuetKeyEntry, DuetKeyPair } from "../codenames/board";
import { type Clue, ClueSchema } from "../codenames/clue-rules";
import type { ClueNote, GuessNote } from "../codenames/notes";
import type { SeatPresenceView } from "../codenames/seat-presence";
import type { Language } from "../codenames/words";
import type { CampaignMission } from "./campaign/map";

export type { DuetKeyEntry, DuetKeyPair } from "../codenames/board";
export type { Clue } from "../codenames/clue-rules";

/** A seat, and the key side it holds. */
export type Side = 0 | 1;

export const MAX_CHAT_LENGTH = 300;

export const GiveClueActionSchema = z.object({
  kind: z.literal("give-clue"),
  clue: ClueSchema,
  /** The cards the clue-giver means (optional; secret until the game is over). */
  targets: z.array(z.number().int().min(0).max(24)).max(9).optional(),
});
export const ChatActionSchema = z.object({
  kind: z.literal("chat"),
  text: z.string().trim().min(1).max(MAX_CHAT_LENGTH),
});

export const HandOverActionSchema = z.object({
  kind: z.literal("hand-over"),
  seat: z.number().int().min(0).max(1),
});

export type DuetAction =
  | { kind: "give-clue"; clue: Clue; targets?: number[] }
  | { kind: "guess"; card: number }
  | { kind: "end-turn" }
  | { kind: "chat"; text: string }
  /** Hand an absent partner's seat to an AI stand-in (`../codenames/seat-presence.ts`). */
  | { kind: "hand-over"; seat: number };

export interface DuetGuess {
  card: number;
  by: Side;
  /** The card on the side it was judged against (the clue-giver's). */
  result: DuetKeyEntry;
}

export type DuetTurnEnd =
  | "bystander"
  | "stopped"
  | "assassin"
  | "won"
  | "clue-timeout"
  | "guess-timeout";

export interface DuetTurn {
  /** null = the sudden-death round (no clues). */
  giver: Side | null;
  clue: Clue | null;
  guesses: DuetGuess[];
  end: DuetTurnEnd | null;
  /** What the clue meant — as secret as the giver's key side. */
  note?: ClueNote;
  /** One per AI guessing call this turn. */
  guessNotes?: GuessNote[];
  /** A bystander with no free mistakes left cost two timer tokens. */
  tokensSpent?: 2;
}

export interface DuetChatMessage {
  seat: Side;
  text: string;
  turn: number;
}

export type DuetPhase = "clue" | "guessing" | "sudden-death" | "over";

export interface DuetResult {
  won: boolean;
  reason: "all-found" | "assassin" | "sudden-death";
  /** Distinct agents found out of 15. */
  agentsFound: number;
  tokensLeft: number;
}

export interface DuetBeats {
  aiStart: number;
  aiGuess: number;
}

export const DEFAULT_DUET_BEATS: DuetBeats = { aiStart: 700, aiGuess: 1400 };

export interface DuetState extends RngCarrier {
  seed: number;
  language: Language;
  ai: [CodenamesAiModel | null, CodenamesAiModel | null];
  words: string[];
  key: DuetKeyPair[];
  /** Covered by an agent — found, for both sides. */
  found: boolean[];
  /** Per side: cards a guess revealed as that side's bystander. */
  bystanders: [boolean[], boolean[]];
  phase: DuetPhase;
  /** Who gives the clue now (in sudden death: whose guess it is). */
  giver: Side;
  tokens: number;
  tokensTotal: number;
  /** Free mistakes left: tokens still bystander side up. Equals `tokens` in the standard game. */
  mistakesLeft: number;
  /** The mission's free mistakes; null = every token (the standard game). */
  mistakesTotal: number | null;
  /** The campaign mission this game is, if any. */
  campaign: CampaignMission | null;
  turns: DuetTurn[];
  chat: DuetChatMessage[];
  clueTimerSec: number;
  guessTimerSec: number;
  deadlineTs: number | null;
  aiThinking: Side | null;
  aiQueue: number[];
  /** Presence (`presence.ts`): who dropped out, and the seats an AI stands in for. */
  away: { seat: number; since: number }[];
  standIns: number[];
  reclaims: number[];
  result: DuetResult | null;
  beats: DuetBeats;
}

export type DuetMachineEvent =
  | {
      type: "START";
      seed: number;
      ai: (string | null)[];
      language: Language;
      timerTokens: number;
      mistakes?: number;
      campaign?: CampaignMission;
      clueTimerSec: number;
      guessTimerSec: number;
      recentBoards?: string[][];
      beats?: Partial<DuetBeats>;
    }
  | { type: "PLAYER_ACTION"; player: number; action: DuetAction }
  | { type: "SEAT_CONNECTION"; seat: number; connected: boolean }
  | { type: "RESET" };

export type DuetViewPhase = "idle" | DuetPhase;

export interface DuetCardView {
  word: string;
  found: boolean;
  /** Which sides have revealed this card as their bystander. */
  bystanderFor: Side[];
  /** The viewer's own side of the key; both sides once the game is over. */
  mine: DuetKeyEntry | null;
  theirs: DuetKeyEntry | null;
}

/** A seat as the table sees it: who plays it and whether they are here. */
export interface DuetSeatView extends SeatPresenceView {
  seat: Side;
  ai: boolean;
  /** The AI tier playing it (a stand-in's too), or null for a person. */
  tier: CodenamesAiModel | null;
}

export interface DuetPlayerView {
  phase: DuetViewPhase;
  seat: number;
  language: Language;
  seats: [DuetSeatView, DuetSeatView];
  cards: DuetCardView[];
  giver: Side;
  clue: Clue | null;
  guessesMade: number;
  tokens: number;
  tokensTotal: number;
  /** Free mistakes left; null when every bystander is free (the standard game). */
  mistakesLeft: number | null;
  mistakesTotal: number | null;
  campaign: CampaignMission | null;
  agentsFound: number;
  /** Agents still hidden on each side's key. */
  agentsLeft: [number, number];
  turns: DuetTurn[];
  chat: DuetChatMessage[];
  canChat: boolean;
  mustGiveClue: boolean;
  canGuess: boolean;
  canEndTurn: boolean;
  /** Cards this seat may touch now. */
  guessable: number[];
  deadlineTs: number | null;
  aiThinking: Side | null;
  /** Some AI move this game was played by the stand-in (the model was unavailable). */
  aiStandIn: boolean;
  /** Whether this seat (a person at a live table) may hand an absent partner's seat to the AI. */
  canHandOver: boolean;
  result: DuetResult | null;
}
