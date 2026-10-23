// Integrity of the committed quiz bank under `./content/`: every file
// re-validates against the shared shapes, the bank's cross-file invariants
// hold, and the generated files (index, meta, timeline) are exactly what the
// article and source-card files imply. Each file is parsed once, up front.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { buildIndex, buildMeta, buildTimeline, contentProblems } from "./build.ts";
import {
  type Article,
  ArticleSchema,
  ContentIndexSchema,
  ContentMetaSchema,
  type SourceCards,
  SourceCardsSchema,
  TimelineIndexSchema,
} from "./content-types.ts";
import { ArticleHistorySchema, chainProblems, historyProblems } from "./history.ts";
import { factIdFromLegacy } from "./ids.ts";
import { SOURCE_IDS } from "./sources.ts";
import { type TagRegistry, TagRegistrySchema } from "./tags.ts";

const DIR = fileURLToPath(new URL("./content/", import.meta.url));
const readJson = (rel: string): unknown => JSON.parse(readFileSync(`${DIR}${rel}`, "utf8"));

let articles: Article[];
let sources: SourceCards[];
let tags: TagRegistry | undefined;

beforeAll(() => {
  articles = readdirSync(`${DIR}articles`)
    .sort()
    .map((f) => ArticleSchema.parse(readJson(`articles/${f}`)));
  sources = readdirSync(`${DIR}sources`)
    .sort()
    .map((f) => SourceCardsSchema.parse(readJson(`sources/${f}`)));
  tags = existsSync(`${DIR}tags.json`) ? TagRegistrySchema.parse(readJson("tags.json")) : undefined;
});

describe("quiz bank", () => {
  it("has no cross-file problems", () => {
    expect(contentProblems(articles, sources, { tags })).toEqual([]);
  });

  // The tag registry: every game is a `source:` value, every stored tag fits it
  // (checked above through `contentProblems`).
  it("has a tag registry that names every source", () => {
    expect(tags).toBeDefined();
    const source = tags?.facets.find((f) => f.id === "source");
    expect(source?.values?.map((v) => v.id).sort()).toEqual([...SOURCE_IDS].sort());
  });

  // The finished bank: Russian everywhere, an image on every article, no
  // yes/no or pick-one question left.
  it("is complete", () => {
    expect(contentProblems(articles, sources, { complete: true })).toEqual([]);
  });

  // Every change to an article, fact or wording is logged (`history.ts`): an
  // entity whose content differs from its last history entry was edited
  // without a reason, and a history entry without its entity was deleted.
  it("logs every change in history/", () => {
    const problems = articles.flatMap((a) => {
      let raw: unknown;
      try {
        raw = readJson(`history/${a.id}.json`);
      } catch {
        return [`${a.id}: no history file`];
      }
      const history = ArticleHistorySchema.parse(raw);
      return [
        ...historyProblems(a, history),
        ...chainProblems(history).map((p) => `${a.id}: ${p}`),
      ];
    });
    expect(problems).toEqual([]);
  });

  it("keeps a history file only for articles that exist", () => {
    const ids = new Set(articles.map((a) => `${a.id}.json`));
    // `cards/` holds the printed cards' own histories, not an article's.
    expect(readdirSync(`${DIR}history`).filter((f) => f !== "cards" && !ids.has(f))).toEqual([]);
  });

  it("names every article file after its id", () => {
    const files = readdirSync(`${DIR}articles`).sort();
    expect(files).toEqual(articles.map((a) => `${a.id}.json`));
  });

  it("ships index, meta and timeline derived from the files", () => {
    expect(ContentIndexSchema.parse(readJson("index.json"))).toEqual(buildIndex(articles));
    // The history root is sealed by `quiz-ingest seal`, not derived from the articles.
    const meta = ContentMetaSchema.parse(readJson("meta.json"));
    expect(meta).toEqual(buildMeta(articles, sources, meta.historyRoot));
    expect(TimelineIndexSchema.parse(readJson("timeline.json"))).toEqual(buildTimeline(articles));
  });

  it("keeps every Quiztopia card's 12 printed questions", () => {
    const quiztopia = sources.find((s) => s.source === "quiztopia");
    expect(quiztopia?.cards).toHaveLength(177);
    expect(quiztopia?.cards[0]).toMatchObject({ id: "c001", image: "IMG20260910164837.jpg" });
  });

  // Members' progress was carried across by formula (migration 0061): the
  // fact a legacy question id maps to must still exist with that question.
  it("still holds the facts the legacy ids map to", () => {
    // A retired fact still counts: it is kept whole, so the id keeps resolving.
    const facts = new Map(
      articles.flatMap((a) => [...a.facts, ...(a.retired ?? [])].map((f) => [f.id, f] as const)),
    );
    for (const legacy of ["c001-s01-q0", "c042-s07-q3", "c177-s12-q4"]) {
      const id = factIdFromLegacy(legacy);
      expect(id && facts.has(id)).toBe(true);
    }
  });
});
