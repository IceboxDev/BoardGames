import { CODENAMES_AI_MODELS, codenamesModelOf } from "@boardgames/core/games/codenames/ai/models";
import type { Clue } from "@boardgames/core/games/codenames/clue-rules";
import type { ClueNote, GuessNote } from "@boardgames/core/games/codenames/notes";
import type { AppealRuling } from "@boardgames/core/games/codenames/types";
import type { CoverTone, GridCard } from "./WordGrid";

// The end-of-game review, as data: one entry per turn with what the clue was
// aimed at and how each of those cards fared, every touch with the AI's
// confidence and reason, and the board as it stood for any turn. Built from
// the game-over view or a saved replay; Duet builds the same shapes
// (`codenames-duet/logic.ts`), so one screen shows both.

export type Verdict = "hit" | "bystander" | "opponent" | "assassin";

/** What became of a card a clue was aimed at. */
export type TargetFate = "now" | "later" | "them" | "never";

export interface ReviewTarget {
  card: number;
  word: string;
  /** What it really was (a clue may be aimed wrong). */
  tone: CoverTone;
  fate: TargetFate;
  /** How the clue connects to it, in the spymaster's words (AI). */
  why: string | null;
}

export interface ReviewGuess {
  card: number;
  word: string;
  by: string;
  tone: CoverTone;
  verdict: Verdict;
  confidence: number | null;
  why: string | null;
}

/** A clue question asked before the turn's clue (classic only). */
export interface ReviewAppeal {
  word: string;
  clash: string;
  judge: string;
  ruling: AppealRuling;
  reason: string | null;
}

export interface ReviewTurn {
  index: number;
  /** The side's colour (a team, or Duet green). */
  tone: CoverTone;
  side: string;
  giver: string | null;
  /** The AI tier's name ("Mastermind"), or null for a person. */
  giverAi: string | null;
  guesser: string | null;
  guesserAi: string | null;
  clue: Clue | null;
  /** Clue questions put to the other spymaster first (Duet has none). */
  appeals?: ReviewAppeal[];
  reasoning: string | null;
  standIn: boolean;
  /** null: nothing was recorded (a person who didn't tap their cards). */
  targets: ReviewTarget[] | null;
  /** Earlier clues' leftovers the extra guess was meant for. */
  leftover: ReviewTarget[];
  guesses: ReviewGuess[];
  guessReasoning: string | null;
  guessStandIn: boolean;
  /** Picks the AI meant to touch that the turn never reached. */
  unplayed: { word: string; confidence: number | null; why: string | null }[];
  end: string;
  /** Good touches this turn. */
  hits: number;
}

export interface RaceSeries {
  label: string;
  tone: CoverTone;
  /** Agents still to find after 0, 1, … turns (0 = that side has won). */
  points: number[];
  total: number;
}

export interface Highlight {
  label: string;
  value: string;
  detail: string;
  tone: CoverTone | "neutral";
}

export interface ReviewModel {
  turns: ReviewTurn[];
  series: RaceSeries[];
  highlights: Highlight[];
  /** The board for a turn (null = the final board, whole key showing). */
  boardAt: (turn: number | null) => GridCard[];
}

export function tierName(id: string | null | undefined): string | null {
  if (!id) return null;
  const tier = codenamesModelOf(id);
  return CODENAMES_AI_MODELS.find((m) => m.id === tier)?.label ?? "AI";
}

/**
 * A clue's targets and leftovers as the review lists them: each word with
 * what became of it and the spymaster's reason for it.
 */
export function noteTargets(
  note: ClueNote | undefined,
  words: readonly string[],
  toneOfCard: (card: number) => CoverTone,
  fateOf: (card: number) => TargetFate,
): { targets: ReviewTarget[] | null; leftover: ReviewTarget[] } {
  const target = (card: number): ReviewTarget => ({
    card,
    word: (words[card] ?? "?").toUpperCase(),
    tone: toneOfCard(card),
    fate: fateOf(card),
    why: note?.links.find((l) => l.card === card)?.why ?? null,
  });
  return {
    targets: note ? note.targets.map(target) : null,
    leftover: (note?.leftover ?? []).map(target),
  };
}

/** Every AI guessing call of a turn, flattened: the picks' notes and the reasoning. */
export function guessParts(notes: readonly GuessNote[] | undefined) {
  const all = notes ?? [];
  const picks = all.flatMap((n) => n.picks);
  return {
    pickNote: (card: number) => picks.find((p) => p.card === card) ?? null,
    planned: picks,
    reasoning: all.map((n) => n.reasoning).find((r) => r) ?? null,
    standIn: all.some((n) => n.standIn),
  };
}
