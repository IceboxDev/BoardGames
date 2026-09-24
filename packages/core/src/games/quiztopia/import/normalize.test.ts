import { describe, expect, it } from "vitest";
import { QUIZTOPIA_CATEGORIES } from "../categories.ts";
import {
  CardArticlesSchema,
  CardQuestionsSchema,
  ContentIndexSchema,
  TitlesSchema,
} from "../content-types.ts";
import { QUESTIONS_PER_SET, SETS_PER_CARD } from "../ids.ts";
import {
  contentVersion,
  locateAnswerSpan,
  normalizeCards,
  type RawCard,
  type RawSource,
  type RawTimeline,
} from "./normalize.ts";

const SOURCE: RawSource = {
  url: "https://en.wikipedia.org/wiki/Hanns_Eisler",
  title: "Hanns Eisler – Wikipedia",
  lang: "en",
};

/** Every question of the corpus carries an event; the fixture's is a plain year. */
function defaultEvent(year: number, tag: string): RawTimeline {
  return {
    kind: "event",
    start: String(year),
    end: null,
    precision: "year",
    approx: false,
    ongoing: false,
    label_en: `Event ${tag}`,
    label_de: `Ereignis ${tag}`,
  };
}

/**
 * A synthetic card: 12 sets × 5 questions whose answers appear verbatim in
 * the articles — except set 1's original answer of a card tagged
 * `lowercaseFirst`, which the prose lowercases (the real corpus does this).
 */
function rawCard(image: string, tag: string, opts: { lowercaseFirst?: boolean } = {}): RawCard {
  return {
    image,
    sets: QUIZTOPIA_CATEGORIES.map((cat, i) => {
      const n = i + 1;
      const questions = Array.from({ length: QUESTIONS_PER_SET }, (_, qi) => ({
        original: qi === 0,
        en: ` Question ${tag} ${n} ${qi}? `,
        de: `Frage ${tag} ${n} ${qi}?`,
        answer_en: `Answer ${tag}-${n}-${qi}`,
        answer_de: `Antwort ${tag}-${n}-${qi}`,
        timeline: defaultEvent(1900 + n * 5 + qi, `${tag} ${n} ${qi}`),
        source: { ...SOURCE },
      }));
      const inProse = (answer: string, qi: number) =>
        opts.lowercaseFirst && n === 1 && qi === 0 ? answer.toLowerCase() : answer;
      return {
        n,
        category_en: cat.en,
        category_de: cat.de,
        questions,
        article_title_en: `Title ${tag} ${n}`,
        article_en: `Prose about ${questions.map((q, qi) => inProse(q.answer_en, qi)).join(", then ")}. End.`,
        article_title_de: `Titel ${tag} ${n}`,
        article_de: `Prosa über ${questions.map((q, qi) => inProse(q.answer_de, qi)).join(", dann ")}. Ende.`,
        enriched: true,
        notes: n === 2 ? " Misprint on the card. Kept by position. " : undefined,
        ...(n === 2
          ? {
              notes_en: " Misprint on the card. ",
              notes_de: "Fehldruck auf der Karte.",
              notes_internal: "Kept by position.",
            }
          : {}),
      };
    }),
  };
}

const AT = "2026-09-19T00:00:00.000Z";

const EISLER: RawTimeline = {
  kind: "lifespan",
  start: "1898-07-06",
  end: "1962-09-06",
  precision: "day",
  approx: false,
  ongoing: false,
  label_en: " Hanns Eisler, composer ",
  label_de: "Hanns Eisler, Komponist",
};
/** Give set `n` (1-based) of a raw card distinctive events (set 1 a lifespan, the rest BC years). */
function enrich(card: RawCard, n: number, timeline: RawTimeline = EISLER): RawCard {
  const set = card.sets[n - 1];
  set.enriched = true;
  set.questions = set.questions.map((q, qi) => ({
    ...q,
    timeline: {
      ...timeline,
      start: qi === 0 ? timeline.start : `-${44 + qi}`,
      precision: qi === 0 ? timeline.precision : "year",
      end: qi === 0 ? timeline.end : null,
      kind: qi === 0 ? timeline.kind : "event",
    },
    source: { ...SOURCE },
  }));
  return card;
}

