import { describe, expect, it } from "vitest";
import { contentProblems } from "./build.ts";
import type { Article, Fact } from "./content-types.ts";
import {
  applyDecisions,
  articleHash,
  type Bank,
  closedForm,
  type Decision,
  DecisionError,
  type PrintedCard,
  PrintedCardSchema,
  rankCandidates,
} from "./ingest.ts";

const TIMELINE = {
  kind: "event" as const,
  start: "1901",
  end: null,
  precision: "year" as const,
  approx: false,
  ongoing: false,
  labelEn: "Event",
  labelDe: "Ereignis",
};
const SOURCE = { url: "https://example.org/x", title: "X", lang: "en" };

function fact(n: number, answer: string, printed: boolean): Fact {
  const id = `f${String(n).padStart(5, "0")}`;
  return {
    id,
    answerEn: answer,
    answerDe: answer,
    spans: { en: [0, 1], de: [0, 1] },
    timeline: TIMELINE,
    source: SOURCE,
    wordings: [
      printed
        ? {
            id: `w${id.slice(1)}`,
            en: `Which element is ${answer}?`,
            de: `Welches Element ist ${answer}?`,
            origin: "printed",
            printed: { source: "quiztopia", card: "c001", category: n },
          }
        : {
            id: `w${id.slice(1)}`,
            en: `Which metal is ${answer}?`,
            de: `Welches Metall ist ${answer}?`,
            origin: "generated",
          },
    ],
  };
}

function respanned(a: Article): Article {
  for (const f of a.facts) {
    f.spans = {
      en: [a.bodyEn.indexOf(f.answerEn), f.answerEn.length],
      de: [a.bodyDe.indexOf(f.answerDe), f.answerDe.length],
    };
  }
  return a;
}

function bank(): Bank {
  const gold = respanned({
    id: "a0001",
    domain: "science",
    sub: "chemistry",
    titleEn: "Gold",
    titleDe: "Gold",
    bodyEn: "Gold is Au. Silver is Ag.",
    bodyDe: "Gold ist Au. Silber ist Ag.",
    notesEn: "",
    notesDe: "",
    images: [],
    facts: [fact(1, "Au", true), fact(2, "Ag", false)],
  });
  return {
    articles: [gold],
    sources: [
      {
        source: "quiztopia",
        cards: [{ id: "c001", image: "c001.jpg", slots: [{ category: 1, wordingId: "w00001" }] }],
      },
    ],
  };
}

function tpCard(): PrintedCard {
  const q = (category: number, en: string, answer: string) => ({
    category,
    cardDe: `${en} (de)`,
    en,
    de: `${en} (de)`,
    reworked: false,
    domain: "science",
    sub: "chemistry",
    answerEn: answer,
    answerDe: answer,
    timeline: TIMELINE,
    source: SOURCE,
    notes: "",
  });
  return {
    source: "trivial-pursuit",
    card: "tp-0001",
    image: "tp-0001.jpg",
    questions: [
      q(1, "What is the chemical symbol of gold?", "Au"),
      q(2, "Which metal has the symbol Pt?", "Pt"),
      q(3, "Who wrote Faust?", "Goethe"),
      q(4, "Which river flows through Vienna?", "Danube"),
      q(5, "What is H2O?", "Water"),
      q(6, "How many players in a football team?", "Eleven"),
    ],
  };
}

/** The fixture's one-slot Quiztopia card is short by design; everything else must be sound. */
const problems = (b: Bank) =>
  contentProblems(b.articles, b.sources).filter((p) => !p.startsWith("quiztopia/c001: 1 slots"));

const text = (en: string, de: string) => ({
  titleEn: "T",
  titleDe: "T",
  bodyEn: en,
  bodyDe: de,
  notesEn: "",
  notesDe: "",
});

describe("PrintedCardSchema", () => {
  it("wants one question per category, in order", () => {
    expect(PrintedCardSchema.safeParse(tpCard()).success).toBe(true);
    const short = { ...tpCard(), questions: tpCard().questions.slice(0, 5) };
    expect(PrintedCardSchema.safeParse(short).success).toBe(false);
  });

  it("takes an English card's full text and an open, reworked question", () => {
    const q = (category: number) => ({
      ...tpCard().questions[0],
      category,
      cardDe: undefined,
      cardText: "[Chemistry] Which element is Au?\nA. Gold\nB. Silver\nC. Lead\nAnswer: A. Gold.",
      discipline: "Chemistry",
      en: "Which element has the symbol Au?",
      de: "Welches Element hat das Symbol Au?",
      reworked: true,
    });
    const card = {
      source: "publish-or-perish",
      card: "pp-001",
      image: "p.jpg",
      questions: [q(1), q(2)],
    };
    expect(PrintedCardSchema.safeParse(card).success).toBe(true);
    // Not reworked, the open question must be the card's own.
    const unreworked = { ...card, questions: [{ ...q(1), reworked: false }, q(2)] };
    expect(PrintedCardSchema.safeParse(unreworked).success).toBe(false);
    // Without the card's words at all.
    const bare = { ...card, questions: [{ ...q(1), cardText: undefined }, q(2)] };
    expect(PrintedCardSchema.safeParse(bare).success).toBe(false);
  });
});

