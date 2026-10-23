// The games the quiz platform's questions come from. A source's own
// categories are kept verbatim on every printed wording (`printed.category`)
// — that is what a table game deals by — but they are never the platform's
// navigation (`taxonomy.ts`). The layout fields describe the physical card
// for the ingest pipeline (`scripts/quiz-ingest/`).

import { QUIZTOPIA_CATEGORIES } from "../games/quiztopia/categories.ts";

export interface SourceCategory {
  /** 1-based position on the card, as stored in `printed.category`. */
  readonly n: number;
  readonly en: string;
  readonly de: string;
  readonly ru: string;
}

export interface QuizSource {
  readonly id: string;
  readonly title: string;
  /** Catalog slug of the game. */
  readonly gameSlug: string;
  /** The order a fact's wordings are preferred in when several sources print one. */
  readonly rank: number;
  readonly categories: readonly SourceCategory[];
  /** One question per category on every card. */
  readonly questionsPerCard: number;
  /** Where the answers are printed. */
  readonly answers: "same-side" | "back-side";
  /** The language the cards are printed in (the transcription keeps it verbatim). */
  readonly language: "de" | "en";
  /** How the questions sit on the photographed card, for the transcribing worker. */
  readonly layout: string;
}

const QUIZTOPIA_RU = [
  "Сцена и музыка",
  "Язык и литература",
  "Искусство и архитектура",
  "Кино и телевидение",
  "Спорт и игры",
  "История и общество",
  "Экономика и политика",
  "Религия и философия",
  "Медицина и наука",
  "Земля и космос",
  "Флора и фауна",
  "Компьютеры и техника",
];

export const QUIZ_SOURCES: readonly QuizSource[] = [
  {
    id: "quiztopia",
    title: "Quiztopia",
    gameSlug: "quiztopia",
    rank: 1,
    categories: QUIZTOPIA_CATEGORIES.map(({ n, en, de }, i) => ({
      n,
      en,
      de,
      ru: QUIZTOPIA_RU[i],
    })),
    questionsPerCard: 12,
    answers: "back-side",
    language: "de",
    layout:
      "Rotate 90° left. Three colour bands, pink / blue / sand from top; each band has an icon " +
      "circle with two questions stacked left of it and two right of it. Order: band by band, " +
      "top-left, top-right, bottom-left, bottom-right.",
  },
  {
    id: "trivial-pursuit",
    title: "Trivial Pursuit",
    gameSlug: "trivial-pursuit",
    rank: 2,
    // The German Classic edition's wedges, in the order the card prints them.
    // Confirm against the scanned box before the first ingest run.
    categories: [
      { n: 1, en: "Geography", de: "Geografie", ru: "География" },
      { n: 2, en: "Entertainment", de: "Unterhaltung", ru: "Развлечения" },
      { n: 3, en: "History", de: "Geschichte", ru: "История" },
      { n: 4, en: "Art & Literature", de: "Kunst & Literatur", ru: "Искусство и литература" },
      { n: 5, en: "Science & Nature", de: "Wissenschaft & Natur", ru: "Наука и природа" },
      { n: 6, en: "Sports & Leisure", de: "Sport & Vergnügen", ru: "Спорт и досуг" },
    ],
    questionsPerCard: 6,
    answers: "back-side",
    language: "de",
    layout:
      "Questions on the front, one per wedge colour in the printed order (blue, pink, yellow, " +
      "purple/brown, green, orange); the answers on the back in the same order. Photograph " +
      "both sides.",
  },
  {
    id: "publish-or-perish",
    title: "Publish or Perish",
    gameSlug: "publish-or-perish",
    rank: 3,
    // Each face prints two questions, each headed by an academic discipline
    // ("[Botany] …") that varies from card to card — kept verbatim in the
    // card text; the categories here are just the two positions.
    categories: [
      { n: 1, en: "Upper question", de: "Obere Frage", ru: "Верхний вопрос" },
      { n: 2, en: "Lower question", de: "Untere Frage", ru: "Нижний вопрос" },
    ],
    questionsPerCard: 2,
    answers: "same-side",
    language: "en",
    layout:
      "The photo is upside down: rotate 180°. One card face, two questions top to bottom, each " +
      '"[Discipline] question", options A/B/C, "Answer: X." and a short explanation — all in English, ' +
      "no card number.",
  },
  {
    id: "publish-or-perish-mge",
    title: "Publish or Perish: Midterm Grading Extravaganza",
    gameSlug: "publish-or-perish",
    rank: 4,
    // The expansion deck: the base game's card format, its own source so a
    // member can switch it separately.
    categories: [
      { n: 1, en: "Upper question", de: "Obere Frage", ru: "Верхний вопрос" },
      { n: 2, en: "Lower question", de: "Untere Frage", ru: "Нижний вопрос" },
    ],
    questionsPerCard: 2,
    answers: "same-side",
    language: "en",
    layout:
      "The photo is upright. One card face, two questions top to bottom, each " +
      '"[Discipline] question", options A/B/C, "Answer: X." and a short explanation — all in English, ' +
      "no card number.",
  },
];

export const SOURCE_IDS = QUIZ_SOURCES.map((s) => s.id) as [string, ...string[]];

export function sourceById(id: string): QuizSource | undefined {
  return QUIZ_SOURCES.find((s) => s.id === id);
}