describe("normalizeCards", () => {
  it("hands out ids in ascending stem order and validates every output file", () => {
    const out = normalizeCards({
      cards: [
        { stem: "IMG_B", card: rawCard("IMG_B.jpg", "B") },
        { stem: "IMG_A", card: rawCard("IMG_A.jpg", "A") },
      ],
      previousIndex: null,
      generatedAt: AT,
    });
    expect(out.index.cards).toEqual([
      { id: "c001", sourceImage: "IMG_A.jpg" },
      { id: "c002", sourceImage: "IMG_B.jpg" },
    ]);
    expect(out.index.counts).toEqual({ cards: 2, sets: 24, questions: 120 });
    expect(out.index.generatedAt).toBe(AT);
    expect(out.index.categories).toEqual(
      QUIZTOPIA_CATEGORIES.map(({ n, en, de, band }) => ({ n, en, de, band })),
    );
    expect(ContentIndexSchema.safeParse(out.index).success).toBe(true);
    expect(TitlesSchema.safeParse(out.titles).success).toBe(true);
    for (const q of out.questions) expect(CardQuestionsSchema.safeParse(q).success).toBe(true);
    for (const a of out.articles) expect(CardArticlesSchema.safeParse(a).success).toBe(true);

    expect(out.questions[0].sets).toHaveLength(SETS_PER_CARD);
    expect(out.questions[0].sets[0].questions[0]).toMatchObject({
      id: "c001-s01-q0",
      en: "Question A 1 0?",
      de: "Frage A 1 0?",
      answerEn: "Answer A-1-0",
      answerDe: "Antwort A-1-0",
      source: SOURCE,
    });
    // Player notes per language; the provenance and internal notes never leave the importer.
    expect(out.questions[0].sets[1].notesEn).toBe("Misprint on the card.");
    expect(out.questions[0].sets[1].notesDe).toBe("Fehldruck auf der Karte.");
    expect(out.questions[0].sets[0].notesEn).toBe("");
    expect(out.questions[0].sets[0].notesDe).toBe("");
    expect(JSON.stringify(out.questions)).not.toMatch(/Kept by position|"notes"/);
    // Every question lands in the timeline index.
    expect(out.questions[0].sets[0].questions[0].timeline?.labelEn).toBe("Event A 1 0");
    expect(Object.keys(out.timeline)).toHaveLength(120);
    expect(out.titles["c002-s12"]).toEqual(["Title B 12", "Titel B 12"]);
    expect(Object.keys(out.titles)).toHaveLength(24);
  });

  it("carries timeline events and sources from enriched sets into questions and the index", () => {
    const card = enrich(rawCard("IMG_A.jpg", "A"), 6);
    const out = normalizeCards({
      cards: [{ stem: "IMG_A", card }],
      previousIndex: null,
      generatedAt: AT,
    });
    const set = out.questions[0].sets[5];
    expect(set.questions[0].timeline).toEqual({
      kind: "lifespan",
      start: "1898-07-06",
      end: "1962-09-06",
      precision: "day",
      approx: false,
      ongoing: false,
      labelEn: "Hanns Eisler, composer",
      labelDe: "Hanns Eisler, Komponist",
    });
    expect(set.questions[0].source).toEqual(SOURCE);
    expect(set.questions[2].timeline?.start).toBe("-46");
    // The other sets keep their own events.
    expect(out.questions[0].sets[0].questions[0].timeline?.start).toBe("1905");
    expect(Object.keys(out.timeline)).toHaveLength(60);
    expect(out.timeline["c001-s06-q0"]).toEqual({
      n: 6,
      k: "lifespan",
      s: "1898-07-06",
      e: "1962-09-06",
      p: "day",
      en: "Hanns Eisler, composer",
      de: "Hanns Eisler, Komponist",
    });
    expect(out.timeline["c001-s06-q1"]).toEqual({
      n: 6,
      k: "event",
      s: "-45",
      p: "year",
      en: "Hanns Eisler, composer",
      de: "Hanns Eisler, Komponist",
    });
  });

  it("rejects a malformed event or source, a question without one, and an un-enriched set", () => {
    const bad = (mutate: (card: RawCard) => void) => {
      const card = enrich(rawCard("IMG_A.jpg", "A"), 1);
      mutate(card);
      return () => normalizeCards({ cards: [{ stem: "IMG_A", card }], previousIndex: null });
    };
    expect(
      bad((c) => {
        const t = c.sets[0].questions[0].timeline;
        if (t) t.start = "0";
      }),
    ).toThrow(/c001-s01-q0 timeline\.start/);
    expect(
      bad((c) => {
        const t = c.sets[0].questions[0].timeline;
        if (t) t.end = "1890";
      }),
    ).toThrow(/c001-s01-q0 timeline\.end: end is not after start/);
    expect(
      bad((c) => {
        const t = c.sets[0].questions[0].timeline;
        if (t) t.precision = "year";
      }),
    ).toThrow(/timeline\.precision/);
    expect(
      bad((c) => {
        const t = c.sets[0].questions[0].timeline;
        if (t) t.kind = "birthday";
      }),
    ).toThrow(/timeline\.kind/);
    expect(
      bad((c) => {
        const s = c.sets[0].questions[1].source;
        if (s) s.url = "not a url";
      }),
    ).toThrow(/c001-s01-q1 source\.url/);
    expect(
      bad((c) => {
        delete c.sets[0].questions[4].source;
      }),
    ).toThrow(/c001-s01-q4: every question needs a timeline event and a source/);
    expect(
      bad((c) => {
        c.sets[0].enriched = false;
      }),
    ).toThrow(/c001-s01-q0: every question needs/);
  });

  it("stamps the version as the recomputed content hash, sensitive to the content", () => {
    const cards = [{ stem: "IMG_A", card: rawCard("IMG_A.jpg", "A") }];
    const out = normalizeCards({ cards, previousIndex: null, generatedAt: AT });
    expect(out.index.version).toBe(
      contentVersion({
        categories: out.index.categories,
        cards: out.index.cards,
        titles: out.titles,
        questions: out.questions,
        articles: out.articles,
      }),
    );
    const edited = rawCard("IMG_A.jpg", "A");
    edited.sets[3].questions[2].en = "Something else?";
    const again = normalizeCards({
      cards: [{ stem: "IMG_A", card: edited }],
      previousIndex: null,
      generatedAt: "2030-01-01T00:00:00.000Z",
    });
    expect(again.index.version).not.toBe(out.index.version);
    // The timestamp is not part of the hash.
    const later = normalizeCards({
      cards,
      previousIndex: null,
      generatedAt: "2030-01-01T00:00:00.000Z",
    });
    expect(later.index.version).toBe(out.index.version);
  });

  it("pins ids through the previous index and appends new stems after them", () => {
    const first = normalizeCards({
      cards: [{ stem: "IMG_B", card: rawCard("IMG_B.jpg", "B") }],
      previousIndex: null,
    });
    expect(first.index.cards).toEqual([{ id: "c001", sourceImage: "IMG_B.jpg" }]);

    const second = normalizeCards({
      cards: [
        { stem: "IMG_A", card: rawCard("IMG_A.jpg", "A") },
        { stem: "IMG_B", card: rawCard("IMG_B.jpg", "B") },
      ],
      previousIndex: first.index,
    });
    // IMG_A sorts first but must NOT take c001 away from IMG_B.
    expect(second.index.cards).toEqual([
      { id: "c001", sourceImage: "IMG_B.jpg" },
      { id: "c002", sourceImage: "IMG_A.jpg" },
    ]);
    expect(second.questions.map((q) => q.id)).toEqual(["c001", "c002"]);
    expect(second.questions[1].sets[0].questions[0].en).toBe("Question A 1 0?");
  });

  it("refuses to drop a previously imported card unless allowed", () => {
    const both = normalizeCards({
      cards: [
        { stem: "IMG_A", card: rawCard("IMG_A.jpg", "A") },
        { stem: "IMG_B", card: rawCard("IMG_B.jpg", "B") },
      ],
      previousIndex: null,
    });
    const onlyB = [{ stem: "IMG_B", card: rawCard("IMG_B.jpg", "B") }];
    expect(() => normalizeCards({ cards: onlyB, previousIndex: both.index })).toThrow(
      /c001 \(IMG_A\.jpg\) is missing/,
    );
    const dropped = normalizeCards({ cards: onlyB, previousIndex: both.index, allowRemoved: true });
    expect(dropped.index.cards).toEqual([{ id: "c002", sourceImage: "IMG_B.jpg" }]);
    expect(dropped.index.counts.cards).toBe(1);
  });

  it("locates answer spans exactly, then case-insensitively", () => {
    expect(locateAnswerSpan("The Neck stiffness sign", "Neck stiffness")).toEqual([4, 14]);
    expect(locateAnswerSpan("shows neck stiffness here", "Neck stiffness")).toEqual([6, 14]);
    expect(locateAnswerSpan("nothing here", "Neck stiffness")).toBeNull();
    expect(locateAnswerSpan("a (b) c", "(b)")).toEqual([2, 3]);

    const out = normalizeCards({
      cards: [{ stem: "IMG_B", card: rawCard("IMG_B.jpg", "B", { lowercaseFirst: true }) }],
      previousIndex: null,
    });
    for (const [si, set] of out.articles[0].sets.entries()) {
      const qs = out.questions[0].sets[si].questions;
      for (const [qi, [start, len]] of set.answerSpans.en.entries()) {
        expect(set.articleEn.slice(start, start + len).toLowerCase()).toBe(
          qs[qi].answerEn.toLowerCase(),
        );
      }
      for (const [qi, [start, len]] of set.answerSpans.de.entries()) {
        expect(set.articleDe.slice(start, start + len).toLowerCase()).toBe(
          qs[qi].answerDe.toLowerCase(),
        );
      }
    }
    const [start, len] = out.articles[0].sets[0].answerSpans.en[0];
    expect(out.articles[0].sets[0].articleEn.slice(start, start + len)).toBe("answer b-1-0");
  });

  it("rejects a card whose shape or categories are off, or whose answer is not in the prose", () => {
    const short = rawCard("IMG_A.jpg", "A");
    short.sets.pop();
    expect(() =>
      normalizeCards({ cards: [{ stem: "IMG_A", card: short }], previousIndex: null }),
    ).toThrow(/expected 12 sets/);

    const wrongCat = rawCard("IMG_A.jpg", "A");
    wrongCat.sets[4].category_en = "Sports";
    expect(() =>
      normalizeCards({ cards: [{ stem: "IMG_A", card: wrongCat }], previousIndex: null }),
    ).toThrow(/category "Sports"/);

    const missing = rawCard("IMG_A.jpg", "A");
    missing.sets[6].questions[3].answer_de = "Nirgends";
    expect(() =>
      normalizeCards({ cards: [{ stem: "IMG_A", card: missing }], previousIndex: null }),
    ).toThrow(/c001-s07-q3: answer "Nirgends" not found in article_de/);

    const flag = rawCard("IMG_A.jpg", "A");
    flag.sets[0].questions[1].original = true;
    expect(() =>
      normalizeCards({ cards: [{ stem: "IMG_A", card: flag }], previousIndex: null }),
    ).toThrow(/original flag mismatch/);

    expect(() =>
      normalizeCards({
        cards: [
          { stem: "IMG_A", card: rawCard("IMG_A.jpg", "A") },
          { stem: "IMG_A", card: rawCard("IMG_A.jpg", "A") },
        ],
        previousIndex: null,
      }),
    ).toThrow(/duplicate image stem/);
  });
});
