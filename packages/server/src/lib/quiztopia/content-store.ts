// The server's view of the Quiztopia content that ships in code under
// `packages/core/src/games/quiztopia/content/`. Read from the filesystem at
// boot — the index and every `questions/*.json` (≈ 3 MB, validated through
// the shared Zod shapes so a broken file fails the boot, not a request) —
// while the ≈ 15 MB of `articles/*.json` load lazily per card behind a
// bounded cache. Nothing is bundled by tsup: the directory is resolved at
// runtime relative to this module (tsx dev and the dist layout differ) or
// overridden with `QUIZTOPIA_CONTENT_DIR`.
//
// The store implements the core `QuestionSource` seam so the game machine
// draws cards from it, and adds the trainer's lookups (per-question,
// per-category introduction order) plus the prebuilt search index.

import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type CardArticles,
  CardArticlesSchema,
  type CardQuestions,
  CardQuestionsSchema,
  type ContentIndex,
  ContentIndexSchema,
  type ContentSetArticle,
  type Titles,
  TitlesSchema,
} from "@boardgames/core/games/quiztopia/content-types";
import {
  deckCardRefs,
  newIntroductionOrder,
  parseCardRef,
  parseQuestionId,
  parseSetId,
  SETS_PER_CARD,
} from "@boardgames/core/games/quiztopia/ids";
import type {
  QuestionCard,
  QuestionSet,
  QuestionSource,
  QuiztopiaDeck,
} from "@boardgames/core/games/quiztopia/question-source";
import {
  buildSearchIndex,
  runSearch,
  type SearchDoc,
  type SearchHit,
  type SearchIndex,
  type SearchLang,
} from "@boardgames/core/games/quiztopia/search";

export const CONTENT_DIR_ENV = "QUIZTOPIA_CONTENT_DIR";
/** Article files kept in memory at once (≈ 90 KB each). */
export const ARTICLE_CACHE_SIZE = 24;

export interface StoredQuestion {
  id: string;
  cardId: string;
  setId: string;
  /** Category, 1..12. */
  n: number;
  /** 0 = the original card question, 1..4 = sibling. */
  q: number;
  en: string;
  de: string;
  answerEn: string;
  answerDe: string;
  /** Editor's note for the set ("" when none). */
  notes: string;
}

export interface SearchOptions {
  q: string;
  lang: SearchLang;
  limit: number;
  category?: number;
}

export interface ContentStore extends QuestionSource {
  readonly dir: string;
  readonly version: string;
  readonly categories: ContentIndex["categories"];
  /** Card ids in index order (`c001`…). */
  readonly cardIds: readonly string[];
  hasQuestion(id: string): boolean;
  getQuestion(id: string): StoredQuestion | null;
  /** Every question id of category `n` in trainer introduction order (all q0 first). */
  questionIdsByCategory(n: number): readonly string[];
  getCardQuestions(cardId: string): CardQuestions | null;
  /** Both titles of a set, or null for an unknown set. */
  getTitles(setId: string): readonly [string, string] | null;
  search(opts: SearchOptions): SearchHit[];
  /** Lazy per-card article file; null for an unknown set. */
  getArticle(setId: string): Promise<ContentSetArticle | null>;
}

// ── Directory resolution ───────────────────────────────────────────────

const CONTENT_REL = "core/src/games/quiztopia/content";

/**
 * Candidate directories, in order: the env override, this module's
 * location under `packages/server/src/lib/quiztopia` (tsx dev) or
 * `packages/server/dist` (tsup bundle), then the working directory as the
 * repo root (Railway's start command) or as `packages/server`.
 */
export function contentDirCandidates(env: NodeJS.ProcessEnv = process.env): string[] {
  const here = fileURLToPath(new URL(".", import.meta.url));
  const out: string[] = [];
  const override = env[CONTENT_DIR_ENV];
  if (override) out.push(resolve(override));
  out.push(
    resolve(here, "../../../../", CONTENT_REL),
    resolve(here, "../../", CONTENT_REL),
    resolve(process.cwd(), "packages", CONTENT_REL),
    resolve(process.cwd(), "..", CONTENT_REL),
  );
  return out;
}

export function resolveContentDir(env: NodeJS.ProcessEnv = process.env): string {
  const candidates = contentDirCandidates(env);
  const override = env[CONTENT_DIR_ENV];
  if (override && !existsSync(join(candidates[0], "index.json"))) {
    throw new Error(`${CONTENT_DIR_ENV}=${override} has no index.json`);
  }
  for (const dir of candidates) {
    if (existsSync(join(dir, "index.json"))) return dir;
  }
  throw new Error(
    `Quiztopia content dir not found; tried:\n${candidates.map((d) => `  ${d}`).join("\n")}\n` +
      `Set ${CONTENT_DIR_ENV} to the directory holding index.json.`,
  );
}

