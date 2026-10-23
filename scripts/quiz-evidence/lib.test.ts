import { describe, expect, it } from "vitest";
import type { ArticleEvidence } from "../../packages/core/src/quiz/evidence-types.ts";
import { evidenceProblems } from "../../packages/core/src/quiz/evidence-types.ts";
import { factGrade } from "../../packages/core/src/quiz/grade.ts";
import {
  answerCandidates,
  appendAssessments,
  detectClones,
  extractText,
  findAnswer,
  jaccard,
  normalize,
  parseRetryAfter,
  parseWikipediaUrl,
  planAssessments,
  quoteOccurs,
  sentenceAround,
  shingles,
  urlKey,
} from "./lib.ts";

describe("extractText", () => {
  it("drops scripts, styles, nav and footer, keeps article text as lines", () => {
    const html = `<!doctype html><html><head><title>Kinderhymne &ndash; Test</title>
      <style>p{color:red}</style><script>var x = "Brecht";</script></head>
      <body><nav><a href="/">Home</a> Menu</nav><header>Site header</header>
      <main><h1>Kinderhymne</h1><p>Written by <b>Bertolt&nbsp;Brecht</b> in 1950.</p>
      <!-- a comment --><p>Music by Hanns Eisler &amp; others.</p><ul><li>One</li><li>Two</li></ul></main>
      <footer>© 2026</footer></body></html>`;
    const t = extractText(html);
    expect(t.split("\n")).toEqual([
      "Kinderhymne – Test",
      "Kinderhymne",
      "Written by Bertolt Brecht in 1950.",
      "Music by Hanns Eisler & others.",
      "One",
      "Two",
    ]);
    expect(t).not.toContain("var x");
    expect(t).not.toContain("Menu");
    expect(t).not.toContain("©");
  });

  it("prefers <article> over the rest of the body and decodes numeric entities", () => {
    const html = `<body><div>sidebar junk</div><article><p>&#8222;Lied&#8220; &#x2013; 1841</p></article></body>`;
    expect(extractText(html)).toBe("„Lied“ – 1841");
  });
});

describe("answer matching", () => {
  const text =
    "The song was written in 1841. Its author, August Heinrich Hoffmann von Fallersleben, was on holiday. " +
    "Around 1.000 people attended. Der Komponist hieß Hanns Eisler.\nCrème brûlée is a dessert. The Saint-Gotthard tunnel opened.";

  it("finds a plain answer and returns its sentence verbatim", () => {
    const m = findAnswer(text, "Hoffmann von Fallersleben");
    expect(m?.quote).toBe("Its author, August Heinrich Hoffmann von Fallersleben, was on holiday.");
    expect(text.slice(m?.start, m?.end)).toBe("Hoffmann von Fallersleben");
  });

  it("folds case and diacritics", () => {
    expect(findAnswer(text, "creme brulee")?.quote).toBe("Crème brûlée is a dessert.");
    expect(findAnswer(text, "HANNS EISLER")).not.toBeNull();
    expect(findAnswer("Er hieß Strauss.", "Strauß")).not.toBeNull();
  });

  it("treats number formats alike", () => {
    expect(findAnswer(text, "1,000")).not.toBeNull();
    expect(findAnswer(text, "1000")).not.toBeNull();
    expect(findAnswer("about 12 500 km", "12,500")).not.toBeNull();
    expect(findAnswer("in 1945 200 soldiers", "200")).not.toBeNull();
    expect(normalize("1945 200")).toBe("1945 200");
  });

  it("treats hyphens and spaces alike", () => {
    expect(findAnswer(text, "Saint Gotthard")).not.toBeNull();
    expect(findAnswer("the Saint Gotthard Pass", "Saint-Gotthard")).not.toBeNull();
    expect(findAnswer("ein Nord–Süd-Gefälle", "Nord-Süd-Gefälle")).not.toBeNull();
  });

  it("prefers an occurrence in prose over a bare heading", () => {
    const page = "Hanns Eisler\n\nHanns Eisler (1898–1962) was an Austrian composer of film music.";
    expect(findAnswer(page, "Hanns Eisler")?.quote).toBe(
      "Hanns Eisler (1898–1962) was an Austrian composer of film music.",
    );
    expect(findAnswer("Hanns Eisler", "Hanns Eisler")?.quote).toBe("Hanns Eisler");
  });

  it("matches whole words only", () => {
    expect(findAnswer("Rain falls on Spain.", "Ra")).toBeNull();
    expect(findAnswer("The god Ra.", "Ra")).not.toBeNull();
    expect(findAnswer(text, "Eisle")).toBeNull();
  });

  it("matches an answer with quote marks with or without them", () => {
    expect(findAnswer("Haydn's Emperor Quartet", "„Emperor“ Quartet")).not.toBeNull();
  });

  it("ignores soft hyphens and zero-width characters", () => {
    const shy = String.fromCharCode(0xad);
    const zw = String.fromCharCode(0x200b);
    expect(findAnswer(`Bert${shy}olt Bre${zw}cht wrote it.`, "Bertolt Brecht")).not.toBeNull();
  });

  it("matches Cyrillic", () => {
    expect(findAnswer("Автор — Бертольт Брехт, 1950.", "Бертольт Брехт")).not.toBeNull();
  });

  it("keeps long-sentence quotes within 300 chars, around the match", () => {
    const long = `${"word ".repeat(120)}TARGET ${"more ".repeat(120)}end.`;
    const m = findAnswer(long, "target");
    expect(m).not.toBeNull();
    expect(m?.quote.length).toBeLessThanOrEqual(300);
    expect(m?.quote).toContain("TARGET");
    expect(long.includes(m?.quote ?? "!")).toBe(true);
    expect(sentenceAround("A. B c d. E", 3, 4)).toBe("B c d.");
  });

  it("orders answer candidates by the page language", () => {
    const f = { answerEn: "Cologne", answerDe: "Köln", answerRu: "Кёльн" };
    expect(answerCandidates(f, "de").map((c) => c.text)).toEqual(["Köln", "Cologne", "Кёльн"]);
    expect(answerCandidates(f, "fr")[0].text).toBe("Cologne");
    expect(answerCandidates({ answerEn: "X", answerDe: "X" }, "de")).toHaveLength(1);
  });

  it("finds quotes with whitespace and typography normalised", () => {
    expect(quoteOccurs("He said  „yes“\nto it.", 'said "yes" to')).toBe(true);
    expect(quoteOccurs("He said yes.", "said no")).toBe(false);
  });
});

