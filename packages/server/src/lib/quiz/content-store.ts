// The server's view of the quiz bank that ships in code under
// `packages/core/src/quiz/content/`. Read from the filesystem at boot: the
// index, the printed cards and every article file — validated through the
// shared Zod shapes, so a broken file fails the boot, not a request — keeping
// each fact's metadata and wordings in memory while the article bodies are
// dropped and re-read lazily behind a bounded cache. Nothing is bundled by
// tsup: the directory is resolved at runtime relative to this module (tsx
// dev and the dist layout differ) or overridden with `QUIZ_CONTENT_DIR`.
//
// The store implements the core `QuestionSource` seam so the Quiztopia table
// game draws its printed cards from it, and adds the trainer's lookups and
// the prebuilt search index.
//
// Only an article's ACTIVE facts (`article.facts`) enter the maps, the search
// index and the decks; retired facts (`article.retired`) stay in the article
// file for the record and reach a reader only through `getArticle` / the
// article history. A printed card slot whose wording now belongs to a retired
// fact is dealt as the first active fact that replaced it, and a card with a
// slot nothing replaced leaves the deck. Article histories
// (`history/<id>.json`) are read on demand, never at boot.
//
// A whole article out of play (`articleRetired`) is kept out of everything
// the trainer and the table game see — the article list, the fact map, search
// and the decks — so every count, queue and search skips it; only the admin
// quiz desk reads it (`retiredArticles`, `getArticle(id, { includeRetired })`).
// The desk's other inputs load here too: the tag registry (`tags.json`), the
// backlog (`backlog.jsonl`) and every retired fact / wording / article as a
// row (`retiredRows`), all at boot and all optional; evidence ledgers
// (`evidence/<id>.json`) are read lazily behind a bounded cache.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CARD_ID_RE,
  deckCardRefs,
  parseCardRef,
  type QuiztopiaDeck,
} from "@boardgames/core/games/quiztopia/ids";
import type {
  QuestionCard,
  QuestionSet,
  QuestionSource,
} from "@boardgames/core/games/quiztopia/question-source";
import type { QuizDeskRetiredRow } from "@boardgames/core/protocol/http/quiz-desk";
import { type BacklogItem, parseBacklog } from "@boardgames/core/quiz/backlog-types";
import type { DomainShape } from "@boardgames/core/quiz/build";
import type { DomainSlug } from "@boardgames/core/quiz/content-types";
import {
  type Article,
  type ArticleRetirement,
  ArticleSchema,
  ContentMetaSchema,
  type Fact,
  type IndexEntry,
  isActiveArticle,
  type PrintedRef,
  type SourceCards,
  SourceCardsSchema,
  type Wording,
} from "@boardgames/core/quiz/content-types";
import { type ArticleEvidence, ArticleEvidenceSchema } from "@boardgames/core/quiz/evidence-types";
import { type ArticleHistory, ArticleHistorySchema } from "@boardgames/core/quiz/history-schema";
import { MAX_FACTS_PER_ARTICLE } from "@boardgames/core/quiz/ids";
import {
  buildSearchIndex,
  runSearch,
  type SearchDoc,
  type SearchHit,
  type SearchIndex,
  type SearchLang,
} from "@boardgames/core/quiz/search";
import { sourceById } from "@boardgames/core/quiz/sources";
import { type TagRegistry, TagRegistrySchema } from "@boardgames/core/quiz/tags";
import { DOMAIN_SLUGS } from "@boardgames/core/quiz/taxonomy";
import { leadWording } from "@boardgames/core/quiz/wordings";

export const CONTENT_DIR_ENV = "QUIZ_CONTENT_DIR";
/** Article files kept in memory at once (≈ 12 KB each). */
export const ARTICLE_CACHE_SIZE = 64;
/** Evidence ledgers kept in memory at once. */
export const EVIDENCE_CACHE_SIZE = 64;

/** An article without its bodies: what every lookup needs. */
export type ArticleMeta = IndexEntry & { notesEn: string; notesDe: string; notesRu?: string };

