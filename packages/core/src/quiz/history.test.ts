import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { type Article, ArticleSchema, type SourceCards } from "./content-types.ts";
import {
  type ArticleHistory,
  applyTextDiff,
  articleEntities,
  type CardHistory,
  cardEntities,
  cardHistoryProblems,
  chainEntry,
  chainProblems,
  checkpointEntries,
  entityHash,
  entryChain,
  fieldChanges,
  type HistoryEntry,
  historyProblems,
  historyRoot,
  revertTextDiff,
  serializeHistory,
  stableStringify,
  textDiff,
} from "./history.ts";

const article: Article = {
  id: "a0001",
  domain: "history",
  sub: "ancient",
  titleEn: "T",
  titleDe: "T",
  bodyEn: "Rome was founded in 753 BC.",
  bodyDe: "Rom wurde 753 v. Chr. gegründet.",
  notesEn: "",
  notesDe: "",
  images: [],
  facts: [
    {
      id: "f00001",
      answerEn: "Rome",
      answerDe: "Rom",
      spans: { en: [0, 4], de: [0, 3] },
      timeline: {
        kind: "event",
        start: "-753",
        end: null,
        precision: "year",
        approx: true,
        ongoing: false,
        labelEn: "Rome founded",
        labelDe: "Rom gegründet",
      },
      source: { url: "https://en.wikipedia.org/wiki/Rome", title: "Rome", lang: "en" },
      wordings: [{ id: "w00001", en: "Which city?", de: "Welche Stadt?", origin: "generated" }],
    },
  ],
};

function sealed(a: Article): ArticleHistory {
  return {
    article: a.id,
    entries: articleEntities(a).map((e, i) => ({
      seq: i + 1,
      at: "2026-10-21",
      kind: "checkpoint" as const,
      target: { type: e.type, id: e.id },
      reason: "sealed",
      by: "test",
      hash: entityHash(e.fields),
    })),
  };
}

describe("text diffs", () => {
  it("round-trips forward and backward", () => {
    const a = "The quick brown fox jumps over the lazy dog. ".repeat(20);
    const b = `${a.replace("brown", "red").replace(/lazy/g, "sleepy")}And then it rained.`;
    const ops = textDiff(a, b);
    expect(applyTextDiff(a, ops)).toBe(b);
    expect(revertTextDiff(b, ops)).toBe(a);
  });

  it("handles empty and identical texts", () => {
    expect(applyTextDiff("", textDiff("", "new text"))).toBe("new text");
    expect(textDiff("same", "same")).toEqual([["=", 1]]);
  });
});

describe("field changes", () => {
  it("stores short values whole and long texts as diffs", () => {
    const long = "word ".repeat(80);
    const changes = fieldChanges(
      { answerEn: "Rome", bodyEn: long },
      { answerEn: "Roma", bodyEn: `${long}more` },
    );
    expect(changes[0]).toEqual({ field: "answerEn", old: "Rome", new: "Roma" });
    expect(changes[1].field).toBe("bodyEn");
    expect(changes[1].diff).toBeDefined();
  });
});

describe("historyProblems", () => {
  it("passes a sealed article and catches unlogged edits, missing and deleted entities", () => {
    const h = sealed(article);
    expect(historyProblems(article, h)).toEqual([]);
    const edited = structuredClone(article);
    edited.facts[0].answerEn = "Roma";
    expect(historyProblems(edited, h)).toContain("f00001: changed without a history entry");
    const grown = structuredClone(article);
    grown.facts[0].wordings.push({ id: "w00002", en: "Q2", de: "F2", origin: "generated" });
    expect(historyProblems(grown, h)).toContain("w00002: no history");
    const shrunk = structuredClone(grown);
    const h2 = sealed(grown);
    shrunk.facts[0].wordings.pop();
    expect(historyProblems(shrunk, h2)).toContain(
      "w00002: has history in a0001 but is no longer there",
    );
    expect(historyProblems(article, undefined)).toEqual(["a0001: no history file"]);
  });
});

describe("hashes stay put", () => {
  // Pinned before tags / entities / reviewBy / articleRetired joined the
  // hashed fields: an entity without them must hash exactly as it did.
  it("keeps the fixture's hashes", () => {
    expect(articleEntities(article).map((e) => [e.id, entityHash(e.fields)])).toEqual([
      ["a0001", "82cd66d5625c"],
      ["f00001", "825b51678dc4"],
      ["w00001", "5dcf38d14756"],
    ]);
  });

  // The same over real bank articles, against the field lists as they were.
  it("hashes bank articles as the pre-v2 field lists did", () => {
    const dir = fileURLToPath(new URL("./content/articles/", import.meta.url));
    const files = readdirSync(dir).sort();
    const legacyPick = (o: object, keys: string[]) => {
      const rec = o as Record<string, unknown>;
      return Object.fromEntries(keys.map((k) => [k, rec[k] ?? null]));
    };
    const ARTICLE =
      "domain sub titleEn titleDe titleRu bodyEn bodyDe bodyRu notesEn notesDe notesRu images";
    const FACT = "answerEn answerDe answerRu spans timeline source retired";
    for (const f of [files[0], files[Math.floor(files.length / 2)], files[files.length - 1]]) {
      const a = ArticleSchema.parse(JSON.parse(readFileSync(`${dir}${f}`, "utf8")));
      if (a.tags || a.entities || a.articleRetired) continue;
      const ents = articleEntities(a);
      expect(entityHash(ents[0].fields)).toBe(entityHash(legacyPick(a, ARTICLE.split(" "))));
      for (const fact of a.facts) {
        if (fact.tags || fact.entities || fact.reviewBy) continue;
        const ent = ents.find((e) => e.id === fact.id);
        expect(ent && entityHash(ent.fields)).toBe(entityHash(legacyPick(fact, FACT.split(" "))));
      }
    }
  });

  it("moves the hash once a new field is set", () => {
    const tagged = structuredClone(article);
    tagged.tags = ["region:it"];
    tagged.facts[0].reviewBy = "2030-01-01";
    const [a0, f0] = articleEntities(article);
    const [a1, f1] = articleEntities(tagged);
    expect(entityHash(a1.fields)).not.toBe(entityHash(a0.fields));
    expect(entityHash(f1.fields)).not.toBe(entityHash(f0.fields));
  });
});

