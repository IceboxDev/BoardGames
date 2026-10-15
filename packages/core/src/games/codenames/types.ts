import { z } from "zod";
import type { RngCarrier } from "../../lib/rng";
import type { CodenamesAiModel } from "./ai/models";
import type { KeyEntry } from "./board";
import { type Clue, ClueSchema } from "./clue-rules";
import type { AiCost, ClueNote, GuessNote } from "./notes";
import type { Role, Team } from "./seating";
import type { Language } from "./words";

export type { KeyEntry } from "./board";
export type { Clue, ClueCount } from "./clue-rules";
export type { ClueNote, GuessNote, GuessPick } from "./notes";
export type { Role, Team } from "./seating";

export const MAX_CHAT_LENGTH = 300;

// ---------------------------------------------------------------------------
// Actions (the `action` inside a PLAYER_ACTION envelope)
// ---------------------------------------------------------------------------

export const GiveClueActionSchema = z.object({
  kind: z.literal("give-clue"),
  clue: ClueSchema,
  /** The cards the spymaster means (optional; secret until the game is over). */
  targets: z.array(z.number().int().min(0).max(24)).max(9).optional(),
});
/** A clue that only shares spelling with a table word: ask the other spymaster first. */
export const AskClueActionSchema = z.object({
  kind: z.literal("ask-clue"),
  clue: ClueSchema,
  targets: z.array(z.number().int().min(0).max(24)).max(9).optional(),
});
/** Pin one of the team's clues to a face-down card (again: unpin it). */
export const NoteActionSchema = z.object({
  kind: z.literal("note"),
  card: z.number().int().min(0).max(24),
  /** Index into the game's turns: the turn whose clue is pinned. */
  turn: z.number().int().min(0).max(999),
});
/** Let the AI play an absent person's seat until they're back (`presence.ts`). */
export const HandOverActionSchema = z.object({
  kind: z.literal("hand-over"),
  seat: z.number().int().min(0).max(7),
});
export const ChatActionSchema = z.object({
  kind: z.literal("chat"),
  text: z.string().trim().min(1).max(MAX_CHAT_LENGTH),
});

export type CodenamesAction =
  | { kind: "give-clue"; clue: Clue; targets?: number[] }
  /** Ask the opposing spymaster whether a spelling-only clash may stand. */
  | { kind: "ask-clue"; clue: Clue; targets?: number[] }
  /** The opposing spymaster's answer to an `ask-clue`. */
  | { kind: "rule-clue"; allow: boolean }
  /** The asking spymaster takes the question back. */
  | { kind: "withdraw-clue" }
  | { kind: "guess"; card: number }
  | { kind: "end-turn" }
  /**
   * Put the seat's one pointer on a card (a suggestion, binding nothing);
   * on the card it already points at, take it off.
   */
  | { kind: "mark"; card: number }
  /** Toggle a sticky note: the team's clue from turn `turn`, pinned to a card. */
  | { kind: "note"; card: number; turn: number }
  /** Let the AI play an absent person's seat until they come back. */
  | { kind: "hand-over"; seat: number }
  | { kind: "chat"; text: string };

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export interface GuessRecord {
  card: number;
  /** The seat that touched the card. */
  by: number;
  result: KeyEntry;
}

/** How a clue question ended. */
export type AppealRuling =
  | "allowed" // the other spymaster allowed it
  | "refused"
  | "unanswered" // no answer in time: silence is consent
  | "withdrawn"; // the asker took it back

/** One question a spymaster put to the other — as secret as the key until the game is over. */
export interface AppealRecord {
  word: string;
  /** The face-down word it shares spelling with. */
  clash: string;
  by: number;
  judge: number;
  ruling: AppealRuling;
  /** An AI judge's reason, in a sentence. */
  reason: string | null;
  /** What an AI judge's call cost. */
  cost?: AiCost;
}

/** Why a turn ended. */
export type TurnEnd =
  | "miss" // a bystander or an opposing agent
  | "limit" // used every guess the clue allowed
  | "stopped" // the team chose to stop
  | "assassin"
  | "won" // the game ended on this turn by agents
  | "clue-timeout"
  | "guess-timeout";

export interface TurnRecord {
  team: Team;
  clue: Clue | null;
  guesses: GuessRecord[];
  end: TurnEnd | null;
  /** What the clue meant — as secret as the key (see `notes.ts`). */
  note?: ClueNote;
  /** One per AI guessing call this turn. */
  guessNotes?: GuessNote[];
  /** Clues asked about this turn (spymasters only until the game is over). */
  appeals?: AppealRecord[];
}

/** The clue question in progress. */
export interface ClueAppeal {
  by: number;
  judge: number;
  clue: Clue;
  /** What the clue means: a person's tapped targets, or the AI's whole note. */
  note: ClueNote | null;
  clash: string;
  /** When silence counts as consent. */
  deadlineTs: number;
  /** Clue-timer time left when the question was asked, given back on a refusal. */
  clueMsLeft: number | null;
}

/** A team's sticky note: the clue of turn `turn`, pinned to `card` by `seat`. */
export interface StickyNote {
  card: number;
  turn: number;
  seat: number;
}

export interface ChatMessage {
  seat: number;
  team: Team;
  text: string;
  /** Index into `turns` when it was sent. */
  turn: number;
}

export type WinReason = "agents" | "assassin";

export interface CodenamesResult {
  winner: Team;
  reason: WinReason;
  /** Agents each team had revealed (by anyone) at the end. */
  agentsFound: [number, number];
}

export type GamePhase = "clue" | "guessing" | "over";