export interface StoredFact {
  id: string;
  articleId: string;
  domain: DomainSlug;
  answerEn: string;
  answerDe: string;
  answerRu?: string;
  timeline: Fact["timeline"];
  source: Fact["source"];
  wordings: readonly Wording[];
  /** Some game prints a wording of this fact. */
  printed: boolean;
}

/** A whole article out of play: its meta (all its facts, as its file lists them) and why. */
export type RetiredArticleMeta = ArticleMeta & { retired: ArticleRetirement };

/** Where a fact or wording id lives (active, retired, or inside a retired article). */
export interface EntityPlace {
  articleId: string;
  /** The fact a wording belongs to; the fact itself for a fact id. */
  factId: string;
  kind: "fact" | "wording";
  /** Retired itself, or inside a retired article / fact. */
  retired: boolean;
  /** The lead question (a fact's first wording, the wording itself), English. */
  questionEn: string;
}

export interface ArticleReadOptions {
  /** Also read an article that is retired as a whole (the admin desk). */
  includeRetired?: boolean;
}

export interface SearchOptions {
  q: string;
  lang: SearchLang;
  limit: number;
  domain?: string;
}

export interface ContentStore extends QuestionSource {
  readonly dir: string;
  readonly version: string;
  /** Every article in id order. */
  readonly articles: readonly ArticleMeta[];
  hasFact(id: string): boolean;
  getFact(id: string): StoredFact | null;
  getArticleMeta(id: string): ArticleMeta | null;
  /** The wording a member with these sources sees: their highest-ranked printed one, else the first. */
  leadWording(fact: StoredFact, sources: readonly string[]): Wording;
  /** The printed cards of a source, in file order. */
  sourceCards(source: string): SourceCards["cards"];
  /** Which printed card each printed wording sits on. */
  printedOn(factId: string): { source: string; card: string; image: string }[];
  search(opts: SearchOptions): SearchHit[];
  /**
   * The whole article, bodies and all; null for an unknown id — and for an
   * article retired as a whole unless `includeRetired`.
   */
  getArticle(id: string, opts?: ArticleReadOptions): Promise<Article | null>;
  /**
   * The article's changelog, read from `history/<id>.json` on demand; null
   * for an unknown article (a retired one unless `includeRetired`), no
   * entries when it has no history file yet.
   */
  getHistory(id: string, opts?: ArticleReadOptions): Promise<ArticleHistory | null>;

  // ── Admin desk ──
  /** Articles retired as a whole, in id order (never in `articles`). */
  readonly retiredArticles: readonly RetiredArticleMeta[];
  /** An article's meta, active or retired as a whole. */
  getAnyArticleMeta(id: string): ArticleMeta | RetiredArticleMeta | null;
  /** Every retired fact, wording and article, in file order. */
  readonly retiredRows: readonly QuizDeskRetiredRow[];
  /** Where a fact or wording id lives, retired ones included. */
  locate(id: string): EntityPlace | null;
  /** The articles whose wordings a printed card's slots hold. */
  cardArticles(source: string, card: string): string[];
  /** Per domain: active articles, facts and articles of each size. */
  readonly domainShape: Readonly<Record<DomainSlug, DomainShape>>;
  /** `tags.json`; null when the bank has none. */
  readonly tagRegistry: TagRegistry | null;
  /** `backlog.jsonl`, in file order; empty when the bank has none. */
  readonly backlog: readonly BacklogItem[];
  /** Articles with an evidence ledger file, in id order. */
  readonly evidenceArticleIds: readonly string[];
  hasEvidence(articleId: string): boolean;
  /** The article's evidence ledger, read lazily; null without one. */
  getEvidence(articleId: string): Promise<ArticleEvidence | null>;
}

// ── Directory resolution ───────────────────────────────────────────────

const CONTENT_REL = "core/src/quiz/content";

