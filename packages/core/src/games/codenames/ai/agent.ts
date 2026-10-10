/**
 * The async AI seam for Codenames and Duet. Core stays pure (no network/SDK
 * deps): the machines' AI actors default to the deterministic fallback, and
 * the server binds its model-backed agent per session (`withCodenamesAgent`,
 * `withDuetAgent` — XState `provide`), never through module globals.
 *
 * SAFETY CONTRACT: the machines race every call against a deadline, catch
 * throws and sanitize the output against the rules (`clueProblem`, face-down
 * cards only), so an agent may be slow, wrong or hostile — the fallback must
 * be synchronous-fast, throw-free and always legal.
 *
 * REDACTION: `GuessInput` has no key field at all, and its history is the
 * public one (`PublicTurn`, no intended targets). An operative's prompt is
 * built from public table state only, so a prompt bug can't leak the key.
 */
import type { Clue, ClueCount } from "../clue-rules";
import type { Language } from "../words";
import type { CodenamesAiModel } from "./models";

/** What a spymaster knows about one card, from their own side of the key. */
export type SpymasterCardKind = "own" | "opponent" | "bystander" | "assassin";

export interface SpymasterCard {
  index: number;
  word: string;
  kind: SpymasterCardKind;
  /** Face-up already — no longer a target, no longer a clue restriction. */
  revealed: boolean;
}

/** A turn as the whole table saw it. */
export interface PublicTurn {
  /** Whose turn it was, from the asking seat's point of view. */
  by: "us" | "them";
  clue: Clue | null;
  guesses: { word: string; result: "own" | "opponent" | "bystander" | "assassin" }[];
}

/** A turn as a spymaster remembers it: their own clues' intended words too. */
export interface SpymasterTurn extends PublicTurn {
  /** The words this side's clue was aimed at (its own turns only, when known). */
  intended?: string[];
}

export interface ClueInput {
  model: CodenamesAiModel;
  mode: "classic" | "duet";
  language: Language;
  cards: SpymasterCard[];
  history: SpymasterTurn[];
  /** Agents the guessing side still needs (classic: own team; Duet: this side's agents). */
  agentsLeft: number;
  /** Classic only: agents the other team still needs. */
  opponentAgentsLeft?: number;
  /** Duet only: turns left on the timer (0 = sudden death). */
  turnsLeft?: number;
}

/** What one agent answer cost (summed over its model calls), and the ledger ids. */
export interface AiSpend {
  cost?: { calls: number; usd: number };
  traceIds?: string[];
}

export interface ClueOutput extends Clue, AiSpend {
  /** The cards the clue is meant for — kept for the review, never trusted. */
  targets?: number[];
  /** Per target, why the clue points at it. */
  links?: { card: number; why: string }[];
  /** Earlier leftovers the extra guess is meant for. */
  leftover?: number[];
  /** A sentence or two on why — kept for the review. */
  reasoning?: string;
  /** Other clues it weighed. */
  considered?: { word: string; count: ClueCount; targets: number[] }[];
  /** How a keyless test reader ranked the table for the chosen clue. */
  testRead?: number[];
  /** Set by the deterministic stand-in. */
  standIn?: boolean;
}

export interface GuessInput {
  model: CodenamesAiModel;
  mode: "classic" | "duet";
  language: Language;
  /** The face-down cards — public information only. */
  words: { index: number; word: string }[];
  clue: Clue;
  /** Guesses still allowed this turn (`null` = unlimited). */
  guessesLeft: number | null;
  /** Agents the guessing side still has to find (public: the table shows it). */
  agentsLeft: number;
  /** Classic only: agents the other team still needs. */
  opponentAgentsLeft?: number;
  /** Duet only: turns left on the timer (0 = sudden death). */
  turnsLeft?: number;
  history: PublicTurn[];
}

export interface GuessOutput extends AiSpend {
  /** Card indices in the order to touch them; the machine stops at a miss. */
  picks: number[];
  /** Per pick (any order): how sure, and why — kept for the review. */
  notes?: { card: number; confidence: number; why: string }[];
  /** The read of the clue as a whole. */
  reasoning?: string;
  /** Set by the deterministic stand-in. */
  standIn?: boolean;
}

export interface CodenamesAiAgent {
  giveClue(input: ClueInput): Promise<ClueOutput>;
  guess(input: GuessInput): Promise<GuessOutput>;
}
