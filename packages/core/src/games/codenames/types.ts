import { z } from "zod";
import type { RngCarrier } from "../../lib/rng";
import type { CodenamesAiModel } from "./ai/models";
import type { KeyEntry } from "./board";
import { type Clue, ClueSchema } from "./clue-rules";
import type { ClueNote, GuessNote } from "./notes";
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
export const ChatActionSchema = z.object({
  kind: z.literal("chat"),
  text: z.string().trim().min(1).max(MAX_CHAT_LENGTH),
});

export type CodenamesAction =
  | { kind: "give-clue"; clue: Clue; targets?: number[] }
  | { kind: "guess"; card: number }
  | { kind: "end-turn" }
  /** Toggle a teammate-visible pointer on a card — a suggestion, binding nothing. */
  | { kind: "mark"; card: number }
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
}

export const DEFAULT_BEATS: CodenamesBeats = { aiStart: 700, aiGuess: 1400 };

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
  /** Live pointers for the current turn: card → seats pointing at it. */
  marks: { card: number; seat: number }[];
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
  /** Seats of the viewer's team pointing at it (this turn). */
  marks: number[];
}

export interface SeatView {
  seat: number;
  team: Team;
  role: Role;
  ai: boolean;
  /** The AI tier playing it, or null for a person. */
  tier: CodenamesAiModel | null;
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