/**
 * Candidate directories, in order: the env override, this module's
 * location under `packages/server/src/lib/quiz` (tsx dev) or
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
  if (override && !existsSync(join(candidates[0], "meta.json"))) {
    throw new Error(`${CONTENT_DIR_ENV}=${override} has no meta.json`);
  }
  for (const dir of candidates) {
    if (existsSync(join(dir, "meta.json"))) return dir;
  }
  throw new Error(
    `quiz content dir not found; tried:\n${candidates.map((d) => `  ${d}`).join("\n")}\n` +
      `Set ${CONTENT_DIR_ENV} to the directory holding meta.json.`,
  );
}

// ── Loading ────────────────────────────────────────────────────────────

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

function readOptional(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch (err) {
    if (isMissing(err)) return null;
    throw err;
  }
}

function isMissing(err: unknown): boolean {
  return err instanceof Error && "code" in err && err.code === "ENOENT";
}

function sourceRank(source: string): number {
  return sourceById(source)?.rank ?? Number.MAX_SAFE_INTEGER;
}

export function loadContentStore(dir: string = resolveContentDir()): ContentStore {
  const meta = ContentMetaSchema.parse(readJson(join(dir, "meta.json")));
  const sources = new Map<string, SourceCards>();
  for (const file of readdirSync(join(dir, "sources")).sort()) {
    const s = SourceCardsSchema.parse(readJson(join(dir, "sources", file)));
    sources.set(s.source, s);
  }

  const articles: ArticleMeta[] = [];
  const articlesById = new Map<string, ArticleMeta>();
  const retiredArticles: RetiredArticleMeta[] = [];
  const retiredArticlesById = new Map<string, RetiredArticleMeta>();
  const retiredRows: QuizDeskRetiredRow[] = [];
  const places = new Map<string, EntityPlace>();
  const shape = {} as Record<DomainSlug, DomainShape>;
  for (const d of DOMAIN_SLUGS) {
    shape[d] = { articles: 0, facts: 0, byFactCount: Array(MAX_FACTS_PER_ARTICLE + 1).fill(0) };
  }
  const factsById = new Map<string, StoredFact>();
  const factOfWording = new Map<string, string>();
  /** Wordings of retired facts → the active facts that replaced it (maybe none). */
  const retiredWordings = new Map<string, readonly string[]>();
  const docs: SearchDoc[] = [];
  for (const file of readdirSync(join(dir, "articles")).sort()) {
    const a = ArticleSchema.parse(readJson(join(dir, "articles", file)));
    recordForDesk(a, retiredRows, places);
    if (!isActiveArticle(a)) {
      const retired = a.articleRetired;
      if (!retired) continue;
      const entry: RetiredArticleMeta = { ...articleMeta(a, []), retired };
      retiredArticles.push(entry);
      retiredArticlesById.set(a.id, entry);
      continue;
    }
    const domainShape = shape[a.domain];
    if (domainShape) {
      domainShape.articles++;
      domainShape.facts += a.facts.length;
      domainShape.byFactCount[Math.min(a.facts.length, MAX_FACTS_PER_ARTICLE)]++;
    }
    const printedSources = new Set<string>();
    for (const f of a.facts) {
      const printed = f.wordings.some((w) => w.origin === "printed");
      for (const w of f.wordings) {
        factOfWording.set(w.id, f.id);
        if (w.printed) printedSources.add(w.printed.source);
      }
      // A retired wording still names its fact (an old report, a journal row).
      for (const w of f.retiredWordings ?? []) factOfWording.set(w.id, f.id);
      const stored: StoredFact = {
        id: f.id,
        articleId: a.id,
        domain: a.domain,
        answerEn: f.answerEn,
        answerDe: f.answerDe,
        ...(f.answerRu ? { answerRu: f.answerRu } : {}),
        timeline: f.timeline,
        source: f.source,
        wordings: f.wordings,
        printed,
      };
      factsById.set(f.id, stored);
      const lead = f.wordings[0];
      docs.push({
        factId: f.id,
        articleId: a.id,
        domain: a.domain,
        printed,
        question: { en: lead.en, de: lead.de, ru: lead.ru },
        answer: { en: f.answerEn, de: f.answerDe, ru: f.answerRu },
        title: { en: a.titleEn, de: a.titleDe, ru: a.titleRu },
      });
    }
    for (const f of a.retired ?? []) {
      for (const w of f.wordings) retiredWordings.set(w.id, f.retired.replacedBy ?? []);
    }
    const entry = articleMeta(a, [...printedSources]);
    articles.push(entry);
    articlesById.set(a.id, entry);
  }
  if (factsById.size !== meta.counts.facts || articles.length !== meta.counts.articles) {
    throw new Error(
      `meta.json counts ${meta.counts.articles} articles / ${meta.counts.facts} facts, files hold ${articles.length} / ${factsById.size}`,
    );
  }

  const searchIndex: SearchIndex = buildSearchIndex(docs);

  // ── The desk's optional inputs ──
  const tagsRaw = readOptional(join(dir, "tags.json"));
  const tagRegistry = tagsRaw === null ? null : TagRegistrySchema.parse(JSON.parse(tagsRaw));
  const backlogRaw = readOptional(join(dir, "backlog.jsonl"));
  const backlog = backlogRaw === null ? [] : parseBacklog(backlogRaw);
  const evidenceDir = join(dir, "evidence");
  const evidenceArticleIds = existsSync(evidenceDir)
    ? readdirSync(evidenceDir)
        .filter((f) => /^a\d{4,}\.json$/.test(f))
        .map((f) => f.slice(0, -5))
        .sort()
    : [];
  const evidenceIds = new Set(evidenceArticleIds);
  const ledgers = new Map<string, Promise<ArticleEvidence | null>>();
  const getEvidence = (id: string): Promise<ArticleEvidence | null> => {
    if (!evidenceIds.has(id)) return Promise.resolve(null);
    const cached = ledgers.get(id);
    if (cached) return cached;
    const pending = readFile(join(evidenceDir, `${id}.json`), "utf8")
      .then((raw) => ArticleEvidenceSchema.parse(JSON.parse(raw)))
      .catch((err: unknown) => {
        ledgers.delete(id);
        if (isMissing(err)) return null;
        throw err;
      });
    ledgers.set(id, pending);
    while (ledgers.size > EVIDENCE_CACHE_SIZE) {
      const oldest = ledgers.keys().next().value;
      if (oldest === undefined) break;
      ledgers.delete(oldest);
    }
    return pending;
  };
  const known = (id: string, opts?: ArticleReadOptions) =>
    articlesById.has(id) || (opts?.includeRetired === true && retiredArticlesById.has(id));

  // Article bodies: a promise per article so concurrent readers share one
  // read; insertion order doubles as the eviction order.
  const bodies = new Map<string, Promise<Article>>();
  const loadArticle = (id: string): Promise<Article> => {
    const cached = bodies.get(id);
    if (cached) return cached;
    const pending = readFile(join(dir, "articles", `${id}.json`), "utf8")
      .then((raw) => ArticleSchema.parse(JSON.parse(raw)))
      .catch((err: unknown) => {
        bodies.delete(id);
        throw err;
      });
    bodies.set(id, pending);
    while (bodies.size > ARTICLE_CACHE_SIZE) {
      const oldest = bodies.keys().next().value;
      if (oldest === undefined) break;
      bodies.delete(oldest);
    }
    return pending;
  };

  // ── The Quiztopia table game's deck ──
  const quiztopia = sources.get("quiztopia")?.cards ?? [];
  const quiztopiaCards = new Map(quiztopia.map((c) => [c.id, c]));

  /**
   * The fact a printed slot deals and the wording it asks: the printed one
   * while its fact is active; for a retired fact's wording, the first active
   * fact that replaced it (its Quiztopia wording, else its first); else null.
   */
  const slotQuestion = (wordingId: string): { fact: StoredFact; wording: Wording } | null => {
    const active = factsById.get(factOfWording.get(wordingId) ?? "");
    if (active) {
      const wording = active.wordings.find((w) => w.id === wordingId) ?? active.wordings[0];
      return { fact: active, wording };
    }
    for (const id of retiredWordings.get(wordingId) ?? []) {
      const fact = factsById.get(id);
      if (!fact) continue;
      const wording =
        fact.wordings.find((w) => w.printed?.source === "quiztopia") ?? fact.wordings[0];
      return { fact, wording };
    }
    return null;
  };

  const quiztopiaIds = quiztopia
    .filter((c) => CARD_ID_RE.test(c.id) && c.slots.every((s) => slotQuestion(s.wordingId)))
    .map((c) => c.id);
  const deckRefs = new Map<QuiztopiaDeck, readonly string[]>();

  const toSet = (fact: StoredFact, wording: Wording, categoryIndex: number): QuestionSet => {
    const art = articlesById.get(fact.articleId);
    return {
      questionId: fact.id,
      categoryIndex,
      en: wording.en,
      de: wording.de,
      answerEn: fact.answerEn,
      answerDe: fact.answerDe,
      notesEn: art?.notesEn ?? "",
      notesDe: art?.notesDe ?? "",
    };
  };

  const getCard = (ref: string): QuestionCard | null => {
    const parsed = parseCardRef(ref);
    if (!parsed) return null;
    const card = quiztopiaCards.get(parsed.cardId);
    if (!card) return null;
    const sets: QuestionSet[] = [];
    for (const [i, slot] of card.slots.entries()) {
      const resolved = slotQuestion(slot.wordingId);
      if (!resolved) return null;
      const { fact, wording: printed } = resolved;
      if (parsed.k === 0) {
        sets.push(toSet(fact, printed, i));
        continue;
      }
      // A virtual card asks the k-th fact of the slot's article no game
      // prints; an article with fewer falls back to the printed question.
      const unprinted = (articlesById.get(fact.articleId)?.factIds ?? [])
        .map((id) => factsById.get(id))
        .filter((f): f is StoredFact => f !== undefined && !f.printed);
      const pick = unprinted[parsed.k - 1];
      sets.push(pick ? toSet(pick, pick.wordings[0], i) : toSet(fact, printed, i));
    }
    return { ref, cardId: parsed.cardId, sets };
  };

  return {
    dir,
    version: meta.version,
    articles,
    hasFact: (id) => factsById.has(id),
    getFact: (id) => factsById.get(id) ?? null,
    getArticleMeta: (id) => articlesById.get(id) ?? null,
    leadWording: (fact, enabled) => leadWording(fact.wordings, enabled),
    sourceCards: (source) => sources.get(source)?.cards ?? [],
    printedOn: (factId) => {
      const fact = factsById.get(factId);
      if (!fact) return [];
      const out: { source: string; card: string; image: string }[] = [];
      for (const w of fact.wordings) {
        if (!w.printed) continue;
        const card = sources.get(w.printed.source)?.cards.find((c) => c.id === w.printed?.card);
        if (card) out.push({ source: w.printed.source, card: card.id, image: card.image });
      }
      return out;
    },
    search: (opts) => runSearch(searchIndex, opts),
    getArticle: async (id, opts) => (known(id, opts) ? loadArticle(id) : null),
    getHistory: async (id, opts) => {
      if (!known(id, opts)) return null;
      let raw: string;
      try {
        raw = await readFile(join(dir, "history", `${id}.json`), "utf8");
      } catch (err) {
        if (isMissing(err)) return { article: id, entries: [] };
        throw err;
      }
      return ArticleHistorySchema.parse(JSON.parse(raw));
    },
    retiredArticles,
    getAnyArticleMeta: (id) => articlesById.get(id) ?? retiredArticlesById.get(id) ?? null,
    retiredRows,
    locate: (id) => places.get(id) ?? null,
    cardArticles: (source, cardId) => {
      const card = sources.get(source)?.cards.find((c) => c.id === cardId);
      if (!card) return [];
      const out = new Set<string>();
      for (const slot of card.slots) {
        const place = places.get(slot.wordingId);
        if (place) out.add(place.articleId);
      }
      return [...out];
    },
    domainShape: shape,
    tagRegistry,
    backlog,
    evidenceArticleIds,
    hasEvidence: (id) => evidenceIds.has(id),
    getEvidence,
    listCardRefs: (deck) => {
      let refs = deckRefs.get(deck);
      if (!refs) {
        refs = deckCardRefs(quiztopiaIds, deck);
        deckRefs.set(deck, refs);
      }
      return refs;
    },
    getCard,
  };
}

