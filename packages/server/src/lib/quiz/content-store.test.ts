// The content store over the fixture bank (the first two Quiztopia cards:
// 24 articles, 120 facts): directory resolution, the QuestionSource view the
// table game draws from, the trainer lookups, search and the lazy article
// cache.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const fsMock = vi.hoisted(() => ({ readFile: vi.fn() }));
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  fsMock.readFile.mockImplementation(actual.readFile);
  return { ...actual, readFile: fsMock.readFile };
});

const {
  __setContentStore,
  ARTICLE_CACHE_SIZE,
  CONTENT_DIR_ENV,
  contentDirCandidates,
  getContentStore,
  loadContentStore,
  peekContentStore,
  resolveContentDir,
} = await import("./content-store.ts");

const { FIXTURE_HISTORY, makeDeskBank, makeRetiredBank } = await import(
  "./__fixtures__/retired-bank.ts"
);
const { eligibleArticles } = await import("./stats.ts");
const { QuizSettingsSchema } = await import("@boardgames/core/protocol");

const FIXTURE_DIR = fileURLToPath(new URL("./__fixtures__/content/", import.meta.url));

describe("resolveContentDir", () => {
  it("prefers the env override and rejects one without a meta.json", () => {
    expect(resolveContentDir({ [CONTENT_DIR_ENV]: FIXTURE_DIR })).toBe(
      FIXTURE_DIR.replace(/\/$/, ""),
    );
    expect(() => resolveContentDir({ [CONTENT_DIR_ENV]: "/nowhere/at/all" })).toThrow(
      new RegExp(`${CONTENT_DIR_ENV}=/nowhere/at/all has no meta.json`),
    );
  });

  it("finds the core content dir relative to this module in the source layout", () => {
    const dir = resolveContentDir({});
    expect(dir.endsWith(join("packages", "core", "src", "quiz", "content"))).toBe(true);
    expect(dir).toBe(contentDirCandidates({})[0]);
  });

  it("lists every candidate in its error", () => {
    const candidates = contentDirCandidates({ [CONTENT_DIR_ENV]: "/tmp/does-not-exist-quiz" });
    expect(candidates).toHaveLength(5);
    expect(candidates[0]).toBe("/tmp/does-not-exist-quiz");
    expect(candidates.slice(1).every((c) => c.endsWith("core/src/quiz/content"))).toBe(true);
  });
});

