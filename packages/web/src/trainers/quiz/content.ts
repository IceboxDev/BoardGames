// The quiz bank, loaded as CDN chunks. The ≈ 27 MB of JSON under
// packages/core/src/quiz/content/ never enters the main bundle: `meta.json`
// is tiny and eager, the index and the timeline are one lazy chunk each, and
// every article file is its own lazy chunk fetched the first time a screen
// needs it. The server reads the same files from disk
// (`lib/quiz/content-store.ts`) — one source of truth, two paths.
//
// These loaders are deliberately UNCACHED: React Query (`hooks/useContent.ts`)
// is the one cache, so a failed chunk is retried rather than remembered, and
// a successful `import()` is memoised by the browser's module map anyway. A
// chunk that 404s because a deploy rotated its hash is handled globally by
// `lib/stale-chunk-reload.ts`.

import type {
  AnswerSpan,
  Article,
  ContentIndex,
  ContentMeta,
  Fact,
  IndexEntry,
  TimelineIndex,
} from "@boardgames/core/quiz/content-types";
import meta from "../../../../core/src/quiz/content/meta.json" with { type: "json" };

export const CONTENT_META = meta as ContentMeta;
export const CONTENT_VERSION = CONTENT_META.version;

type ChunkLoader<T> = () => Promise<{ default: T }>;

/** `…/articles/a0042.json` → `a0042`, so a lookup is a map hit, not a scan. */
function byFileId<T>(glob: Record<string, ChunkLoader<T>>): ReadonlyMap<string, ChunkLoader<T>> {
  const out = new Map<string, ChunkLoader<T>>();
  for (const [path, loader] of Object.entries(glob)) {
    const file = path.slice(path.lastIndexOf("/") + 1);
    out.set(file.replace(/\.json$/, ""), loader);
  }
  return out;
}

const articleChunks = byFileId(
  import.meta.glob<{ default: Article }>("../../../../core/src/quiz/content/articles/*.json"),
);

export async function loadArticle(id: string): Promise<Article> {
  const loader = articleChunks.get(id);
  if (!loader) throw new Error(`unknown quiz article: ${id}`);
  return (await loader()).default;
}

// Single-file globs rather than a dynamic `import(…, { with: { type: "json" } })`:
// Vite serves the chunk as a JS module and the browser would reject the JSON
// import attribute on it in dev.
const indexChunk = import.meta.glob<{ default: ContentIndex }>(
  "../../../../core/src/quiz/content/index.json",
);
const timelineChunk = import.meta.glob<{ default: TimelineIndex }>(
  "../../../../core/src/quiz/content/timeline.json",
);

/** The bank's index plus the lookups every screen needs. */
export interface QuizIndex {
  articles: readonly IndexEntry[];
  article: (id: string) => IndexEntry | undefined;
  /** The article a fact belongs to. */
  articleOf: (factId: string) => IndexEntry | undefined;
}

export async function loadIndex(): Promise<QuizIndex> {
  const loader = Object.values(indexChunk)[0];
  if (!loader) throw new Error("quiz index.json missing");
  const { articles } = (await loader()).default;
  const byId = new Map(articles.map((a) => [a.id, a]));
  const byFact = new Map(articles.flatMap((a) => a.factIds.map((f) => [f, a] as const)));
  return { articles, article: (id) => byId.get(id), articleOf: (id) => byFact.get(id) };
}

/** Every fact's timeline event in one lazy chunk (≈ 2 MB of JSON). */
export async function loadTimeline(): Promise<TimelineIndex> {
  const loader = Object.values(timelineChunk)[0];
  return loader ? (await loader()).default : {};
}

/**
 * An article's body in `lang` and where each fact's answer sits in it —
 * the English text while the article has no Russian yet, so a Russian reader
 * still gets a marked, readable page.
 */
export function bodyIn(
  article: Article,
  lang: "en" | "de" | "ru",
): { lang: "en" | "de" | "ru"; body: string; spans: (AnswerSpan | null)[] } {
  const use = lang === "ru" && !article.bodyRu ? "en" : lang;
  const body =
    use === "de" ? article.bodyDe : use === "ru" ? (article.bodyRu ?? "") : article.bodyEn;
  return { lang: use, body, spans: article.facts.map((f) => f.spans[use] ?? null) };
}

/** One fact of an already-loaded article, with its position. */
export function findFact(article: Article, factId: string): { fact: Fact; index: number } | null {
  const index = article.facts.findIndex((f) => f.id === factId);
  const fact = article.facts[index];
  return fact ? { fact, index } : null;
}

export interface Snippet {
  before: string;
  match: string;
  after: string;
}

const SENTENCE_END = /[.!?]["“”»]?\s/g;

/**
 * The sentence(s) around an answer span, trimmed to roughly `radius`
 * characters each side and cut at sentence boundaries where possible.
 */
export function articleSnippet(article: string, span: AnswerSpan, radius = 160): Snippet {
  const [start, len] = span;
  const end = start + len;
  let from = Math.max(0, start - radius);
  let to = Math.min(article.length, end + radius);
  // Prefer a sentence start after `from`…
  const head = article.slice(from, start);
  let lastEnd = -1;
  for (const m of head.matchAll(SENTENCE_END)) lastEnd = m.index + m[0].length;
  if (lastEnd >= 0) from += lastEnd;
  const nl = article.lastIndexOf("\n", start);
  if (nl >= from) from = nl + 1;
  // …and a sentence end before `to`.
  const tail = article.slice(end, to);
  const firstEnd = SENTENCE_END.exec(tail);
  SENTENCE_END.lastIndex = 0;
  if (firstEnd) to = end + firstEnd.index + 1;
  const nl2 = article.indexOf("\n", end);
  if (nl2 >= 0 && nl2 < to) to = nl2;
  return {
    before: article.slice(from, start).trimStart(),
    match: article.slice(start, end),
    after: article.slice(end, to).trimEnd(),
  };
}