// ── Helpers ────────────────────────────────────────────────────────────

function articleMeta(a: Article, printedSources: readonly string[]): ArticleMeta {
  return {
    id: a.id,
    domain: a.domain,
    sub: a.sub,
    titleEn: a.titleEn,
    titleDe: a.titleDe,
    ...(a.titleRu ? { titleRu: a.titleRu } : {}),
    factIds: a.facts.map((f) => f.id),
    sources: [...printedSources].sort((x, y) => sourceRank(x) - sourceRank(y)),
    notesEn: a.notesEn,
    notesDe: a.notesDe,
    ...(a.notesRu !== undefined ? { notesRu: a.notesRu } : {}),
  };
}

const firstPrinted = (wordings: readonly { printed?: PrintedRef }[]): PrintedRef | undefined =>
  wordings.find((w) => w.printed)?.printed;

/**
 * Every fact and wording id → where it lives, and every retired fact, wording
 * and article → a desk row. Facts inside a retired article are not rows of
 * their own (the article's row stands for them) unless retired themselves.
 */
function recordForDesk(
  a: Article,
  rows: QuizDeskRetiredRow[],
  places: Map<string, EntityPlace>,
): void {
  const articleOut = !isActiveArticle(a);
  const base = {
    articleId: a.id,
    articleTitle: { en: a.titleEn, de: a.titleDe },
    domain: a.domain,
    inRetiredArticle: articleOut,
  };
  if (a.articleRetired) {
    const r = a.articleRetired;
    rows.push({
      ...base,
      kind: "article",
      id: a.id,
      question: null,
      answer: null,
      at: r.at,
      code: r.code,
      reason: r.reason,
      ...(r.replacedBy ? { replacedBy: r.replacedBy } : {}),
      inRetiredArticle: false,
    });
  }
  const place = (
    factId: string,
    wordings: readonly Wording[],
    retiredWordings: readonly Wording[],
    retired: boolean,
  ) => {
    const lead = wordings[0] ?? retiredWordings[0];
    places.set(factId, {
      articleId: a.id,
      factId,
      kind: "fact",
      retired,
      questionEn: lead?.en ?? "",
    });
    for (const w of wordings) {
      places.set(w.id, { articleId: a.id, factId, kind: "wording", retired, questionEn: w.en });
    }
    for (const w of retiredWordings) {
      places.set(w.id, {
        articleId: a.id,
        factId,
        kind: "wording",
        retired: true,
        questionEn: w.en,
      });
    }
  };
  for (const f of a.facts) {
    place(f.id, f.wordings, f.retiredWordings ?? [], articleOut);
    for (const w of f.retiredWordings ?? []) {
      rows.push({
        ...base,
        kind: "wording",
        id: w.id,
        question: { en: w.en, de: w.de },
        answer: { en: f.answerEn, de: f.answerDe },
        at: w.retired.at,
        ...(w.retired.code ? { code: w.retired.code } : {}),
        reason: w.retired.reason,
        ...(w.retired.replacedBy ? { replacedBy: w.retired.replacedBy } : {}),
        ...(w.printed ? { printed: w.printed } : {}),
      });
    }
  }
  for (const f of a.retired ?? []) {
    place(f.id, f.wordings, f.retiredWordings ?? [], true);
    const lead = f.wordings[0];
    const printed = firstPrinted([...f.wordings, ...(f.retiredWordings ?? [])]);
    rows.push({
      ...base,
      kind: "fact",
      id: f.id,
      question: { en: lead.en, de: lead.de },
      answer: { en: f.answerEn, de: f.answerDe },
      at: f.retired.at,
      ...(f.retired.code ? { code: f.retired.code } : {}),
      reason: f.retired.reason,
      ...(f.retired.replacedBy ? { replacedBy: f.retired.replacedBy } : {}),
      ...(printed ? { printed } : {}),
    });
  }
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
