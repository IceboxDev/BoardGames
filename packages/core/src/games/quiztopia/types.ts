// Shared shapes of the Quiztopia game: START config, engine state, actions,
// the per-seat view and the result/replay records. The engine, machine,
// server and web all import from here.

import { z } from "zod";
import type { QuestionSet, QuestionSource, QuiztopiaDeck } from "./question-source.ts";

export type { QuestionSet, QuiztopiaDeck } from "./question-source.ts";

export const QUIZTOPIA_DECKS = ["original", "extended"] as const;
export const CARDS_PER_GAME = 24;
export const BUILDING_COUNT = 12;
/** Active tip cards in Expert mode, indexed by difficulty tier. */
export const TIP_CARDS_BY_TIER = [4, 3, 2, 2] as const;

export type QuestionLanguage = "en" | "de";

// ── START config ────────────────────────────────────────────────────────

export const QuiztopiaStartConfigSchema = z
  .object({
    playerCount: z.number().int().min(1).max(6),
    /** Seat indices in table order; defaults to 0..playerCount−1. */
    seats: z.array(z.number().int().min(0).max(5)).min(1).max(6).optional(),
    difficulty: z.number().int().min(0).max(3).default(0),
    expert: z.boolean().default(false),
    deck: z.enum(QUIZTOPIA_DECKS).default("original"),
    seed: z.number().int().optional(),
    language: z.enum(["en", "de"]).optional(),
  })
  .refine(
    (c) =>
      !c.seats || (c.seats.length === c.playerCount && new Set(c.seats).size === c.seats.length),
    { message: "seats must list playerCount distinct seat indices" },
  );
export type QuiztopiaStartConfigInput = z.input<typeof QuiztopiaStartConfigSchema>;
export type QuiztopiaStartConfig = z.output<typeof QuiztopiaStartConfigSchema>;

// ── Help cards ──────────────────────────────────────────────────────────

export const HELP_CARD_IDS = [
  "besetzung",
  "datenleak",
  "insidertipp",
  "benefizvorstellung",
  "alternative-fakten",
  "streik",
] as const;
export type HelpCardId = (typeof HELP_CARD_IDS)[number];
export const HelpCardIdSchema = z.enum(HELP_CARD_IDS);

export type HelpEffect =
  | "return-lost-building"
  | "peek-answer"
  | "reader-tip"
  | "reader-mime"
  | "redraw-question"
  | "shield";

export interface HelpCardDef {
  id: HelpCardId;
  nameDe: string;
  nameEn: string;
  textDe: string;
  textEn: string;
  effect: HelpEffect;
  /** Stays in the deck for a 1-player game. */
  soloAllowed: boolean;
  /** Effect designed from the name, not read off the printed card. */
  assumed: boolean;
}

export interface HelpCardState {
  id: HelpCardId;
  used: boolean;
}

// ── Engine state ────────────────────────────────────────────────────────

export type BuildingStatus = "dark" | "bright" | "won" | "lost";

export type QuiztopiaPhase =
  | "choose-building"
  | "question"
  | "judge"
  | "bakery-offer"
  | "loss-pending"
  | "game-over";

export type QuiztopiaOutcome = "win" | "loss-deck" | "loss-buildings";

export type ReaderHint = "word" | "mime";
export type PenaltySeverity = "tip" | "answer";

export interface CurrentQuestion extends QuestionSet {
  cardRef: string;
}

export interface TurnState {
  /** 1-based turn number. */
  index: number;
  activeSeat: number;
  /** Seat to the right of the active seat; null in a 1-player game. */
  readerSeat: number | null;
  buildingIndex: number | null;
  question: CurrentQuestion | null;
  revealed: boolean;
  tipFlips: number;
  plenum: boolean;
  /** Seat that peeked via Datenleak (barred from the plenum). */
  peekSeat: number | null;
  readerHint: ReaderHint | null;
  shield: boolean;
  helpPlayed: HelpCardId[];
  penalties: { severity: PenaltySeverity; by: number }[];
  /** Question cards discarded this turn (tip reactivation, penalties, redraws). */
  discards: number;
}

export interface QuestionLogEntry {
  turn: number;
  cardRef: string;
  questionId: string;
  categoryIndex: number;
  en: string;
  de: string;
  answerEn: string;
  answerDe: string;
  activeSeat: number;
  readerSeat: number | null;
  /** null = redrawn via Alternative Fakten, never judged. */
  correct: boolean | null;
  shielded: boolean;
  buildingBefore: BuildingStatus;
  buildingAfter: BuildingStatus;
  helpPlayed: HelpCardId[];
  tipFlips: number;
  plenum: boolean;
  penalties: number;
  bakery: boolean;
}

export interface LastResolution {
  turn: number;
  buildingIndex: number;
  correct: boolean;
  before: BuildingStatus;
  after: BuildingStatus;
  shielded: boolean;
}

