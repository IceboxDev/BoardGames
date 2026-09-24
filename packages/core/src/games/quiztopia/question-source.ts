// The seam between the content-agnostic engine and the question content.
// The server installs its content store here at boot (the same module-level
// pattern as `setDecryptoAgent`); tests install a deterministic fixture.
// Everything is synchronous because the engine runs inside XState `assign`.

import { SETS_PER_CARD } from "./ids.ts";

export type QuiztopiaDeck = "original" | "extended";

export interface QuestionSet {
  questionId: string;
  /** 0-based building index (= category n − 1). */
  categoryIndex: number;
  en: string;
  de: string;
  answerEn: string;
  answerDe: string;
  /** Player-facing editor's notes for the set, per language ("" when none). */
  notesEn: string;
  notesDe: string;
}

export interface QuestionCard {
  /** The card ref drawn from the deck: `c042` or a virtual `c042-v3`. */
  ref: string;
  cardId: string;
  /** Exactly 12, `sets[i].categoryIndex === i`. */
  sets: readonly QuestionSet[];
}

export interface QuestionSource {
  /** Every card ref the deck can draw from, in a stable order (the engine shuffles). */
  listCardRefs(deck: QuiztopiaDeck): readonly string[];
  getCard(ref: string): QuestionCard | null;
}

const EMPTY_SOURCE: QuestionSource = {
  listCardRefs: () => [],
  getCard: () => null,
};

let current: QuestionSource = EMPTY_SOURCE;

export function setQuestionSource(source: QuestionSource | null): void {
  current = source ?? EMPTY_SOURCE;
}

export function getQuestionSource(): QuestionSource {
  return current;
}

/**
 * Deterministic stand-in for tests and previews: `cardCount` cards
 * (`f001`…), 12 sets each, question "Q<card>-<cat>[-v<k>]" with answer
 * "A<card>-<cat>[-v<k>]". Extended refs `f001-v1`…`-v4` exist too.
 */
export function createFixtureQuestionSource(cardCount = 30): QuestionSource {
  const ids = Array.from({ length: cardCount }, (_, i) => `f${String(i + 1).padStart(3, "0")}`);
  const originals = [...ids];
  const extended = [...ids];
  for (let k = 1; k <= 4; k++) for (const id of ids) extended.push(`${id}-v${k}`);
  return {
    listCardRefs: (deck) => (deck === "original" ? originals : extended),
    getCard: (ref) => {
      const m = /^(f\d{3})(?:-v([1-4]))?$/.exec(ref);
      if (!m || !ids.includes(m[1])) return null;
      const cardId = m[1];
      const k = m[2] ? Number(m[2]) : 0;
      const suffix = k ? `-v${k}` : "";
      const sets: QuestionSet[] = [];
      for (let i = 0; i < SETS_PER_CARD; i++) {
        const cat = String(i + 1).padStart(2, "0");
        sets.push({
          questionId: `${cardId}-s${cat}-q${k}`,
          categoryIndex: i,
          en: `Question ${cardId}-${cat}${suffix} (EN)?`,
          de: `Frage ${cardId}-${cat}${suffix} (DE)?`,
          answerEn: `Answer ${cardId}-${cat}${suffix}`,
          answerDe: `Antwort ${cardId}-${cat}${suffix}`,
          notesEn: "",
          notesDe: "",
        });
      }
      return { ref, cardId, sets };
    },
  };
}
