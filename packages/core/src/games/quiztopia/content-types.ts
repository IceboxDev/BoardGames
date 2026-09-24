// Wire/file shapes of the generated content under `./content/`. The importer
// validates its output against these, the core integrity test re-validates
// the committed files, and the server parses them at boot — so a hand edit
// that breaks the shape fails before it ships.

import { z } from "zod";
import { CARD_ID_RE, QUESTION_ID_RE, QUESTIONS_PER_SET, SET_ID_RE, SETS_PER_CARD } from "./ids.ts";

export const CardIdSchema = z.string().regex(CARD_ID_RE);
export const SetIdSchema = z.string().regex(SET_ID_RE);
export const QuestionIdSchema = z.string().regex(QUESTION_ID_RE);
export const CategoryNSchema = z.number().int().min(1).max(SETS_PER_CARD);

export const ContentCategorySchema = z.object({
  n: CategoryNSchema,
  en: z.string().min(1),
  de: z.string().min(1),
  band: z.enum(["pink", "blue", "sand"]),
});

export const ContentIndexSchema = z.object({
  version: z.string().regex(/^[0-9a-f]{12}$/),
  generatedAt: z.string(),
  counts: z.object({
    cards: z.number().int().nonnegative(),
    sets: z.number().int().nonnegative(),
    questions: z.number().int().nonnegative(),
  }),
  categories: z.array(ContentCategorySchema).length(SETS_PER_CARD),
  cards: z.array(z.object({ id: CardIdSchema, sourceImage: z.string().min(1) })),
});
export type ContentIndex = z.infer<typeof ContentIndexSchema>;

export const ContentQuestionSchema = z.object({
  id: QuestionIdSchema,
  en: z.string().min(1),
  de: z.string().min(1),
  answerEn: z.string().min(1),
  answerDe: z.string().min(1),
});
export type ContentQuestion = z.infer<typeof ContentQuestionSchema>;

export const ContentSetQuestionsSchema = z.object({
  id: SetIdSchema,
  n: CategoryNSchema,
  /** Editor's note from the transcription pass (misprints, dated facts); "" when none. */
  notes: z.string(),
  questions: z.array(ContentQuestionSchema).length(QUESTIONS_PER_SET),
});
export type ContentSetQuestions = z.infer<typeof ContentSetQuestionsSchema>;

export const CardQuestionsSchema = z.object({
  id: CardIdSchema,
  sourceImage: z.string().min(1),
  sets: z.array(ContentSetQuestionsSchema).length(SETS_PER_CARD),
});
export type CardQuestions = z.infer<typeof CardQuestionsSchema>;

/** `[start, length]` of the answer inside the article, in UTF-16 code units. */
export const AnswerSpanSchema = z.tuple([
  z.number().int().nonnegative(),
  z.number().int().positive(),
]);
export type AnswerSpan = z.infer<typeof AnswerSpanSchema>;

export const ContentSetArticleSchema = z.object({
  id: SetIdSchema,
  titleEn: z.string().min(1),
  articleEn: z.string().min(1),
  titleDe: z.string().min(1),
  articleDe: z.string().min(1),
  answerSpans: z.object({
    en: z.array(AnswerSpanSchema).length(QUESTIONS_PER_SET),
    de: z.array(AnswerSpanSchema).length(QUESTIONS_PER_SET),
  }),
});
export type ContentSetArticle = z.infer<typeof ContentSetArticleSchema>;

export const CardArticlesSchema = z.object({
  id: CardIdSchema,
  sets: z.array(ContentSetArticleSchema).length(SETS_PER_CARD),
});
export type CardArticles = z.infer<typeof CardArticlesSchema>;

/** setId → [titleEn, titleDe]; the wiki's browse index. */
export const TitlesSchema = z.record(z.string(), z.tuple([z.string(), z.string()]));
export type Titles = z.infer<typeof TitlesSchema>;