describe("helpers", () => {
  it("parses Wikipedia URLs", () => {
    expect(
      parseWikipediaUrl("https://de.m.wikipedia.org/wiki/Das_Lied_der_Deutschen#Text"),
    ).toEqual({
      lang: "de",
      title: "Das Lied der Deutschen",
    });
    expect(parseWikipediaUrl("https://en.wikipedia.org/wiki/Caf%C3%A9")?.title).toBe("Café");
    expect(parseWikipediaUrl("https://en.wikipedia.org/w/index.php?title=AC/DC")?.title).toBe(
      "AC/DC",
    );
    expect(parseWikipediaUrl("https://www.wikipedia.org/")).toBeNull();
    expect(parseWikipediaUrl("https://example.com/wiki/X")).toBeNull();
  });

  it("parses Retry-After", () => {
    expect(parseRetryAfter("7")).toBe(7000);
    expect(parseRetryAfter(null)).toBeNull();
    expect(
      parseRetryAfter("Thu, 01 Jan 2099 00:00:10 GMT", Date.parse("2099-01-01T00:00:00Z")),
    ).toBe(10_000);
  });

  it("compares URLs loosely", () => {
    expect(urlKey("http://Example.com/a/#x")).toBe(urlKey("https://example.com/a"));
  });
});

describe("clone detection", () => {
  const body = Array.from({ length: 200 }, (_, i) => `word${i % 37} token${i}`).join(" ");
  const src = (url: string, kind: "encyclopedia" | "press" | "fan" = "encyclopedia") => ({
    url,
    kind,
    lang: "en",
    retrievedAt: "2026-10-23",
  });

  it("shingles and Jaccard", () => {
    const a = shingles(body);
    expect(a.size).toBeGreaterThan(100);
    expect(jaccard(a, a)).toBe(1);
    expect(jaccard(a, shingles("completely different text ".repeat(40)))).toBe(0);
  });

  it("marks mirror hosts and near-copies on another domain, pointing at the more authoritative", () => {
    const sources = {
      s1: src("https://en.wikipedia.org/wiki/X"),
      s2: src("https://www.wikiwand.com/en/X"),
      s3: src("https://copycat.example/x", "fan"),
      s4: src("https://news.example/x", "press"),
      s5: src("https://de.wikipedia.org/wiki/X"),
    };
    const texts = new Map([
      ["s1", body],
      ["s3", `${body} plus a footer line`],
      ["s4", "an unrelated article ".repeat(80)],
      ["s5", body],
    ]);
    const marks = detectClones(sources, texts);
    expect(marks).toEqual({ s2: "wikipedia.org", s3: "s1" });
  });

  it("leaves existing cloneOf alone and ignores tiny pages", () => {
    const sources = {
      s1: src("https://a.example/x"),
      s2: { ...src("https://b.example/x"), cloneOf: "s1" },
      s3: src("https://c.example/x"),
    };
    const texts = new Map([
      ["s1", "Access denied."],
      ["s2", body],
      ["s3", "Access denied."],
    ]);
    expect(detectClones(sources, texts)).toEqual({});
  });
});