const ACTOR = { kind: "script" as const, name: "test" };

describe("hash chain", () => {
  it("seals every entity with chained checkpoints", () => {
    const h: ArticleHistory = { article: "a0001", entries: [] };
    const cps = checkpointEntries(article, h, "2026-10-23", ACTOR, "seal-test");
    expect(cps.map((e) => e.target.id)).toEqual(["a0001", "f00001", "w00001"]);
    expect(cps.map((e) => e.seq)).toEqual([1, 2, 3]);
    expect(cps.every((e) => e.kind === "checkpoint" && e.run === "seal-test")).toBe(true);
    const sealedH = { article: "a0001", entries: cps };
    expect(chainProblems(sealedH)).toEqual([]);
    expect(historyProblems(article, sealedH)).toEqual([]);
    expect(cps[0].chain).toBe(entryChain(null, { ...cps[0], chain: undefined }));
    expect(cps[1].chain).toBe(entryChain(cps[0].chain ?? null, cps[1]));
  });

  it("may start after unchained backfill, but nothing unchained may follow", () => {
    const backfill = sealed(article);
    const cps = checkpointEntries(article, backfill, "2026-10-23", ACTOR);
    expect(cps[0].seq).toBe(backfill.entries.length + 1);
    const h = { article: "a0001", entries: [...backfill.entries, ...cps] };
    expect(chainProblems(h)).toEqual([]);
    const late: HistoryEntry = { ...backfill.entries[0], seq: 99 };
    expect(chainProblems({ entries: [...h.entries, late] })).toEqual([
      "seq 99: unchained entry after the chain started",
    ]);
  });

  it("detects a tampered entry and a broken link", () => {
    const cps = checkpointEntries(article, undefined, "2026-10-23", ACTOR);
    const tampered = cps.map((e) => ({ ...e }));
    tampered[1].reason = "edited later";
    expect(chainProblems({ entries: tampered })).toEqual(["seq 2: chain link broken"]);
    const dropped = [cps[0], cps[2]];
    expect(chainProblems({ entries: dropped })).toEqual(["seq 3: chain link broken"]);
  });

  it("chains over the entry without its own link, whatever the key order", () => {
    const e: HistoryEntry = { ...sealed(article).entries[0] };
    const shuffled = JSON.parse(JSON.stringify({ hash: e.hash, ...e })) as HistoryEntry;
    expect(entryChain("ab", e)).toBe(entryChain("ab", shuffled));
    expect(chainEntry("ab", e).chain).toMatch(/^[0-9a-f]{64}$/);
    expect(stableStringify({ b: 1, a: undefined })).toBe('{"b":1}');
  });
});

describe("historyRoot", () => {
  it("is order-independent and moves with any head", () => {
    const h1 = {
      article: "a0001",
      entries: checkpointEntries(article, undefined, "2026-10-23", ACTOR),
    };
    const h2 = sealed({ ...article, id: "a0002" });
    const cards: CardHistory = { source: "quiztopia", entries: [] };
    const root = historyRoot([h1, h2, cards]);
    expect(root).toMatch(/^[0-9a-f]{64}$/);
    expect(historyRoot([cards, h2, h1])).toBe(root);
    const h2b = {
      ...h2,
      entries: h2.entries.map((e, i) =>
        i === h2.entries.length - 1 ? { ...e, hash: "000000000000" } : e,
      ),
    };
    expect(historyRoot([h1, h2b, cards])).not.toBe(root);
    expect(historyRoot([])).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("card history", () => {
  const src: SourceCards = {
    source: "quiztopia",
    cards: [{ id: "c001", image: "x.jpg", slots: [{ category: 1, wordingId: "w00001" }] }],
  };
  const seal = (s: SourceCards): CardHistory => ({
    source: s.source,
    entries: cardEntities(s).map((e, i) => ({
      seq: i + 1,
      at: "2026-10-23",
      kind: "checkpoint" as const,
      target: { type: "card" as const, id: e.id },
      reason: "sealed",
      by: "test",
      hash: entityHash(e.fields),
    })),
  });

  it("tracks slot moves and serializes with its source", () => {
    const h = seal(src);
    expect(cardHistoryProblems(src, h, { strict: true })).toEqual([]);
    const moved = structuredClone(src);
    moved.cards[0].slots[0].wordingId = "w00002";
    expect(cardHistoryProblems(moved, h)).toEqual([
      "cards/quiztopia/c001: changed without a history entry",
    ]);
    expect(cardHistoryProblems(src, undefined)).toEqual([]);
    expect(cardHistoryProblems(src, undefined, { strict: true })).toEqual([
      "cards/quiztopia: no history file",
    ]);
    expect(serializeHistory(h).startsWith('{"source":"quiztopia","entries":[')).toBe(true);
  });
});

describe("article-retirement entries", () => {
  it("count as the article's own, not a deleted entity", () => {
    const h = sealed(article);
    h.entries.push({
      seq: h.entries.length + 1,
      at: "2026-10-23",
      kind: "retired",
      target: { type: "article-retirement", id: "a0001" },
      reason: "test",
      by: "test",
    });
    expect(historyProblems(article, h)).toEqual([]);
  });
});
