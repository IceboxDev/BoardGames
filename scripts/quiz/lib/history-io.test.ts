import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Article, SourceCards } from "../../../packages/core/src/quiz/content-types.ts";
import {
  type ArticleHistory,
  articleEntities,
  cardHistoryProblems,
  chainProblems,
  entityHash,
  historyProblems,
  historyRoot,
  lastChain,
  serializeHistory,
} from "../../../packages/core/src/quiz/history.ts";
import {
  cardHistoryPath,
  type HistoryStore,
  historyPath,
  logChanges,
  parseReasons,
  readCardHistories,
  readHistories,
  readHistory,
  rewriteRefs,
  sealHistories,
} from "./history-io.ts";

const fact = (id: string, wid: string, answer: string) => ({
  id,
  answerEn: answer,
  answerDe: answer,
  spans: { en: [0, answer.length] as [number, number], de: [0, answer.length] as [number, number] },
  timeline: {
    kind: "event" as const,
    start: "-753",
    end: null,
    precision: "year" as const,
    approx: true,
    ongoing: false,
    labelEn: "Rome founded",
    labelDe: "Rom gegründet",
  },
  source: { url: "https://en.wikipedia.org/wiki/Rome", title: "Rome", lang: "en" },
  wordings: [{ id: wid, en: `Q ${answer}?`, de: `F ${answer}?`, origin: "generated" as const }],
});

const article = (id: string, facts: Article["facts"]): Article => ({
  id,
  domain: "history",
  sub: "ancient",
  titleEn: `T ${id}`,
  titleDe: `T ${id}`,
  bodyEn: "Rome Remus Romulus.",
  bodyDe: "Rome Remus Romulus.",
  notesEn: "",
  notesDe: "",
  images: [],
  facts,
});

const source = (slots: string[]): SourceCards => ({
  source: "quiztopia",
  cards: [
    {
      id: "c001",
      image: "IMG1.jpg",
      slots: slots.map((wordingId, i) => ({ category: i + 1, wordingId })),
    },
  ],
});

let dir: string;
let logged: Map<string, string>;
let store: HistoryStore;

/** Write the bank's working files (articles + sources), like an editor would. */
function writeWorking(articles: Article[], sources: SourceCards[] = []) {
  mkdirSync(join(dir, "articles"), { recursive: true });
  mkdirSync(join(dir, "sources"), { recursive: true });
  for (const a of articles)
    writeFileSync(join(dir, "articles", `${a.id}.json`), JSON.stringify(a, null, 1));
  for (const s of sources)
    writeFileSync(join(dir, "sources", `${s.source}.json`), JSON.stringify(s, null, 1));
}

