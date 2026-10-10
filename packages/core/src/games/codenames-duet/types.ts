import { z } from "zod";
import type { RngCarrier } from "../../lib/rng";
import type { CodenamesAiModel } from "../codenames/ai/models";
import type { DuetKeyEntry, DuetKeyPair } from "../codenames/board";
import { type Clue, ClueSchema } from "../codenames/clue-rules";
import type { ClueNote, GuessNote } from "../codenames/notes";
import type { Language } from "../codenames/words";

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

export type DuetAction =
  | { kind: "give-clue"; clue: Clue; targets?: number[] }
  | { kind: "guess"; card: number }
  | { kind: "end-turn" }
  | { kind: "chat"; text: string };

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
  turns: DuetTurn[];
  chat: DuetChatMessage[];
  clueTimerSec: number;
  guessTimerSec: number;
  deadlineTs: number | null;
  aiThinking: Side | null;
  aiQueue: number[];
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
      clueTimerSec: number;
      guessTimerSec: number;
      beats?: Partial<DuetBeats>;
    }
  | { type: "PLAYER_ACTION"; player: number; action: DuetAction }
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

export interface DuetPlayerView {
  phase: DuetViewPhase;
  seat: number;
  language: Language;
  ai: [boolean, boolean];
  /** Each seat's AI tier, or null for a person. */
  tiers: [CodenamesAiModel | null, CodenamesAiModel | null];
  cards: DuetCardView[];
  giver: Side;
  clue: Clue | null;
  guessesMade: number;
  tokens: number;
  tokensTotal: number;
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
  result: DuetResult | null;
}