describe("loadContentStore (fixture)", () => {
  let store: ReturnType<typeof loadContentStore>;
  beforeAll(() => {
    store = loadContentStore(FIXTURE_DIR);
  });

  it("exposes the version and every article in id order", () => {
    const meta = JSON.parse(readFileSync(join(FIXTURE_DIR, "meta.json"), "utf8")) as {
      version: string;
    };
    expect(store.version).toBe(meta.version);
    expect(store.dir).toBe(FIXTURE_DIR);
    expect(store.articles).toHaveLength(24);
    expect(store.articles[0]).toMatchObject({
      id: "a0001",
      domain: "music-stage",
      titleEn: "Two Germanys, Two Anthems, and a Children's Hymn",
      factIds: ["f00001", "f00002", "f00003", "f00004", "f00005"],
      sources: ["quiztopia"],
      notesEn: "",
    });
    expect(store.articles.map((a) => a.id)).toEqual(
      Array.from({ length: 24 }, (_, i) => `a${String(i + 1).padStart(4, "0")}`),
    );
  });

  it("resolves a printed card ref into its twelve printed questions", () => {
    const card = store.getCard("c001");
    expect(card).not.toBeNull();
    if (!card) return;
    expect(card.ref).toBe("c001");
    expect(card.cardId).toBe("c001");
    expect(card.sets).toHaveLength(12);
    card.sets.forEach((set, i) => {
      expect(set.categoryIndex).toBe(i);
      expect(set.questionId).toBe(`f${String(i * 5 + 1).padStart(5, "0")}`);
      expect(typeof set.notesEn).toBe("string");
      expect(set.en.length).toBeGreaterThan(0);
      expect(set.answerDe.length).toBeGreaterThan(0);
    });
    expect(card.sets[0].answerEn).toBe("Bertolt Brecht");
    expect(store.getCard("c002")?.sets[0].questionId).toBe("f00061");
  });

  it("resolves a virtual card ref into the k-th unprinted fact of every slot's article", () => {
    const card = store.getCard("c001-v2");
    expect(card?.ref).toBe("c001-v2");
    expect(card?.cardId).toBe("c001");
    expect(card?.sets.map((s) => s.questionId)).toEqual(
      Array.from({ length: 12 }, (_, i) => `f${String(i * 5 + 3).padStart(5, "0")}`),
    );
    expect(card?.sets[0].en).toBe(store.getFact("f00003")?.wordings[0].en);
    expect(card?.sets[0].answerEn).toBe("Joseph Haydn");
    expect(store.getCard("c003")).toBeNull();
    expect(store.getCard("c001-v5")).toBeNull();
    expect(store.getCard("nope")).toBeNull();
  });

  it("lists deck refs, cached per deck", () => {
    expect(store.listCardRefs("original")).toEqual(["c001", "c002"]);
    const extended = store.listCardRefs("extended");
    expect(extended).toHaveLength(10);
    expect(extended).toContain("c002-v4");
    expect(store.listCardRefs("extended")).toBe(extended);
  });

  it("looks facts and articles up by id", () => {
    expect(store.hasFact("f00001")).toBe(true);
    expect(store.hasFact("f00121")).toBe(false);
    expect(store.hasFact("garbage")).toBe(false);
    expect(store.getFact("f00001")).toMatchObject({
      id: "f00001",
      articleId: "a0001",
      domain: "music-stage",
      answerEn: "Bertolt Brecht",
      answerDe: "Bertolt Brecht",
      printed: true,
    });
    expect(store.getFact("f00002")?.printed).toBe(false);
    expect(store.getFact("f00120")?.articleId).toBe("a0024");
    expect(store.getFact("f00121")).toBeNull();
    expect(store.getArticleMeta("a0013")?.titleEn).toBe(
      "Colour Film Forgotten: Nina Hagen and the Neue Deutsche Welle",
    );
    expect(store.getArticleMeta("a0025")).toBeNull();
  });

  it("picks the wording of the member's best-ranked source, else the first", () => {
    const fact = store.getFact("f00001");
    if (!fact) throw new Error("fixture");
    expect(store.leadWording(fact, ["quiztopia"]).id).toBe("w00001");
    expect(store.leadWording(fact, ["trivial-pursuit"]).id).toBe("w00001");
    const sibling = store.getFact("f00002");
    if (!sibling) throw new Error("fixture");
    expect(store.leadWording(sibling, ["quiztopia"]).origin).toBe("generated");
  });

  it("names the photographed cards that print a fact", () => {
    expect(store.printedOn("f00001")).toEqual([
      { source: "quiztopia", card: "c001", image: "IMG20260910164837.jpg" },
    ]);
    expect(store.printedOn("f00002")).toEqual([]);
    expect(store.printedOn("f99999")).toEqual([]);
    expect(store.sourceCards("quiztopia").map((c) => c.id)).toEqual(["c001", "c002"]);
    expect(store.sourceCards("trivial-pursuit")).toEqual([]);
  });

  it("searches the prebuilt index", () => {
    const hits = store.search({ q: "Brecht", lang: "en", limit: 5 });
    expect(hits[0]?.factId).toBe("f00001");
    expect(hits[0]?.articleId).toBe("a0001");
    expect(hits[0]?.title).toBe("Two Germanys, Two Anthems, and a Children's Hymn");
    expect(store.search({ q: "Brecht", lang: "en", limit: 5, domain: "technology" })).toEqual([]);
  });

  it("loads article bodies lazily, once per article", async () => {
    fsMock.readFile.mockClear();
    const article = await store.getArticle("a0001");
    expect(article?.titleEn).toBe("Two Germanys, Two Anthems, and a Children's Hymn");
    expect(article?.facts).toHaveLength(5);
    expect(article?.bodyEn).toContain("Brecht");
    expect(fsMock.readFile).toHaveBeenCalledTimes(1);

    await store.getArticle("a0001");
    expect(fsMock.readFile).toHaveBeenCalledTimes(1); // cached
    await store.getArticle("a0013");
    expect(fsMock.readFile).toHaveBeenCalledTimes(2);

    expect(await store.getArticle("a0025")).toBeNull();
    expect(await store.getArticle("c001")).toBeNull();
    expect(fsMock.readFile).toHaveBeenCalledTimes(2);
    expect(ARTICLE_CACHE_SIZE).toBeGreaterThan(0);
  });

  it("refuses a directory without the bank", () => {
    expect(() => loadContentStore("/nowhere")).toThrow();
  });
});

describe("retired facts", () => {
  let bank: ReturnType<typeof makeRetiredBank>;
  let store: ReturnType<typeof loadContentStore>;
  beforeAll(() => {
    bank = makeRetiredBank();
    store = loadContentStore(bank.dir);
  });
  afterAll(() => bank.cleanup());

  it("keeps retired facts out of the fact map, the articles' fact lists and search", () => {
    expect(store.hasFact("f00001")).toBe(false);
    expect(store.getFact("f00001")).toBeNull();
    expect(store.printedOn("f00001")).toEqual([]);
    expect(store.getArticleMeta("a0001")?.factIds).toEqual([
      "f00002",
      "f00003",
      "f00004",
      "f00005",
    ]);
    expect(store.search({ q: "Brecht", lang: "en", limit: 5 }).map((h) => h.factId)).not.toContain(
      "f00001",
    );
  });

  it("deals a slot whose printed wording was retired as the fact that replaced it", () => {
    const card = store.getCard("c001");
    expect(card).not.toBeNull();
    expect(card?.sets).toHaveLength(12);
    expect(card?.sets[0]).toMatchObject({
      questionId: "f00002",
      categoryIndex: 0,
      answerEn: "August Heinrich Hoffmann von Fallersleben",
      en: store.getFact("f00002")?.wordings[0].en,
    });
    expect(card?.sets[1].questionId).toBe("f00006");
  });

  it("drops a card whose retired slot nothing replaced from every deck", () => {
    expect(store.getCard("c002")).toBeNull();
    expect(store.listCardRefs("original")).toEqual(["c001"]);
    expect(store.listCardRefs("extended").every((r) => r.startsWith("c001"))).toBe(true);
  });

  it("still hands out the whole article, retired list included", async () => {
    const article = await store.getArticle("a0001");
    expect(article?.facts.map((f) => f.id)).not.toContain("f00001");
    expect(article?.retired?.map((f) => [f.id, f.retired.replacedBy])).toEqual([
      ["f00001", ["f00002"]],
    ]);
  });

  it("reads an article's history on demand; none for an article without a file", async () => {
    expect(await store.getHistory("a0001")).toEqual(FIXTURE_HISTORY);
    expect(await store.getHistory("a0002")).toEqual({ article: "a0002", entries: [] });
    expect(await store.getHistory("a0099")).toBeNull();
  });
});