// ── Loading ────────────────────────────────────────────────────────────

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function loadContentStore(dir: string = resolveContentDir()): ContentStore {
  const index = ContentIndexSchema.parse(readJson(join(dir, "index.json")));
  const titles: Titles = TitlesSchema.parse(readJson(join(dir, "titles.json")));

  const cardIds = index.cards.map((c) => c.id);
  const cardsById = new Map<string, CardQuestions>();
  const questionsById = new Map<string, StoredQuestion>();
  const docs: SearchDoc[] = [];

  for (const id of cardIds) {
    const card = CardQuestionsSchema.parse(readJson(join(dir, "questions", `${id}.json`)));
    if (card.id !== id) throw new Error(`questions/${id}.json declares id ${card.id}`);
    cardsById.set(id, card);
    for (const set of card.sets) {
      const title = titles[set.id];
      if (!title) throw new Error(`titles.json is missing ${set.id}`);
      set.questions.forEach((q, qi) => {
        questionsById.set(q.id, {
          id: q.id,
          cardId: id,
          setId: set.id,
          n: set.n,
          q: qi,
          en: q.en,
          de: q.de,
          answerEn: q.answerEn,
          answerDe: q.answerDe,
          notes: set.notes,
        });
        docs.push({
          questionId: q.id,
          setId: set.id,
          cardId: id,
          category: set.n,
          original: qi === 0,
          question: { en: q.en, de: q.de },
          answer: { en: q.answerEn, de: q.answerDe },
          title: { en: title[0], de: title[1] },
        });
      });
    }
  }
  if (questionsById.size !== index.counts.questions) {
    throw new Error(
      `index.json counts ${index.counts.questions} questions, files hold ${questionsById.size}`,
    );
  }

  const searchIndex: SearchIndex = buildSearchIndex(docs);
  const byCategory = new Map<number, readonly string[]>();
  const deckRefs = new Map<QuiztopiaDeck, readonly string[]>();

  // Article files: a promise per card so concurrent readers share one
  // read; insertion order doubles as the eviction order.
  const articles = new Map<string, Promise<CardArticles>>();
  const loadArticles = (cardId: string): Promise<CardArticles> => {
    const cached = articles.get(cardId);
    if (cached) return cached;
    const pending = readFile(join(dir, "articles", `${cardId}.json`), "utf8")
      .then((raw) => CardArticlesSchema.parse(JSON.parse(raw)))
      .catch((err: unknown) => {
        articles.delete(cardId);
        throw err;
      });
    articles.set(cardId, pending);
    while (articles.size > ARTICLE_CACHE_SIZE) {
      const oldest = articles.keys().next().value;
      if (oldest === undefined) break;
      articles.delete(oldest);
    }
    return pending;
  };

  const getCard = (ref: string): QuestionCard | null => {
    const parsed = parseCardRef(ref);
    if (!parsed) return null;
    const card = cardsById.get(parsed.cardId);
    if (!card) return null;
    const sets: QuestionSet[] = card.sets.map((set, i) => {
      const q = set.questions[parsed.q];
      return {
        questionId: q.id,
        categoryIndex: i,
        en: q.en,
        de: q.de,
        answerEn: q.answerEn,
        answerDe: q.answerDe,
        notes: set.notes,
      };
    });
    return { ref, cardId: parsed.cardId, sets };
  };

  return {
    dir,
    version: index.version,
    categories: index.categories,
    cardIds,
    hasQuestion: (id) => questionsById.has(id),
    getQuestion: (id) => questionsById.get(id) ?? null,
    questionIdsByCategory: (n) => {
      if (!Number.isInteger(n) || n < 1 || n > SETS_PER_CARD) return [];
      let ids = byCategory.get(n);
      if (!ids) {
        ids = newIntroductionOrder(cardIds, n);
        byCategory.set(n, ids);
      }
      return ids;
    },
    getCardQuestions: (cardId) => cardsById.get(cardId) ?? null,
    getTitles: (setId) => titles[setId] ?? null,
    search: (opts) => runSearch(searchIndex, opts),
    getArticle: async (setId) => {
      const parsed = parseSetId(setId);
      if (!parsed || !cardsById.has(parsed.cardId)) return null;
      const file = await loadArticles(parsed.cardId);
      return file.sets[parsed.n - 1] ?? null;
    },
    listCardRefs: (deck) => {
      let refs = deckRefs.get(deck);
      if (!refs) {
        refs = deckCardRefs(cardIds, deck);
        deckRefs.set(deck, refs);
      }
      return refs;
    },
    getCard,
  };
}

/** Where a question id sits, without consulting the store (`null` when malformed). */
export function questionPosition(id: string): ReturnType<typeof parseQuestionId> {
  return parseQuestionId(id);
}

// ── Process-wide instance ──────────────────────────────────────────────

let current: ContentStore | null = null;

/** The memoised store, loading it from `resolveContentDir()` on first use. */
export function getContentStore(): ContentStore {
  if (!current) current = loadContentStore();
  return current;
}

/** The store if one has been loaded or installed; never loads. */
export function peekContentStore(): ContentStore | null {
  return current;
}

/** Test seam: install a fixture store (or `null` to force a reload). */
export function __setContentStore(store: ContentStore | null): void {
  current = store;
}
