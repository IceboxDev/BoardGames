import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { Article } from "../../../packages/core/src/quiz/content-types.ts";
import { factGrade } from "../../../packages/core/src/quiz/grade.ts";
import type { TagRegistry } from "../../../packages/core/src/quiz/tags.ts";
import { closeBacklogItem, filterBacklog, newBacklogItem, nextBacklogId } from "./backlog-io.ts";
import { addEvidence, type EvidenceInput } from "./evidence-io.ts";
import { parseRegroupRules, queryMatches, regroupReasons, simulateRegroup } from "./regroup.ts";
import { closeRun, openRun, readRun } from "./runs-io.ts";
import { editTags } from "./tags-io.ts";

const fact = (id: string, wid: string) => ({
  id,
  answerEn: "Rome",
  answerDe: "Rom",
  spans: { en: [0, 4] as [number, number], de: [0, 3] as [number, number] },
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
  wordings: [{ id: wid, en: "Which city?", de: "Welche Stadt?", origin: "generated" as const }],
});

const article = (id: string, extra: Partial<Article> = {}): Article => ({
  id,
  domain: "history",
  sub: "ancient",
  titleEn: "T",
  titleDe: "T",
  bodyEn: "Rome was founded in 753 BC.",
  bodyDe: "Rom wurde 753 v. Chr. gegründet.",
  notesEn: "",
  notesDe: "",
  images: [],
  facts: [fact(`f${id.slice(1)}1`, `w${id.slice(1)}1`)],
  ...extra,
});

describe("addEvidence", () => {
  const a = article("a0001");
  const input: EvidenceInput = {
    target: "f00011",
    claim: "answer",
    url: "https://www.britannica.com/place/Rome",
    title: "Rome",
    kind: "encyclopedia",
    lang: "en",
    quote: "Rome was founded in 753 BC",
    verbatim: true,
    verdict: "confirmed",
    confidence: "high",
    by: "owner",
    at: "2026-10-23T10:00:00Z",
  };

  it("creates the ledger, counts ids up and reuses a known source by URL", () => {
    const one = addEvidence(a, undefined, input);
    expect(one).toMatchObject({ sourceId: "s1", assessmentId: "e1", newSource: true });
    expect(one.ledger.assessments[0].support[0]).toMatchObject({
      source: "s1",
      quoteLang: "en",
      verbatim: true,
    });
    const two = addEvidence(a, one.ledger, { ...input, at: "2026-10-23T11:00:00Z" });
    expect(two).toMatchObject({ sourceId: "s1", assessmentId: "e2", newSource: false });
    const three = addEvidence(a, two.ledger, {
      ...input,
      url: "https://www.livius.org/rome",
      kind: "scholarly",
      at: "2026-10-23T12:00:00Z",
    });
    expect(three).toMatchObject({ sourceId: "s2", assessmentId: "e3" });
    // Verbatim needs a snapshot or verifiedAt to count; unverified quotes leave the fact at D.
    expect(factGrade("f00011", three.ledger).grade).toBe("D");
  });

  it("refuses an unknown target or an out-of-order assessment", () => {
    expect(() => addEvidence(a, undefined, { ...input, target: "f99999" })).toThrow(
      /unknown target/,
    );
    const one = addEvidence(a, undefined, input);
    expect(() => addEvidence(a, one.ledger, { ...input, at: "2026-10-22" })).toThrow(
      /out of order/,
    );
    expect(() => addEvidence(a, undefined, { ...input, lang: "eng" })).toThrow();
  });
});

describe("backlog", () => {
  const base = {
    kind: "verify" as const,
    target: "f00011",
    priority: 2,
    notes: "check",
    by: "owner",
    created: "2026-10-23",
  };

  it("numbers items and closes them by a history entry or a reason", () => {
    expect(nextBacklogId([])).toBe("b00001");
    const b1 = newBacklogItem([], base);
    const b2 = newBacklogItem([b1], { ...base, target: "quiztopia/c001", kind: "photo-check" });
    expect([b1.id, b2.id, b1.status]).toEqual(["b00001", "b00002", "open"]);
    const done = closeBacklogItem(b1, { byRef: "a0001#17", at: "2026-10-24" });
    expect(done).toMatchObject({ status: "done", closedBy: "a0001#17", closedAt: "2026-10-24" });
    const wont = closeBacklogItem(b2, { wontfix: "photo lost", at: "2026-10-24" });
    expect(wont).toMatchObject({ status: "wontfix", closeReason: "photo lost" });
    expect(() => closeBacklogItem(done, { wontfix: "x", at: "2026-10-24" })).toThrow(/already/);
    expect(() => closeBacklogItem(b1, { at: "2026-10-24" })).toThrow();
    expect(filterBacklog([done, wont, b1], { status: "open" }).map((b) => b.id)).toEqual([
      "b00001",
    ]);
    expect(filterBacklog([b1, b2], { target: "quiztopia/c001" }).map((b) => b.id)).toEqual([
      "b00002",
    ]);
  });

  it("rejects a bad item", () => {
    expect(() => newBacklogItem([], { ...base, priority: 9 })).toThrow(/priority/);
    expect(() => newBacklogItem([], { ...base, target: "no such thing" })).toThrow(/target/);
  });
});

