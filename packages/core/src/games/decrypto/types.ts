import { z } from "zod";
import type { Rng } from "../../lib/rng";

// ---------------------------------------------------------------------------
// Decrypto — core types
//
// Two teams (0 = White, 1 = Black) each guard four secret keywords numbered
// 1–4. Every round each team's Encryptor draws a secret ordered code of three
// DISTINCT digits and publishes three free-text clues for it; the encryptor's
// own team tries to reconstruct the code while the opposing team tries to
// intercept it from the accumulated clue history. 2 interception tokens win,
// 2 miscommunication tokens lose, hard stop after round 8 (points tiebreak,
// then shared victory).
//
// The "interceptor" variant is the official 3-player game: a 2-player
// encrypting team (team 0) against a solo Interceptor (pseudo-team 1 with no
// keywords and no transmissions of its own). The interceptor gains a token on
// an exact intercept OR whenever the team's decoder fails, wins at 2 tokens
// within 5 rounds, and otherwise the team wins.
// ---------------------------------------------------------------------------

export type Team = 0 | 1;
export type Digit = 1 | 2 | 3 | 4;
/** Ordered triple of DISTINCT digits — one of exactly 24 permutations. */
export type Code = [Digit, Digit, Digit];
export type DraftCode = [Digit | null, Digit | null, Digit | null];
export type GuessPurpose = "decode" | "intercept";
export type DecryptoVariant = "standard" | "interceptor";

export const MAX_CLUE_LENGTH = 40;
export const MAX_CHAT_LENGTH = 300;
export const STANDARD_MAX_ROUNDS = 8;
export const INTERCEPTOR_MAX_ROUNDS = 5;
export const TOKENS_TO_WIN = 2;

/** One team's public/secret transmission of a single round. */
export interface Transmission {
  /** The encrypting team. */
  team: Team;
  /** Seat of this round's encryptor for that team. */
  encryptor: number;
  /** The secret code — visible only to the encryptor until reveal. */
  code: Code;
  /** Null until the encryptor submits. Public once submitted. */
  clues: [string, string, string] | null;
  /** True when the clue timer expired before submission — no clues this round. */
  skipped: boolean;
  /** Collaborative scratch state, visible to the eligible guessers only. */
  decodeDraft: DraftCode;
  interceptDraft: DraftCode;
  /** Committed guesses — hidden from everyone until reveal. */
  decodeGuess: Code | null;
  interceptGuess: Code | null;
  /** False in round 1 (no interception attempts before any history exists). */
  interceptRequired: boolean;
  /** Set by the reveal step; null while the transmission is live. */
  resolved: { intercepted: boolean; miscommunicated: boolean } | null;
}

export interface RoundRecord {
  round: number;
  /** Two transmissions in the standard game (White then Black), one in the variant. */
  transmissions: Transmission[];
}

export interface ChatMessage {
  seat: number;
  team: Team;
  round: number;
  text: string;
}

export interface TeamState {
  /** Machine seat indices on this team, in rotation order. */
  players: number[];
  /** Null only for the interceptor pseudo-team. */
  keywords: [string, string, string, string] | null;
  interceptions: number;
  miscommunications: number;
  /** Normalized clues this team has given, whole game — the no-reuse rule. */
  usedClues: string[];
}

export type DecryptoEndReason =
  | "interceptions"
  | "miscommunications"
  | "points"
  | "shared"
  | "interceptor-tokens"
  | "survived";

export interface DecryptoResult {
  /** Winning team index (variant: 0 = the team, 1 = the interceptor). Absent = shared victory. */
  winner?: Team;
  reason: DecryptoEndReason;
  /** Interceptions minus miscommunications, per team. */
  points: [number, number];
  rounds: number;
}

export interface DecryptoContext {
  variant: DecryptoVariant;
  timerEnabled: boolean;
  seed: number;
  rng: Rng;
  humanPlayers: number[];
  /** Per SEAT: the GPT model id driving that seat, or null for a human. */
  aiModels: (string | null)[];
  teams: [TeamState, TeamState];
  /** 1-based; 0 before the first round begins. */
  round: number;
  /** This round's transmissions, built at round start. */
  current: Transmission[];
  /** Index into `current` of the transmission currently resolving. */
  txIdx: number;
  /** Absolute ms timestamp the 30s clue timer expires at, for client countdowns. */
  clueTimerDeadlineTs: number | null;
  chat: ChatMessage[];
  history: RoundRecord[];
  result: DecryptoResult | null;
  beats: DecryptoBeats;
}

// ---------------------------------------------------------------------------
// Client actions (inside the PLAYER_ACTION envelope)
// ---------------------------------------------------------------------------