/** Every pacing delay, overridable in START so tests run at millisecond speed. */
export interface CodenamesBeats {
  /** Before an AI starts thinking — lets the table see whose turn it is. */
  aiStart: number;
  /** Between an AI operative's touches. */
  aiGuess: number;
  /** How long a clue question waits for a person's ruling before it stands. */
  appealWait: number;
}

export const DEFAULT_BEATS: CodenamesBeats = { aiStart: 700, aiGuess: 1400, appealWait: 45_000 };

export interface CodenamesState extends RngCarrier {
  seed: number;
  language: Language;
  seatCount: number;
  /** Per seat: the AI tier, or null for a person. */
  ai: (CodenamesAiModel | null)[];
  words: string[];
  key: KeyEntry[];
  revealed: boolean[];
  startingTeam: Team;
  currentTeam: Team;
  phase: GamePhase;
  /** The live turn is the last entry. */
  turns: TurnRecord[];
  /** Live pointers for the current turn, at most one per seat. */
  marks: { card: number; seat: number }[];
  /** Sticky notes on face-down cards; they outlive the turn. */
  notes: StickyNote[];
  /** A clue question waiting for the other spymaster. */
  appeal: ClueAppeal | null;
  /** People whose connection dropped, and since when (`presence.ts`). */
  away: { seat: number; since: number }[];
  /** Seats an AI stand-in plays for an absent person (`ai[seat]` holds its tier). */
  standIns: number[];
  /** Stand-in seats whose person is back, handed over once the AI's move is done. */
  reclaims: number[];
  chat: ChatMessage[];
  clueTimerSec: number;
  guessTimerSec: number;
  /** Absolute deadline of the running timer, for the client's countdown. */
  deadlineTs: number | null;
  /** The seat an AI call is running for, so the table can show "thinking". */
  aiThinking: number | null;
  /** AI operative picks still to be touched this turn, in order. */
  aiQueue: number[];
  result: CodenamesResult | null;
  beats: CodenamesBeats;
}

export type CodenamesMachineEvent =
  | {
      type: "START";
      seed: number;
      /** One entry per seat; null = a person. */
      ai: (string | null)[];
      language: Language;
      clueTimerSec: number;
      guessTimerSec: number;
      beats?: Partial<CodenamesBeats>;
    }
  | { type: "PLAYER_ACTION"; player: number; action: CodenamesAction }
  /** A room seat's connection dropped or returned (rooms only). */
  | { type: "SEAT_CONNECTION"; seat: number; connected: boolean }
  | { type: "RESET" };

// ---------------------------------------------------------------------------
// Player view
// ---------------------------------------------------------------------------

export type ViewPhase = "idle" | GamePhase;

export interface CardView {
  word: string;
  /** What the card turned out to be, once someone touched it. */
  revealed: KeyEntry | null;
  /** The key under it — spymasters, and everyone once the game is over. */
  key: KeyEntry | null;
  /** Seats of the viewer's team pointing at it (this turn); operatives only. */
  marks: number[];
  /** The viewer's team's sticky notes on it; operatives only. */
  notes: { turn: number; seat: number }[];
}

/** A clue question as one seat sees it: the word only for the two spymasters. */
export interface AppealView {
  by: number;
  judge: number;
  word: string | null;
  clash: string | null;
  /** The asker's own number. */
  count: Clue["count"] | null;
  deadlineTs: number;
}

export interface SeatView {
  seat: number;
  team: Team;
  role: Role;
  ai: boolean;
  /** The AI tier playing it, or null for a person. */
  tier: CodenamesAiModel | null;
  /** The person's connection dropped (at `awaySince`). */
  awaySince: number | null;
  /** From when anyone else may hand the seat to the AI. */
  handoverAt: number | null;
  /** An AI is playing it for its absent person (`tier` is the stand-in's). */
  standIn: boolean;
  /** The person is back; the stand-in hands over once its move is done. */
  returning: boolean;
}

export interface CodenamesPlayerView {
  phase: ViewPhase;
  /** -1 for a spectator. */
  seat: number;
  team: Team | null;
  role: Role | null;
  language: Language;
  seats: SeatView[];
  cards: CardView[];
  startingTeam: Team;
  currentTeam: Team;
  /** The clue in play this turn, if given. */
  clue: Clue | null;
  guessesMade: number;
  /** Guesses left this turn; null = unlimited (0 / ∞ clues). */
  guessesLeft: number | null;
  /** Agents each team still has face down. */
  agentsLeft: [number, number];
  turns: TurnRecord[];
  /** The viewer's own team's chat; spectators see none. */
  chat: ChatMessage[];
  canChat: boolean;
  /** Whether this seat gives the clue now. */
  mustGiveClue: boolean;
  /** The clue question in progress, if any. */
  appeal: AppealView | null;
  /** Whether this seat must allow or refuse a clue now. */
  mustRuleClue: boolean;
  /** Whether this seat may take its question back. */
  canWithdrawClue: boolean;
  /** Whether this seat may pin sticky notes (a person, an operative, the game live). */
  canNote: boolean;
  /** Whether this seat (a person at a live table) may hand an absent seat to the AI. */
  canHandOver: boolean;
  /** Whether this seat may touch cards now. */
  canGuess: boolean;
  canEndTurn: boolean;
  deadlineTs: number | null;
  aiThinking: number | null;
  /** Some AI move this game was played by the stand-in (the model was unavailable). */
  aiStandIn: boolean;
  result: CodenamesResult | null;
}

/** Re-exported for the machine's START typing. */
export type { Language };