describe("editTags", () => {
  const registry: TagRegistry = {
    version: 1,
    facets: [
      {
        id: "topic",
        labels: { en: "Topic", de: "Thema", ru: "Тема" },
        open: "path",
        hierarchical: true,
      },
      { id: "era", labels: { en: "Era", de: "Epoche", ru: "Эпоха" }, mode: "derived" },
    ],
  };

  it("adds and removes tags on the article or a fact", () => {
    const a = article("a0001");
    const tagged = editTags(a, "a0001", "add", ["topic:history/rome"], registry);
    expect(tagged.tags).toEqual(["topic:history/rome"]);
    expect(a.tags).toBeUndefined();
    const onFact = editTags(tagged, "f00011", "add", ["topic:history"], registry);
    expect(onFact.facts[0].tags).toEqual(["topic:history"]);
    const cleared = editTags(onFact, "a0001", "rm", ["topic:history/rome"], registry);
    expect(cleared.tags).toBeUndefined();
  });

  it("refuses unknown facets, derived facets, duplicates and missing targets", () => {
    const a = article("a0001");
    expect(() => editTags(a, "a0001", "add", ["colour:red"], registry)).toThrow(
      /unknown tag facet/,
    );
    expect(() => editTags(a, "a0001", "add", ["era:m2"], registry)).toThrow(/derived/);
    expect(() => editTags(a, "f99999", "add", ["topic:x"], registry)).toThrow(/not in/);
    const t = editTags(a, "a0001", "add", ["topic:x"], registry);
    expect(() => editTags(t, "a0001", "add", ["topic:x"], registry)).toThrow(/already/);
    expect(() => editTags(a, "a0001", "rm", ["topic:x"], registry)).toThrow(/has no/);
  });
});

describe("regroup simulation", () => {
  it("sends each active article to the first matching rule and never edits the input", () => {
    const a1 = article("a0001", { tags: ["topic:history/rome"] });
    const a2 = article("a0002", { tags: ["topic:art/painting"] });
    const a3 = article("a0003");
    const gone = article("a0004", {
      tags: ["topic:art/painting"],
      articleRetired: { at: "2026-10-23", code: "duplicate", reason: "dup" },
    });
    const rules = parseRegroupRules({
      rules: [
        { domain: "art", sub: "painting", query: { all: ["topic:art"] } },
        { domain: "history", query: { any: ["topic:history"] } },
      ],
    });
    const res = simulateRegroup([a1, a2, a3, gone], rules);
    expect(res.moves).toEqual([
      { article: "a0002", from: "history/ancient", to: "art/painting", rule: 1 },
    ]);
    expect(res.unmatched).toEqual(["a0003"]);
    expect(a2.domain).toBe("history");
    expect(res.after.art.articles - res.before.art.articles).toBe(1);
    const reasons = regroupReasons(res.moves, rules, "rules.json");
    expect(reasons.a0002).toMatchObject({ kind: "recategorised", fields: ["domain", "sub"] });
  });

  it("matches hierarchical queries and validates rules", () => {
    expect(queryMatches(["topic:music/opera"], { all: ["topic:music"] })).toBe(true);
    expect(queryMatches(["topic:music/opera"], { none: ["topic:music"] })).toBe(false);
    expect(() => parseRegroupRules([{ domain: "nowhere", query: {} }])).toThrow(/unknown domain/);
    expect(() => parseRegroupRules([{ domain: "art", sub: "nope", query: {} }])).toThrow(
      /unknown sub/,
    );
  });
});

describe("runs", () => {
  let dir: string | undefined;
  afterEach(() => dir && rmSync(dir, { recursive: true, force: true }));

  it("opens a skeleton and closes it once", () => {
    dir = mkdtempSync(join(tmpdir(), "quiz-archive-"));
    const run = openRun(
      "tags-2026-10-24",
      { title: "Tagging", kind: "tagging", by: ["coordinator"], at: "2026-10-24T08:00:00Z" },
      dir,
    );
    expect(run).toMatchObject({ endedAt: null, kind: "tagging", inputs: [] });
    expect(JSON.parse(readFileSync(join(dir, "runs/tags-2026-10-24/run.json"), "utf8")).id).toBe(
      "tags-2026-10-24",
    );
    expect(() =>
      openRun("tags-2026-10-24", { title: "x", kind: "tagging", by: [], at: "x" }, dir),
    ).toThrow(/exists/);
    expect(() => openRun("Bad Id", { title: "x", kind: "tagging", by: [], at: "x" }, dir)).toThrow(
      /bad run id/,
    );
    expect(() => openRun("x1", { title: "x", kind: "party", by: [], at: "x" }, dir)).toThrow(
      /kind/,
    );
    closeRun("tags-2026-10-24", { at: "2026-10-24T09:00:00Z", historyEntries: 12 }, dir);
    expect(readRun("tags-2026-10-24", dir)).toMatchObject({
      endedAt: "2026-10-24T09:00:00Z",
      counts: { historyEntries: 12 },
    });
    expect(() => closeRun("tags-2026-10-24", { at: "y" }, dir)).toThrow(/already closed/);
  });
});