const base = { by: "test", at: "2026-10-23" };

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "quiz-history-"));
  logged = new Map();
  store = {
    contentDir: dir,
    previous: (rel) => logged.get(rel) ?? null,
    // "git add": the staged copy becomes the last logged state.
    stage: (paths) => {
      for (const p of paths) logged.set(relative(dir, p), readFileSync(p, "utf8"));
    },
  };
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("logChanges: chain and provenance", () => {
  it("chains every new entry and stores actor, run, confidence, evidence and report", () => {
    const a = article("a0001", [fact("f00001", "w00001", "Rome")]);
    writeWorking([a]);
    const res = logChanges([a], {
      ...base,
      store,
      actor: { kind: "agent", name: "enrich batch 7", model: "claude-opus" },
      run: "tp-enrich",
      reasons: {
        default: { kind: "created", reason: "New." },
        f00001: {
          kind: "created",
          reason: "New fact.",
          confidence: "high",
          evidence: ["e1"],
          report: "r42",
        },
      },
    });
    expect(res.unexplained).toEqual([]);
    const h = readHistory("a0001", store);
    expect(h?.entries).toHaveLength(3);
    expect(h?.entries.every((e) => e.chain && e.run === "tp-enrich")).toBe(true);
    expect(h?.entries[0].actor).toEqual({
      kind: "agent",
      name: "enrich batch 7",
      model: "claude-opus",
    });
    const f = h?.entries.find((e) => e.target.id === "f00001");
    expect(f).toMatchObject({ confidence: "high", evidence: ["e1"], report: "r42" });
    expect(chainProblems(h as ArticleHistory)).toEqual([]);
    expect(historyProblems(a, h)).toEqual([]);
  });

  it("starts the chain after an unchained backfill", () => {
    const a = article("a0001", [fact("f00001", "w00001", "Rome")]);
    writeWorking([a]);
    const backfill: ArticleHistory = {
      article: "a0001",
      entries: articleEntities(a).map((e, i) => ({
        seq: i + 1,
        at: "2026-10-20",
        kind: "imported" as const,
        target: { type: e.type, id: e.id },
        reason: "Imported.",
        by: "import",
        hash: entityHash(e.fields),
      })),
    };
    mkdirSync(join(dir, "history"), { recursive: true });
    writeFileSync(historyPath("a0001", store), serializeHistory(backfill));
    logged.set("articles/a0001.json", JSON.stringify(a));
    const edited = { ...a, titleEn: "New title" };
    writeWorking([edited]);
    logChanges([edited], {
      ...base,
      store,
      reasons: { a0001: { kind: "edited", reason: "Retitled." } },
    });
    const h = readHistory("a0001", store) as ArticleHistory;
    expect(h.entries).toHaveLength(4);
    expect(h.entries.slice(0, 3).every((e) => !e.chain)).toBe(true);
    expect(h.entries[3].chain).toBeDefined();
    expect(h.entries[3].changes).toEqual([{ field: "titleEn", old: "T a0001", new: "New title" }]);
    expect(chainProblems(h)).toEqual([]);
    expect(historyProblems(edited, h)).toEqual([]);
  });

  it("refuses to write to a file whose chain is broken", () => {
    const a = article("a0001", [fact("f00001", "w00001", "Rome")]);
    writeWorking([a]);
    logChanges([a], { ...base, store, reasons: { default: { kind: "created", reason: "New." } } });
    const h = readHistory("a0001", store) as ArticleHistory;
    h.entries[1] = { ...h.entries[1], reason: "tampered" };
    writeFileSync(historyPath("a0001", store), serializeHistory(h));
    const edited = { ...a, titleEn: "Other" };
    expect(() =>
      logChanges([edited], { ...base, store, reasons: { a0001: { kind: "edited", reason: "x" } } }),
    ).toThrow(/chain already broken/);
  });
});

describe("logChanges: an article's retirement", () => {
  it("writes the article-retirement event first, then the article's hashed entry", () => {
    const a = article("a0001", [fact("f00001", "w00001", "Rome")]);
    writeWorking([a]);
    logChanges([a], { ...base, store, reasons: { default: { kind: "created", reason: "New." } } });
    const retired: Article = {
      ...a,
      articleRetired: { at: "2026-10-23", code: "duplicate", reason: "Covered by a0002." },
    };
    writeWorking([retired]);
    const res = logChanges([retired], {
      ...base,
      store,
      ids: ["a0001"],
      reasons: {
        a0001: { kind: "retired", reason: "Article retired: dup.", fields: ["articleRetired"] },
      },
      prepend: {
        a0001: [
          {
            at: "2026-10-23",
            kind: "retired",
            target: { type: "article-retirement", id: "a0001" },
            reason: "Covered by a0002.",
            by: "test",
          },
        ],
      },
    });
    expect(res.unexplained).toEqual([]);
    const h = readHistory("a0001", store) as ArticleHistory;
    expect(h.entries.slice(-2).map((e) => [e.target.type, e.kind])).toEqual([
      ["article-retirement", "retired"],
      ["article", "retired"],
    ]);
    expect(chainProblems(h)).toEqual([]);
    expect(historyProblems(retired, h)).toEqual([]);
  });
});

