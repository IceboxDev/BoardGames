// The content store over the 2-card fixture: directory resolution, the
// QuestionSource view the game draws from, the trainer lookups, search and
// the lazy article cache.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

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

const FIXTURE_DIR = fileURLToPath(new URL("./__fixtures__/content/", import.meta.url));

describe("resolveContentDir", () => {
  it("prefers the env override and rejects one without an index", () => {
    expect(resolveContentDir({ [CONTENT_DIR_ENV]: FIXTURE_DIR })).toBe(
      FIXTURE_DIR.replace(/\/$/, ""),
    );
    expect(() => resolveContentDir({ [CONTENT_DIR_ENV]: "/nowhere/at/all" })).toThrow(
      new RegExp(`${CONTENT_DIR_ENV}=/nowhere/at/all has no index.json`),
    );
  });

  it("finds the core content dir relative to this module in the source layout", () => {
    const dir = resolveContentDir({});
    expect(dir.endsWith(join("packages", "core", "src", "games", "quiztopia", "content"))).toBe(
      true,
    );
    expect(dir).toBe(contentDirCandidates({})[0]);
  });

  it("lists every candidate in its error", () => {
    const candidates = contentDirCandidates({ [CONTENT_DIR_ENV]: "/tmp/does-not-exist-quiztopia" });
    expect(candidates).toHaveLength(5);
    expect(candidates[0]).toBe("/tmp/does-not-exist-quiztopia");
    expect(candidates.slice(1).every((c) => c.endsWith("core/src/games/quiztopia/content"))).toBe(
      true,
    );
  });
});

describe("loadContentStore (fixture)", () => {
  let store: ReturnType<typeof loadContentStore>;

  beforeAll(() => {
    store = loadContentStore(FIXTURE_DIR);
  });

  it("exposes the index", () => {
    const index = JSON.parse(readFileSync(join(FIXTURE_DIR, "index.json"), "utf8")) as {
      version: string;
    };
    expect(store.version).toBe(index.version);
    expect(store.cardIds).toEqual(["c001", "c002"]);
    expect(store.categories).toHaveLength(12);
    expect(store.categories[0]).toEqual({
      n: 1,
      en: "Stage & Music",
      de: "Bühne & Musik",
      band: "pink",
    });
    expect(store.dir).toBe(FIXTURE_DIR);
  });

  it("resolves an original card ref into twelve category-ordered sets", () => {
    const card = store.getCard("c001");
    expect(card).not.toBeNull();
    if (!card) return;
    expect(card.ref).toBe("c001");
    expect(card.cardId).toBe("c001");
    expect(card.sets).toHaveLength(12);
    card.sets.forEach((set, i) => {
      expect(set.categoryIndex).toBe(i);
      expect(set.questionId).toBe(`c001-s${String(i + 1).padStart(2, "0")}-q0`);
      expect(typeof set.notesEn).toBe("string");
      expect(typeof set.notesDe).toBe("string");
      expect(set.en.length).toBeGreaterThan(0);
      expect(set.answerDe.length).toBeGreaterThan(0);
    });
    expect(card.sets[0].answerEn).toBe("Bertolt Brecht");
  });

  it("resolves a virtual card ref into that sibling of every set", () => {
    const card = store.getCard("c001-v2");
    expect(card?.ref).toBe("c001-v2");
    expect(card?.cardId).toBe("c001");
    expect(card?.sets.map((s) => s.questionId)).toEqual(
      Array.from({ length: 12 }, (_, i) => `c001-s${String(i + 1).padStart(2, "0")}-q2`),
    );
    expect(card?.sets[0].en).toBe(store.getQuestion("c001-s01-q2")?.en);
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

  it("looks questions up by id", () => {
    expect(store.hasQuestion("c001-s01-q0")).toBe(true);
    expect(store.hasQuestion("c003-s01-q0")).toBe(false);
    expect(store.hasQuestion("garbage")).toBe(false);
    expect(store.getQuestion("c001-s01-q0")).toMatchObject({
      id: "c001-s01-q0",
      cardId: "c001",
      setId: "c001-s01",
      n: 1,
      q: 0,
      answerEn: "Bertolt Brecht",
      answerDe: "Bertolt Brecht",
      notesEn: "",
      notesDe: "",
    });
    expect(store.getQuestion("c002-s12-q4")?.q).toBe(4);
    expect(store.getQuestion("c003-s01-q0")).toBeNull();
    expect(store.getCardQuestions("c002")?.sets).toHaveLength(12);
    expect(store.getCardQuestions("c003")).toBeNull();
    expect(store.getTitles("c001-s01")?.[0]).toBe(
      "Two Germanys, Two Anthems, and a Children's Hymn",
    );
    expect(store.getTitles("c009-s01")).toBeNull();
  });

  it("orders a category's questions originals-first and caches the list", () => {
    const ids = store.questionIdsByCategory(1);
    expect(ids).toEqual([
      "c001-s01-q0",
      "c002-s01-q0",
      "c001-s01-q1",
      "c002-s01-q1",
      "c001-s01-q2",
      "c002-s01-q2",
      "c001-s01-q3",
      "c002-s01-q3",
      "c001-s01-q4",
      "c002-s01-q4",
    ]);
    expect(store.questionIdsByCategory(1)).toBe(ids);
    expect(store.questionIdsByCategory(12)[0]).toBe("c001-s12-q0");
    expect(store.questionIdsByCategory(13)).toEqual([]);
    expect(store.questionIdsByCategory(0)).toEqual([]);
  });

  it("searches the prebuilt index", () => {
    const hits = store.search({ q: "Brecht", lang: "en", limit: 5 });
    expect(hits[0]?.questionId).toBe("c001-s01-q0");
    expect(hits[0]?.title).toBe("Two Germanys, Two Anthems, and a Children's Hymn");
    expect(store.search({ q: "Brecht", lang: "en", limit: 5, category: 12 })).toEqual([]);
  });

  it("loads article files lazily, once per card, and bounds the cache", async () => {
    fsMock.readFile.mockClear();
    const set = await store.getArticle("c001-s01");
    expect(set?.titleEn).toBe("Two Germanys, Two Anthems, and a Children's Hymn");
    expect(set?.answerSpans.en).toHaveLength(5);
    expect(fsMock.readFile).toHaveBeenCalledTimes(1);

    await store.getArticle("c001-s07");
    expect(fsMock.readFile).toHaveBeenCalledTimes(1); // same card file, cached
    await store.getArticle("c002-s01");
    expect(fsMock.readFile).toHaveBeenCalledTimes(2);

    expect(await store.getArticle("c003-s01")).toBeNull();
    expect(await store.getArticle("c001-s13")).toBeNull();
    expect(await store.getArticle("c001")).toBeNull();
    expect(fsMock.readFile).toHaveBeenCalledTimes(2);
    expect(ARTICLE_CACHE_SIZE).toBeGreaterThan(0);
  });

  it("refuses a directory whose files disagree with the index", () => {
    expect(() => loadContentStore("/nowhere")).toThrow();
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