describe("closedForm", () => {
  it("spots yes/no and pick-from-a-list questions", () => {
    expect(
      closedForm("Der Erfinder der Blindenschrift war selbst blind. Richtig oder falsch?"),
    ).toBe(true);
    expect(
      closedForm(
        "Welcher Privatsender sendete erstmals 1984 aus Dudelange: RTL, ProSieben oder Kabel eins?",
      ),
    ).toBe(true);
    expect(closedForm("Wer stand 1974 nicht im Tor: Sepp Maier oder Rudi Kargus?")).toBe(true);
    expect(closedForm("Wie viele Tordurchgänge hat das Brandenburger Tor?")).toBe(false);
    expect(closedForm("Welches Land liegt zwischen Spanien und Frankreich?")).toBe(false);
  });
});

describe("rankCandidates", () => {
  it("ranks the same answer first", () => {
    const { facts } = rankCandidates(bank().articles, tpCard().questions[0]);
    expect(facts[0]).toMatchObject({ factId: "f00001", sameAnswer: true });
  });
});

describe("applyDecisions", () => {
  const b = bank();
  const ref = (category: number) => ({ card: "tp-0001", category });
  const chemistry: Decision = {
    source: "trivial-pursuit",
    bucket: "science/chemistry",
    handoff: [],
    operations: [
      { op: "alias", printed: ref(1), factId: "f00001" },
      {
        op: "add-facts",
        articleId: "a0001",
        baseHash: articleHash(b.articles[0]),
        facts: [{ printed: ref(2) }],
        drop: [],
        article: text("Gold is Au, silver Ag, platinum Pt.", "Gold ist Au, Silber Ag, Platin Pt."),
      },
    ],
  };
  const classics: Decision = {
    source: "trivial-pursuit",
    bucket: "literature/classics",
    handoff: [],
    operations: [3, 4, 5, 6].map((n) => ({
      op: "new-article" as const,
      facts: [{ printed: ref(n) }],
      article: text(
        `About ${tpCard().questions[n - 1].answerEn}.`,
        `Über ${tpCard().questions[n - 1].answerDe}.`,
      ),
    })),
  };

  it("aliases, adds, creates and records the printed card", () => {
    const { bank: next, summary } = applyDecisions(b, [tpCard()], [chemistry, classics]);
    expect(summary).toMatchObject({ aliases: 1, newFacts: 5, newArticles: 4 });
    expect(problems(next)).toEqual([]);
    const gold = next.articles.find((a) => a.id === "a0001");
    expect(gold?.facts.map((f) => f.answerEn)).toEqual(["Au", "Ag", "Pt"]);
    expect(gold?.facts[0].wordings).toHaveLength(2);
    const tp = next.sources.find((s) => s.source === "trivial-pursuit");
    expect(tp?.cards[0].slots).toHaveLength(6);
    // New articles land in the bucket that created them.
    expect(next.articles.filter((a) => a.sub === "classics")).toHaveLength(4);
    expect(b.articles[0].facts).toHaveLength(2); // the input is untouched
  });

  it("retires a homebrew wording once a card prints its question", () => {
    const onSilver = structuredClone(chemistry);
    for (const op of onSilver.operations) if (op.op === "alias") op.factId = "f00002";
    const { bank: next } = applyDecisions(b, [tpCard()], [onSilver, classics]);
    expect(problems(next)).toEqual([]);
    const silver = next.articles[0].facts.find((f) => f.id === "f00002");
    expect(silver?.wordings.map((w) => w.origin)).toEqual(["printed"]);
    expect(silver?.retiredWordings).toMatchObject([
      { id: "w00002", origin: "generated", retired: { replacedBy: [silver?.wordings[0].id] } },
    ]);
  });

  it("flags a homebrew wording left in play beside a printed one", () => {
    const next = structuredClone(b);
    const silver = next.articles[0].facts[1];
    silver.wordings.push({
      id: "w00009",
      en: "Which element is Ag?",
      de: "Welches Element ist Ag?",
      origin: "printed",
      printed: { source: "quiztopia", card: "c001", category: 2 },
    });
    expect(problems(next)).toContain(
      "w00002: homebrew wording of f00002, which a game prints — retire it",
    );
  });

  it("validates one bucket on its own with `partial`", () => {
    const { summary, bank: next } = applyDecisions(b, [tpCard()], [chemistry], { partial: true });
    expect(summary.unused).toEqual(["tp-0001#3", "tp-0001#4", "tp-0001#5", "tp-0001#6"]);
    expect(next.sources).toBe(b.sources);
  });

  it("keeps a reworked question's card text", () => {
    const card = tpCard();
    card.questions[2] = {
      ...card.questions[2],
      cardDe: "Faust stammt von Goethe. Richtig oder falsch?",
      reworked: true,
    };
    const { bank: next } = applyDecisions(b, [card], [chemistry, classics]);
    const w = next.articles
      .flatMap((a) => a.facts)
      .flatMap((f) => f.wordings)
      .find((x) => x.printed?.category === 3);
    expect(w?.cardText).toBe("Faust stammt von Goethe. Richtig oder falsch?");
  });

  it("refuses a rewrite that loses an answer", () => {
    const bad = structuredClone(chemistry);
    const op = bad.operations[1];
    if (op.op === "add-facts")
      op.article = text("Gold is Au, platinum Pt.", "Gold ist Au, Platin Pt.");
    expect(() => applyDecisions(b, [tpCard()], [bad, classics])).toThrow(
      /"Ag" is not in the English text/,
    );
  });

  it("refuses an unused or twice-used printed question", () => {
    expect(() => applyDecisions(b, [tpCard()], [chemistry])).toThrow(/not used: tp-0001#3/);
    expect(() => applyDecisions(b, [tpCard()], [chemistry, classics, chemistry])).toThrow(
      DecisionError,
    );
  });

  it("refuses to touch another bucket's article", () => {
    const wrong = { ...chemistry, bucket: "literature/classics" };
    expect(() => applyDecisions(b, [tpCard()], [wrong, classics])).toThrow(/not this bucket/);
  });

  it("refuses a decision written against an article that has since changed", () => {
    const changed = bank();
    changed.articles[0].titleEn = "Gold (element)";
    expect(() => applyDecisions(changed, [tpCard()], [chemistry, classics])).toThrow(
      /changed since/,
    );
  });

  it("never drops a printed fact", () => {
    const bad = structuredClone(chemistry);
    const op = bad.operations[1];
    if (op.op === "add-facts") op.drop = ["f00001"];
    expect(() => applyDecisions(b, [tpCard()], [bad, classics])).toThrow(
      /is printed; never dropped/,
    );
  });

  it("splits an article, keeping every fact's id", () => {
    const split: Decision = {
      ...chemistry,
      operations: [
        { op: "alias", printed: ref(1), factId: "f00001" },
        {
          op: "split",
          articleId: "a0001",
          baseHash: articleHash(b.articles[0]),
          parts: [
            {
              domain: "science",
              sub: "chemistry",
              factIds: ["f00001"],
              facts: [{ printed: ref(2) }],
              article: text("Gold is Au; platinum Pt.", "Gold ist Au; Platin Pt."),
            },
            {
              domain: "science",
              sub: "chemistry",
              factIds: ["f00002"],
              facts: [],
              article: text("Silver is Ag.", "Silber ist Ag."),
            },
          ],
        },
      ],
    };
    const { bank: next, summary } = applyDecisions(b, [tpCard()], [split, classics]);
    expect(summary.splits).toEqual(["a0001"]);
    expect(problems(next)).toEqual([]);
    const silver = next.articles.find((a) => a.facts.some((f) => f.id === "f00002"));
    expect(silver?.id).not.toBe("a0001");
  });

  it("keeps the article's retired facts on the part that keeps its id", () => {
    const withRetired = structuredClone(b);
    withRetired.articles[0].retired = [
      { ...fact(9, "Cu", false), retired: { at: "2026-01-01", reason: "A duplicate." } },
    ];
    const split: Decision = {
      ...chemistry,
      operations: [
        { op: "alias", printed: ref(1), factId: "f00001" },
        { op: "alias", printed: ref(2), factId: "f00002" },
        {
          op: "split",
          articleId: "a0001",
          baseHash: articleHash(withRetired.articles[0]),
          parts: [
            {
              domain: "science",
              sub: "chemistry",
              factIds: ["f00001"],
              facts: [],
              article: text("Gold is Au.", "Gold ist Au."),
            },
            {
              domain: "science",
              sub: "chemistry",
              factIds: ["f00002"],
              facts: [],
              article: text("Silver is Ag.", "Silber ist Ag."),
            },
          ],
        },
      ],
    };
    const { bank: next } = applyDecisions(withRetired, [tpCard()], [split, classics]);
    expect(next.articles.find((a) => a.id === "a0001")?.retired?.map((f) => f.id)).toEqual([
      "f00009",
    ]);
  });
});