describe("planAssessments", () => {
  const article = {
    id: "a0001",
    facts: [
      { id: "f00001", answerEn: "Bertolt Brecht", answerDe: "Bertolt Brecht" },
      { id: "f00002", answerEn: "Cologne", answerDe: "Köln" },
    ],
  };
  const base = (): ArticleEvidence => ({
    article: "a0001",
    sources: {
      s1: {
        url: "https://de.wikipedia.org/wiki/K",
        kind: "encyclopedia",
        lang: "de",
        retrievedAt: "2026-10-23",
        snapshot: "a".repeat(64),
      },
      s2: { url: "https://press.example/x", kind: "press", lang: "en", retrievedAt: "2026-10-23" },
    },
    assessments: [
      {
        id: "e1",
        at: "2026-10-22",
        target: "f00001",
        claim: "answer",
        verdict: "unverified",
        confidence: "low",
        support: [{ source: "s1", quote: "Brecht", quoteLang: "de", verbatim: false }],
        by: "backfill",
      },
      {
        id: "e2",
        at: "2026-10-22",
        target: "f00002",
        claim: "answer",
        verdict: "confirmed",
        confidence: "high",
        support: [
          { source: "s1", quote: "liegt in Köln am Rhein", quoteLang: "de", verbatim: true },
        ],
        by: "research batch 01",
      },
    ],
  });
  const texts = new Map([
    ["s1", "Die Kinderhymne schrieb Bertolt Brecht 1950. Der Dom liegt in Köln am Rhein."],
  ]);
  const now = "2026-10-23T10:00:00.000Z";

  it("confirms answers found, verifies agent quotes, and is idempotent", () => {
    const ev = base();
    const drafts = planAssessments(ev, article.facts, texts, { now, run: "crawl-test" });
    expect(drafts.map((d) => [d.target, d.verdict, d.note?.split(":")[0]])).toEqual([
      ["f00002", "confirmed", "quote check"],
      ["f00001", "confirmed", "answer check"],
      ["f00002", "confirmed", "answer check"],
    ]);
    expect(drafts[1].support[0]).toEqual({
      source: "s1",
      quote: "Die Kinderhymne schrieb Bertolt Brecht 1950.",
      quoteLang: "de",
      verbatim: true,
      verifiedAt: now,
    });
    const next = appendAssessments(ev, drafts, now);
    expect(next.assessments.slice(0, 2)).toEqual(ev.assessments);
    expect(next.assessments.map((a) => a.id)).toEqual(["e1", "e2", "e3", "e4", "e5"]);
    expect(evidenceProblems(article, next)).toEqual([]);
    expect(factGrade("f00001", next).grade).toBe("C");
    // Re-run: nothing new.
    expect(planAssessments(next, article.facts, texts, { now, run: "crawl-test" })).toEqual([]);
  });

  it("appends a new check when the result changes, never against a decisive agent verdict", () => {
    const ev = appendAssessments(
      base(),
      planAssessments(base(), article.facts, texts, { now }),
      now,
    );
    const changed = new Map([["s1", "Ein ganz anderer Text ohne die Antwort."]]);
    const drafts = planAssessments(ev, article.facts, changed, { now });
    // f00001: crawler said confirmed, now unverified → appended. f00002: the
    // agent confirmed (and the crawler's quote check re-stated it) → left alone.
    expect(drafts.map((d) => [d.target, d.verdict])).toEqual([["f00001", "unverified"]]);
    expect(drafts[0].support[0].verbatim).toBe(false);
  });

  it("skips contested facts", () => {
    const ev = base();
    ev.assessments.push({
      id: "e3",
      at: "2026-10-22",
      target: "f00001",
      claim: "answer",
      verdict: "contested",
      confidence: "medium",
      support: [{ source: "s1", quote: "x", quoteLang: "de", verbatim: false }],
      by: "owner",
    });
    const drafts = planAssessments(ev, article.facts, texts, { now });
    expect(drafts.some((d) => d.target === "f00001")).toBe(false);
  });

  it("dates appended assessments no earlier than the ledger's last", () => {
    const ev = base();
    ev.assessments[1].at = "2027-01-01";
    const next = appendAssessments(
      ev,
      [{ ...planAssessments(ev, article.facts, texts, { now })[0] }],
      now,
    );
    expect(next.assessments[2].at).toBe("2027-01-01");
  });
});