describe("logChanges: moves keep where entries were written", () => {
  it("carries a moved fact's entries with movedFrom and re-links both files", () => {
    const f1 = fact("f00001", "w00001", "Rome");
    const f2 = fact("f00002", "w00002", "Remus");
    const f3 = fact("f00003", "w00003", "Romulus");
    const a1 = article("a0001", [f1, f2]);
    const a2 = article("a0002", [f3]);
    writeWorking([a1, a2]);
    logChanges([a1, a2], {
      ...base,
      store,
      reasons: { default: { kind: "created", reason: "New." } },
    });
    const before = readHistory("a0001", store) as ArticleHistory;
    const f2Seqs = before.entries.filter((e) => e.target.id === "f00002").map((e) => e.seq);
    expect(f2Seqs).toEqual([4]);

    const m1 = article("a0001", [f1]);
    const m2 = article("a0002", [f3, f2]);
    writeWorking([m1, m2]);
    const res = logChanges([m1, m2], {
      ...base,
      store,
      reasons: { default: { kind: "moved", reason: "Belongs with Romulus." } },
    });
    expect(res.unexplained).toEqual([]);
    const h1 = readHistory("a0001", store) as ArticleHistory;
    const h2 = readHistory("a0002", store) as ArticleHistory;
    expect(h1.entries.some((e) => e.target.id === "f00002" || e.target.id === "w00002")).toBe(
      false,
    );
    const carried = h2.entries.filter((e) => e.movedFrom);
    expect(carried.map((e) => [e.target.id, e.movedFrom])).toEqual([
      ["f00002", { article: "a0001", seq: 4 }],
      ["w00002", { article: "a0001", seq: 5 }],
    ]);
    expect(h2.entries.some((e) => e.kind === "moved" && e.target.id === "f00002")).toBe(true);
    expect(chainProblems(h1)).toEqual([]);
    expect(chainProblems(h2)).toEqual([]);
    expect(historyProblems(m1, h1)).toEqual([]);
    expect(historyProblems(m2, h2)).toEqual([]);
  });
});

describe("logChanges: card history", () => {
  it("tracks a card against the logged source until its first entry, then by hash", () => {
    const a = article("a0001", [fact("f00001", "w00001", "Rome")]);
    const s = source(["w00001"]);
    writeWorking([a], [s]);
    logged.set("sources/quiztopia.json", JSON.stringify(s));
    const quiet = logChanges([a], {
      ...base,
      store,
      reasons: { default: { kind: "created", reason: "New." } },
    });
    expect(quiet.cards).toEqual([]);

    const moved = source(["w00009"]);
    writeWorking([a], [moved]);
    const refused = logChanges([a], {
      ...base,
      store,
      reasons: { default: { kind: "edited", reason: "defaults never cover cards" } },
    });
    expect(refused.unexplained).toEqual(["quiztopia/c001 (slots)"]);

    const ok = logChanges([a], {
      ...base,
      store,
      run: "tp-221",
      reasons: { "quiztopia/c001": { kind: "corrected", reason: "Slot 1 holds w00009." } },
    });
    expect(ok.cards).toEqual(["quiztopia"]);
    const ch = readCardHistories(store).get("quiztopia");
    expect(ch?.entries).toHaveLength(1);
    expect(ch?.entries[0]).toMatchObject({
      target: { type: "card", id: "c001" },
      kind: "corrected",
      run: "tp-221",
      changes: [{ field: "slots" }],
    });
    expect(cardHistoryProblems(moved, ch)).toEqual([]);
    expect(readFileSync(cardHistoryPath("quiztopia", store), "utf8")).toContain(
      '"source":"quiztopia"',
    );

    // A bare card id names the card too; an unchanged card logs nothing.
    const again = source(["w00010"]);
    writeWorking([a], [again]);
    const bare = logChanges([a], {
      ...base,
      store,
      reasons: { c001: { kind: "corrected", reason: "Slot 1 holds w00010." } },
    });
    expect(bare.unexplained).toEqual([]);
    expect(readCardHistories(store).get("quiztopia")?.entries).toHaveLength(2);
    expect(chainProblems(readCardHistories(store).get("quiztopia") as never)).toEqual([]);
  });

  it("tracks a never-logged source from the seal on, or when a reason names the card", () => {
    const a = article("a0001", [fact("f00001", "w00001", "Rome")]);
    writeWorking([a], [source(["w00001"])]);
    const quiet = logChanges([a], {
      ...base,
      store,
      reasons: { default: { kind: "created", reason: "New." } },
    });
    expect(quiet).toMatchObject({ unexplained: [], cards: [] });
    const named = logChanges([a], {
      ...base,
      store,
      reasons: { "quiztopia/c001": { kind: "printed", reason: "Transcribed." } },
    });
    expect(named.cards).toEqual(["quiztopia"]);
    expect(
      readCardHistories(store)
        .get("quiztopia")
        ?.entries[0].changes?.map((c) => c.field),
    ).toEqual(["image", "slots"]);
  });

  it("skips cards when only some articles are logged", () => {
    const a = article("a0001", [fact("f00001", "w00001", "Rome")]);
    writeWorking([a], [source(["w00001"])]);
    const res = logChanges([a], {
      ...base,
      store,
      ids: ["a0001"],
      reasons: { default: { kind: "created", reason: "New." } },
    });
    expect(res.unexplained).toEqual([]);
    expect(res.cards).toEqual([]);
  });
});

