// Question and article content, loaded as CDN chunks. The 18 MB of JSON under
// packages/core/src/games/quiztopia/content/ never enters the main bundle:
// `index.json` is tiny and eager, every card file is a lazy chunk fetched
// the first time a screen needs it. The server reads the same files from
// disk (`lib/quiztopia/content-store.ts`) — one source of truth, two paths.
//
// These loaders are deliberately UNCACHED: React Query (`hooks/useContent.ts`)
// is the one cache, so a failed chunk is retried rather than remembered, and
// a successful `import()` is memoised by the browser's module map anyway. A
// chunk that 404s because a deploy rotated its hash is handled globally by
// `lib/stale-chunk-reload.ts`.

import type {
  AnswerSpan,
  CardArticles,
  CardQuestions,
  ContentIndex,
  ContentSetArticle,
  TimelineIndex,
  Titles,
} from "@boardgames/core/games/quiztopia/content-types";
import { parseQuestionId, parseSetId } from "@boardgames/core/games/quiztopia/ids";
import index from "../../../../core/src/games/quiztopia/content/index.json" with { type: "json" };

export const CONTENT_INDEX = index as ContentIndex;
export const CONTENT_VERSION = CONTENT_INDEX.version;
export const CARD_IDS: readonly string[] = CONTENT_INDEX.cards.map((c) => c.id);

type ChunkLoader<T> = () => Promise<{ default: T }>;

/** `…/questions/c042.json` → `c042`, so a lookup is a map hit, not a scan. */
function byCardId<T>(glob: Record<string, ChunkLoader<T>>): ReadonlyMap<string, ChunkLoader<T>> {
  const out = new Map<string, ChunkLoader<T>>();
  for (const [path, loader] of Object.entries(glob)) {
    const file = path.slice(path.lastIndexOf("/") + 1);
    out.set(file.replace(/\.json$/, ""), loader);
  }
  return out;
}

const questionChunks = byCardId(
  import.meta.glob<{ default: CardQuestions }>(
    "../../../../core/src/games/quiztopia/content/questions/*.json",
  ),
);
const articleChunks = byCardId(
  import.meta.glob<{ default: CardArticles }>(
    "../../../../core/src/games/quiztopia/content/articles/*.json",
  ),
);

async function loadCardChunk<T>(
  chunks: ReadonlyMap<string, ChunkLoader<T>>,
  cardId: string,
): Promise<T> {
  const loader = chunks.get(cardId);
  if (!loader) throw new Error(`unknown quiztopia card: ${cardId}`);
  return (await loader()).default;
}

export function loadQuestions(cardId: string): Promise<CardQuestions> {
  return loadCardChunk(questionChunks, cardId);
}

export function loadArticles(cardId: string): Promise<CardArticles> {
  return loadCardChunk(articleChunks, cardId);
}

// A single-file glob rather than a dynamic `import(…, { with: { type: "json" } })`:
// Vite serves the chunk as a JS module and the browser would reject the JSON
// import attribute on it in dev.
const titlesChunk = import.meta.glob<{ default: Titles }>(
  "../../../../core/src/games/quiztopia/content/titles.json",
);

export async function loadTitles(): Promise<Titles> {
  const loader = Object.values(titlesChunk)[0];
  if (!loader) throw new Error("quiztopia titles.json missing");
  return (await loader()).default;
}

// Every question's timeline event in one lazy chunk (≈ 2 MB of JSON, only
// fetched by the timeline screen and the pin chips — the hub's teaser reads
// the server's pin summary instead). Content from before the enrichment pass
// has no `timeline.json`: the glob is then empty and the index resolves to
// `{}`, so every screen degrades to "no dates".
const timelineChunk = import.meta.glob<{ default: TimelineIndex }>(
  "../../../../core/src/games/quiztopia/content/timeline.json",
);

export async function loadTimeline(): Promise<TimelineIndex> {
  const loader = Object.values(timelineChunk)[0];
  return loader ? (await loader()).default : {};
}

/** One question with its set context, from an already-loaded card. */
export function findQuestion(card: CardQuestions, questionId: string) {
  const parsed = parseQuestionId(questionId);
  if (!parsed) return null;
  const set = card.sets[parsed.n - 1];
  const question = set?.questions[parsed.q];
  if (!set || !question) return null;
  return { set, question, q: parsed.q };
}

export function findArticle(card: CardArticles, setId: string): ContentSetArticle | null {
  const parsed = parseSetId(setId);
  if (!parsed) return null;
  return card.sets[parsed.n - 1] ?? null;
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
