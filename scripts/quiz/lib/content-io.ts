// Reading and writing the quiz bank under packages/core/src/quiz/content/.
// The article and source-card files are the source of truth; index, meta and
// timeline are always regenerated from them, and nothing is written while
// the bank has a problem.

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import {
  buildIndex,
  buildMeta,
  buildTimeline,
  contentProblems,
} from "../../../packages/core/src/quiz/build.ts";
import {
  type Article,
  ArticleSchema,
  type ContentMeta,
  ContentMetaSchema,
  type SourceCards,
  SourceCardsSchema,
} from "../../../packages/core/src/quiz/content-types.ts";

export const CONTENT_DIR = new URL("../../../packages/core/src/quiz/content/", import.meta.url)
  .pathname;

export interface Bank {
  articles: Article[];
  sources: SourceCards[];
}

export function readBank(dir = CONTENT_DIR): Bank {
  if (!existsSync(join(dir, "articles"))) return { articles: [], sources: [] };
  const articles = readdirSync(join(dir, "articles"))
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => ArticleSchema.parse(JSON.parse(readFileSync(join(dir, "articles", f), "utf8"))));
  const sources = readdirSync(join(dir, "sources"))
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => SourceCardsSchema.parse(JSON.parse(readFileSync(join(dir, "sources", f), "utf8"))));
  return { articles, sources };
}

/** Validate the whole bank, then rewrite every file. Throws (writing nothing) on a problem. */
export function writeBank(bank: Bank, dir = CONTENT_DIR): ContentMeta {
  const articles = bank.articles.map((a) => ArticleSchema.parse(a));
  const sources = bank.sources.map((s) => SourceCardsSchema.parse(s));
  const problems = contentProblems(articles, sources);
  if (problems.length > 0) {
    throw new Error(
      `quiz bank has ${problems.length} problems:\n${problems.slice(0, 40).join("\n")}`,
    );
  }
  // The sealed history root survives rebuilds (only `quiz-ingest seal` sets it).
  const meta = buildMeta(articles, sources, readMeta(dir)?.historyRoot);
  rmSync(join(dir, "articles"), { recursive: true, force: true });
  rmSync(join(dir, "sources"), { recursive: true, force: true });
  mkdirSync(join(dir, "articles"), { recursive: true });
  mkdirSync(join(dir, "sources"), { recursive: true });
  for (const a of articles) {
    writeFileSync(join(dir, "articles", `${a.id}.json`), `${JSON.stringify(a, null, 1)}\n`);
  }
  for (const s of sources) {
    writeFileSync(join(dir, "sources", `${s.source}.json`), `${JSON.stringify(s, null, 1)}\n`);
  }
  writeFileSync(join(dir, "index.json"), `${JSON.stringify(buildIndex(articles))}\n`);
  writeFileSync(join(dir, "timeline.json"), `${JSON.stringify(buildTimeline(articles))}\n`);
  writeFileSync(join(dir, "meta.json"), `${JSON.stringify(meta, null, 2)}\n`);
  return meta;
}

/** The current meta.json, or null when missing or unreadable. */
export function readMeta(dir = CONTENT_DIR): ContentMeta | null {
  const p = join(dir, "meta.json");
  if (!existsSync(p)) return null;
  const r = ContentMetaSchema.safeParse(JSON.parse(readFileSync(p, "utf8")));
  return r.success ? r.data : null;
}

export function writeMeta(meta: ContentMeta, dir = CONTENT_DIR): void {
  writeFileAtomic(
    join(dir, "meta.json"),
    `${JSON.stringify(ContentMetaSchema.parse(meta), null, 2)}\n`,
  );
}

/** Write via a temp file and a rename, so a reader never sees half a file. */
export function writeFileAtomic(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, text);
  renameSync(tmp, path);
}