export interface QuiztopiaGameState {
  playerCount: number;
  seats: number[];
  difficulty: number;
  expert: boolean;
  deck: QuiztopiaDeck;
  seed: number;
  language: QuestionLanguage | null;
  phase: QuiztopiaPhase;
  /** Length 12, index = category n − 1. */
  buildings: BuildingStatus[];
  /** Card refs still in the holder, top first. */
  drawPile: string[];
  cardsUsed: number;
  helpDeck: HelpCardState[];
  /** `helpDeck.slice(0, helpOpen)` is face-up. */
  helpOpen: number;
  tipCards: { total: number; active: number } | null;
  turn: TurnState;
  bakery: boolean;
  bakeryComplete: boolean;
  lastResolution: LastResolution | null;
  questionLog: QuestionLogEntry[];
  outcome: QuiztopiaOutcome | null;
}

export interface EngineDeps {
  source: QuestionSource;
}

// ── Actions ─────────────────────────────────────────────────────────────

export const QuiztopiaActionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("choose-building"), buildingIndex: z.number().int().min(0).max(11) }),
  z.object({ kind: z.literal("reveal") }),
  z.object({ kind: z.literal("judge"), correct: z.boolean() }),
  z.object({
    kind: z.literal("play-help"),
    helpId: HelpCardIdSchema,
    buildingIndex: z.number().int().min(0).max(11).optional(),
  }),
  z.object({ kind: z.literal("flip-tip-card") }),
  z.object({ kind: z.literal("reactivate-tip") }),
  z.object({ kind: z.literal("penalty"), severity: z.enum(["tip", "answer"]) }),
  z.object({ kind: z.literal("bakery"), accept: z.boolean() }),
  z.object({ kind: z.literal("accept-loss") }),
]);
export type QuiztopiaAction = z.infer<typeof QuiztopiaActionSchema>;

export type QuiztopiaMachineEvent =
  | ({ type: "START" } & QuiztopiaStartConfigInput)
  | { type: "PLAYER_ACTION"; player: number; action: QuiztopiaAction }
  | { type: "RESET" };

// ── Player view ─────────────────────────────────────────────────────────

export interface QuestionView {
  cardRef: string;
  questionId: string;
  categoryIndex: number;
  en: string;
  de: string;
  /** null until the answer is visible to this seat. */
  answerEn: string | null;
  answerDe: string | null;
  /** Player-facing editor's notes, per language ("" when none). */
  notesEn: string;
  notesDe: string;
}

export interface TurnView {
  index: number;
  buildingIndex: number | null;
  question: QuestionView | null;
  revealed: boolean;
  tipFlips: number;
  plenum: boolean;
  plenumBarred: number[];
  peekSeat: number | null;
  readerHint: ReaderHint | null;
  shield: boolean;
  helpPlayed: HelpCardId[];
  penalties: number;
  discards: number;
}

export interface QuiztopiaPlayerView {
  you: number;
  playerCount: number;
  seats: number[];
  difficulty: number;
  difficultyLabel: string;
  expert: boolean;
  deck: QuiztopiaDeck;
  language: QuestionLanguage | null;
  phase: QuiztopiaPhase;
  activeSeat: number;
  readerSeat: number | null;
  nextSeat: number;
  buildings: BuildingStatus[];
  won: number;
  lost: number;
  required: number;
  lossAt: number;
  inMiddle: number;
  deckRemaining: number;
  cardsUsed: number;
  help: { faceUp: HelpCardState[]; hidden: number; deckSize: number };
  tipCards: { total: number; active: number } | null;
  turn: TurnView;
  answerVisible: boolean;
  isYourTurn: boolean;
  bakery: boolean;
  bakeryOffer: boolean;
  lossPending: boolean;
  bakeryComplete: boolean;
  lastResolution: LastResolution | null;
  /** Answers are blanked ("") on entries that were never judged. */
  questionLog: QuestionLogEntry[];
  outcome: QuiztopiaOutcome | null;
}

// ── Result + replay ─────────────────────────────────────────────────────

export interface QuiztopiaResult {
  outcome: QuiztopiaOutcome;
  bakery: boolean;
  bakeryComplete: boolean;
  won: number;
  lost: number;
  required: number;
  questionsAsked: number;
  cardsUsed: number;
  difficulty: number;
  difficultyLabel: string;
  expert: boolean;
  deck: QuiztopiaDeck;
  playerCount: number;
  seed: number;
  perCategory: { asked: number; correct: number }[];
}

export interface QuiztopiaReplayLog {
  slug: "quiztopia";
  version: 1;
  config: {
    playerCount: number;
    seats: number[];
    difficulty: number;
    expert: boolean;
    deck: QuiztopiaDeck;
    seed: number;
    language: QuestionLanguage | null;
  };
  result: QuiztopiaResult;
  questions: QuestionLogEntry[];
  helpUsed: HelpCardId[];
  finalBuildings: BuildingStatus[];
  playerCount: number;
  /** Buildings won → `session_replays.score_p0`. */
  scoreA: number;
  /** Buildings lost → `session_replays.score_p1`. */
  scoreB: number;
}