export type DecryptoAction =
  | { kind: "submit-clues"; clues: [string, string, string] }
  | { kind: "submit-guess"; purpose: GuessPurpose; code: Code }
  | { kind: "set-draft"; purpose: GuessPurpose; slot: 0 | 1 | 2; digit: Digit | null }
  | { kind: "chat"; text: string };

const ClueSchema = z.string().trim().min(1).max(MAX_CLUE_LENGTH);

export const SubmitCluesActionSchema = z.object({
  kind: z.literal("submit-clues"),
  clues: z.tuple([ClueSchema, ClueSchema, ClueSchema]),
});

export const ChatActionSchema = z.object({
  kind: z.literal("chat"),
  text: z.string().trim().min(1).max(MAX_CHAT_LENGTH),
});

/** Pacing delays, ms. Overridable via START so tests run at millisecond scale. */
export interface DecryptoBeats {
  roundStart: number;
  aiBeat: number;
  reveal: number;
  roundEnd: number;
  clueTimeout: number;
}

export const DEFAULT_BEATS: DecryptoBeats = {
  roundStart: 600,
  aiBeat: 500,
  reveal: 2500,
  roundEnd: 1500,
  clueTimeout: 30_000,
};

export type DecryptoMachineEvent =
  | {
      type: "START";
      variant?: DecryptoVariant;
      timerEnabled?: boolean;
      humanPlayers?: number[];
      /** Per seat; null/absent entries are humans. */
      aiModels?: (string | null)[];
      seed?: number;
      beats?: Partial<DecryptoBeats>;
    }
  | { type: "PLAYER_ACTION"; player: number; action: DecryptoAction }
  | { type: "RESET" };

// ---------------------------------------------------------------------------
// Player view (redacted per seat by player-view.ts)
// ---------------------------------------------------------------------------

export type DecryptoViewPhase =
  | "idle"
  | "roundStart"
  | "clueWriting"
  | "guessing"
  | "reveal"
  | "roundEnd"
  | "gameOver";

export interface SeatView {
  seat: number;
  team: Team;
  isAi: boolean;
  model: string | null;
  /** True while this seat is an encryptor of a live (unresolved) transmission. */
  isEncryptor: boolean;
}

export interface TransmissionView {
  team: Team;
  encryptor: number;
  /** Public once submitted; null while the encryptor is still writing. */
  clues: [string, string, string] | null;
  skipped: boolean;
  /** The secret code: present for the encryptor pre-reveal, for everyone post-reveal. */
  code: Code | null;
  /** Present only for seats eligible to edit it. */
  myDraft: DraftCode | null;
  decodeCommitted: boolean;
  interceptCommitted: boolean;
  interceptRequired: boolean;
  resolved: {
    code: Code;
    decodeGuess: Code | null;
    interceptGuess: Code | null;
    intercepted: boolean;
    miscommunicated: boolean;
  } | null;
}

/** A fully-revealed transmission, for history feeds — everything is public post-reveal. */
export interface RoundSummaryView {
  round: number;
  transmissions: {
    team: Team;
    encryptor: number;
    clues: [string, string, string] | null;
    skipped: boolean;
    code: Code;
    decodeGuess: Code | null;
    interceptGuess: Code | null;
    intercepted: boolean;
    miscommunicated: boolean;
  }[];
}

/** One row of the public note sheet: a clue whose digit has been revealed. */
export interface RevealedClueView {
  round: number;
  clue: string;
  digit: Digit;
}

export interface DecryptoPlayerView {
  variant: DecryptoVariant;
  phase: DecryptoViewPhase;
  round: number;
  maxRounds: number;
  seat: number;
  team: Team;
  /** Null for the interceptor (who has no keywords). */
  myKeywords: [string, string, string, string] | null;
  tokens: { interceptions: number; miscommunications: number }[];
  seats: SeatView[];
  transmissions: TransmissionView[];
  txIdx: number;
  /**
   * The public deduction board: per team, per digit 1–4, every clue whose
   * digit has been revealed (resolved transmissions only).
   */
  noteSheet: [RevealedClueView[][], RevealedClueView[][]];
  /** Chronological reveal history (resolved transmissions only) — drives the log. */
  roundSummaries: RoundSummaryView[];
  /** Own team only; messages sent while this seat was a locked-out encryptor are omitted. */
  chat: ChatMessage[];
  timerEnabled: boolean;
  clueTimerDeadlineTs: number | null;
  myPending: { encrypt: boolean; decode: boolean; intercept: boolean };
  /** Full disclosure at game over. */
  result: (DecryptoResult & { keywords: [string[] | null, string[] | null] }) | null;
}