describe("retired articles and the desk's inputs", () => {
  let bank: ReturnType<typeof makeDeskBank>;
  let store: ReturnType<typeof loadContentStore>;
  beforeAll(() => {
    bank = makeDeskBank();
    store = loadContentStore(bank.dir);
  });
  afterAll(() => bank.cleanup());

  it("keeps a retired article out of everything the trainer and the table game see", async () => {
    expect(store.articles.map((a) => a.id)).not.toContain("a0024");
    expect(store.getArticleMeta("a0024")).toBeNull();
    expect(store.hasFact("f00116")).toBe(false);
    expect(
      store.search({ q: "Worlds for Sale", lang: "en", limit: 50 }).map((h) => h.articleId),
    ).not.toContain("a0024");
    expect(await store.getArticle("a0024")).toBeNull();
    expect(await store.getHistory("a0024")).toBeNull();
    const settings = QuizSettingsSchema.parse({ language: "en" });
    expect(eligibleArticles(store, settings).map((a) => a.id)).not.toContain("a0024");
    expect(store.domainShape.technology.articles).toBe(
      store.articles.filter((a) => a.domain === "technology").length,
    );
    // c002's slot 12 sat in a0024 (and slot 1 was retired already): off every deck.
    expect(store.getCard("c002")).toBeNull();
  });

  it("lets the desk read a retired article", async () => {
    expect(store.retiredArticles.map((a) => [a.id, a.retired.code])).toEqual([["a0024", "merged"]]);
    expect(store.getAnyArticleMeta("a0024")?.titleEn).toMatch(/Worlds for Sale/);
    expect((await store.getArticle("a0024", { includeRetired: true }))?.articleRetired?.code).toBe(
      "merged",
    );
    expect(await store.getHistory("a0024", { includeRetired: true })).toEqual({
      article: "a0024",
      entries: [],
    });
    expect(store.locate("f00116")).toMatchObject({ articleId: "a0024", retired: true });
  });

  it("lists every retired fact, wording and article as a desk row", () => {
    expect(store.retiredRows.map((r) => [r.kind, r.id, r.code ?? null]).sort()).toEqual([
      ["article", "a0024", "merged"],
      ["fact", "f00001", null],
      ["fact", "f00061", "wrong"],
      ["wording", "w90001", "superseded-by-print"],
    ]);
    const f1 = store.retiredRows.find((r) => r.id === "f00001");
    expect(f1).toMatchObject({
      articleId: "a0001",
      domain: "music-stage",
      replacedBy: ["f00002"],
      printed: { source: "quiztopia", card: "c001", category: 1 },
      inRetiredArticle: false,
    });
    expect(store.locate("w90001")).toMatchObject({
      factId: "f00006",
      kind: "wording",
      retired: true,
    });
  });

  it("loads the tag registry and the backlog, and evidence lazily", async () => {
    expect(store.tagRegistry?.facets.length).toBeGreaterThan(0);
    expect(store.backlog.map((b) => b.id)).toEqual(["b00001", "b00002", "b00003", "b00004"]);
    expect(store.evidenceArticleIds).toEqual(["a0001"]);
    expect(store.hasEvidence("a0002")).toBe(false);
    expect(await store.getEvidence("a0002")).toBeNull();
    fsMock.readFile.mockClear();
    const ledger = await store.getEvidence("a0001");
    expect(ledger?.assessments.map((a) => a.id)).toEqual(["e1", "e2"]);
    expect(await store.getEvidence("a0001")).toBe(ledger);
    expect(fsMock.readFile).toHaveBeenCalledTimes(1);
  });

  it("tolerates a bank without tags, backlog or evidence", () => {
    expect(loadContentStore(FIXTURE_DIR)).toMatchObject({
      tagRegistry: null,
      backlog: [],
      evidenceArticleIds: [],
      retiredArticles: [],
    });
  });
});

describe("process-wide instance", () => {
  afterEach(() => {
    __setContentStore(null);
  });

  it("returns the installed store without touching the disk", () => {
    expect(peekContentStore()).toBeNull();
    const store = loadContentStore(FIXTURE_DIR);
    __setContentStore(store);
    expect(peekContentStore()).toBe(store);
    expect(getContentStore()).toBe(store);
  });
});