describe("parseReasons", () => {
  it("accepts the provenance fields and rejects bad ones", () => {
    expect(
      parseReasons({
        f00001: { kind: "corrected", reason: "x", confidence: "low", evidence: ["a0001/e3"] },
      }),
    ).toBeTruthy();
    expect(() =>
      parseReasons({ f1: { kind: "corrected", reason: "x", confidence: "sure" } }),
    ).toThrow(/confidence/);
    expect(() =>
      parseReasons({ f1: { kind: "corrected", reason: "x", evidence: ["s1"] } }),
    ).toThrow(/evidence/);
    expect(() => parseReasons({ f1: { kind: "corrected", reason: "x", run: "Bad Run" } })).toThrow(
      /run/,
    );
    expect(() => parseReasons({ f1: { kind: "nope", reason: "x" } })).toThrow(/kind/);
  });
});

describe("rewriteRefs", () => {
  it("prefixes mapped refs (each path of a multi-file ref) and leaves the rest", () => {
    const h: ArticleHistory = {
      article: "a0001",
      entries: [
        {
          seq: 1,
          at: "2026-10-20",
          kind: "printed",
          target: { type: "wording", id: "w00001" },
          reason: "r",
          by: "b",
          ref: "quiztopia/c001",
        },
        {
          seq: 2,
          at: "2026-10-20",
          kind: "edited",
          target: { type: "fact", id: "f00001" },
          reason: "r",
          by: "b",
          ref: "decisions/a.json decisions/b.json",
        },
        {
          seq: 3,
          at: "2026-10-20",
          kind: "edited",
          target: { type: "fact", id: "f00001" },
          reason: "r",
          by: "b",
          ref: "elsewhere",
        },
      ],
    };
    mkdirSync(join(dir, "history"), { recursive: true });
    writeFileSync(historyPath("a0001", store), serializeHistory(h));
    const map = {
      "quiztopia/c001": "transcripts/quiztopia/c001.json",
      "decisions/a.json decisions/b.json": "runs/x/a.json runs/x/b.json",
    };
    const res = rewriteRefs(map, { store });
    expect(res).toMatchObject({ files: 1, entries: 2, already: 0 });
    expect([...res.unmapped]).toEqual([["elsewhere", 1]]);
    const refs = readHistory("a0001", store)?.entries.map((e) => e.ref);
    expect(refs).toEqual([
      "quiz-archive/transcripts/quiztopia/c001.json",
      "quiz-archive/runs/x/a.json quiz-archive/runs/x/b.json",
      "elsewhere",
    ]);
    expect(rewriteRefs(map, { store })).toMatchObject({ entries: 0, already: 2 });
  });

  it("refuses to rewrite a chained entry", () => {
    const a = article("a0001", [fact("f00001", "w00001", "Rome")]);
    writeWorking([a]);
    logChanges([a], {
      ...base,
      store,
      reasons: { default: { kind: "created", reason: "New.", ref: "old/ref" } },
    });
    expect(() => rewriteRefs({ "old/ref": "runs/x/y" }, { store })).toThrow(/chained/);
  });
});

describe("sealHistories", () => {
  it("appends a chained checkpoint per entity and card and returns the root", () => {
    const a = article("a0001", [fact("f00001", "w00001", "Rome")]);
    const s = source(["w00001"]);
    writeWorking([a], [s]);
    logChanges([a], {
      ...base,
      store,
      ids: ["a0001"],
      reasons: { default: { kind: "created", reason: "New." } },
    });
    const res = sealHistories([a], [s], {
      at: "2026-10-24",
      actor: { kind: "script", name: "seal" },
      run: "seal-1",
      store,
    });
    expect(res).toMatchObject({ articleEntries: 3, cardEntries: 1, files: 2 });
    const h = readHistories(store).get("a0001") as ArticleHistory;
    const cards = readCardHistories(store).get("quiztopia");
    expect(h.entries.slice(-3).every((e) => e.kind === "checkpoint" && e.run === "seal-1")).toBe(
      true,
    );
    expect(chainProblems(h)).toEqual([]);
    expect(historyProblems(a, h)).toEqual([]);
    expect(cardHistoryProblems(s, cards, { strict: true })).toEqual([]);
    expect(res.root).toBe(historyRoot([h, cards as never]));
    expect(lastChain(h.entries)).not.toBeNull();
  });
});
