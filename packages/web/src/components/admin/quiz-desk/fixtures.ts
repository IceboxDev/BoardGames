import {
  QuizDeskBacklogResponseSchema,
  type QuizDeskProvenance,
  QuizDeskProvenanceSchema,
  QuizDeskRetiredRowSchema,
  QuizDeskSummarySchema,
  type QuizDeskTargetLabel,
} from "@boardgames/core/protocol/http/quiz-desk";
import { BacklogItemSchema } from "@boardgames/core/quiz/backlog-types";
import { DOMAINS } from "../../../trainers/quiz/domains";
import type { QuizDeskApi } from "./api";
import { filterBacklog, filterRetired, page, SHAPE_TARGET } from "./logic";

// Fixture data for `/dev/quiz-desk` and the desk's tests — every payload
// parsed with the protocol's own schemas, so a fixture that drifts from the
// wire shape fails loudly. `fixtureQuizDeskApi` answers like the server
// (filters, order, pagination) from these lists.

const PHOTO =
  "https://media.githubusercontent.com/media/IceboxDev/BoardGames/master/packages/quiz-archive/photos/quiztopia";

// ── Summary ──────────────────────────────────────────────────────────────

/** Deviations from the target shape for a few domains (the rest sit on it). */
const OFF_SHAPE: Record<string, number[]> = {
  history: [0, 0, 0, 1, 31, 118, 30, 10, 10],
  science: [0, 0, 0, 0, 30, 121, 29, 10, 10],
  geography: [0, 0, 0, 0, 30, 119, 30, 10, 10],
};

function shapeOf(byFactCount: number[]) {
  return {
    articles: byFactCount.reduce((s, n) => s + n, 0),
    facts: byFactCount.reduce((s, n, i) => s + n * i, 0),
    byFactCount,
  };
}

const shape = Object.fromEntries(
  DOMAINS.map((d) => [d.slug, shapeOf(OFF_SHAPE[d.slug] ?? [...SHAPE_TARGET])]),
);

const grades = Object.fromEntries(
  DOMAINS.map((d, i) => {
    const facts = shape[d.slug]?.facts ?? 0;
    const A = 20 + ((i * 37) % 90);
    const B = 60 + ((i * 53) % 140);
    const C = 180 + ((i * 71) % 160);
    const D = 90 + ((i * 29) % 120);
    return [d.slug, { A, B, C, D, E: Math.max(0, facts - A - B - C - D) }];
  }),
);

const gradeTotals = { A: 0, B: 0, C: 0, D: 0, E: 0 };
for (const g of Object.values(grades)) {
  gradeTotals.A += g.A;
  gradeTotals.B += g.B;
  gradeTotals.C += g.C;
  gradeTotals.D += g.D;
  gradeTotals.E += g.E;
}

const codes = (n: Partial<Record<string, number>>) => ({
  duplicate: 0,
  "off-topic": 0,
  giveaway: 0,
  "non-trivia": 0,
  outdated: 0,
  wrong: 0,
  "superseded-by-print": 0,
  "quota-trim": 0,
  distasteful: 0,
  merged: 0,
  split: 0,
  other: 0,
  none: 0,
  ...n,
});

export const FIXTURE_SUMMARY = QuizDeskSummarySchema.parse({
  contentVersion: "3f9c2a71be04",
  shape,
  grades,
  gradeTotals,
  evidenceArticles: 2800,
  backlog: {
    total: 9,
    byStatus: { open: 5, doing: 1, done: 2, wontfix: 1 },
    byKind: {
      verify: 2,
      research: 1,
      "photo-check": 2,
      stale: 1,
      report: 1,
      rework: 1,
      idea: 1,
      candidate: 0,
    },
  },
  retired: {
    facts: codes({
      duplicate: 41,
      "quota-trim": 312,
      "superseded-by-print": 88,
      wrong: 6,
      none: 17,
    }),
    wordings: codes({ "superseded-by-print": 640, duplicate: 12 }),
    articles: codes({ merged: 9, "quota-trim": 22, "off-topic": 3 }),
  },
});

// ── Backlog ──────────────────────────────────────────────────────────────

const BACKLOG_ITEMS = [
  {
    id: "b00001",
    kind: "photo-check",
    target: "quiztopia/c001",
    priority: 2,
    status: "open",
    created: "2026-10-21",
    by: "quiz-ingest",
    run: "tp-enrich",
    notes: "Category 3 answer is half cut off on the photo — re-shoot or check the box copy.",
    links: [`${PHOTO}/c001.jpg`, "quiz-archive/transcripts/quiztopia/c001.json"],
  },
  {
    id: "b00002",
    kind: "verify",
    target: "f00002",
    priority: 1,
    status: "open",
    created: "2026-10-22",
    by: "crawler",
    run: "evidence-backfill-2026-10-23",
    notes: "Answer not found verbatim on the cited page (spelling: Hoffmann von Fallersleben).",
    links: [],
  },
  {
    id: "b00003",
    kind: "stale",
    target: "f00213",
    priority: 2,
    status: "doing",
    created: "2026-10-20",
    by: "owner",
    notes: "Record holder may have changed in 2026.",
    links: ["https://en.wikipedia.org/wiki/List_of_world_records_in_athletics"],
  },
  {
    id: "b00004",
    kind: "report",
    target: "report:12",
    priority: 1,
    status: "open",
    created: "2026-10-22",
    by: "coordinator",
    notes: "Member says the year is wrong (1952, not 1953).",
    links: [],
  },
  {
    id: "b00005",
    kind: "rework",
    target: "a0001:body",
    priority: 3,
    status: "open",
    created: "2026-10-19",
    by: "owner",
    notes: "Body repeats the anthem history twice; tighten.",
    links: [],
  },
  {
    id: "b00006",
    kind: "idea",
    target: "domain:history",
    priority: 4,
    status: "open",
    created: "2026-10-12",
    by: "owner",
    notes: "More questions about the Hanseatic League.",
    links: [],
  },
  {
    id: "b00007",
    kind: "research",
    target: "a0042",
    priority: 3,
    status: "done",
    created: "2026-10-10",
    by: "research batch 07",
    run: "research-07",
    notes: "Find a primary source for the founding date.",
    links: ["quiz-archive/runs/research-07/report.md"],
    closedBy: "a0042#4",
    closedAt: "2026-10-18",
  },
  {
    id: "b00008",
    kind: "verify",
    target: "w00006",
    priority: 2,
    status: "done",
    created: "2026-10-11",
    by: "crawler",
    notes: "Wording matches the card after OCR re-check.",
    links: [],
    closedBy: "a0002#7",
    closedAt: "2026-10-12",
  },
  {
    id: "b00009",
    kind: "photo-check",
    target: "trivial-pursuit/k117",
    priority: 4,
    status: "wontfix",
    created: "2026-10-05",
    by: "quiz-ingest",
    notes: "Blurry corner, but every question is legible.",
    links: [],
    closeReason: "Legible enough; nothing to fix.",
    closedAt: "2026-10-06",
  },
].map((b) => BacklogItemSchema.parse(b));

const TARGETS: Record<string, QuizDeskTargetLabel> = {
  "quiztopia/c001": {
    kind: "card",
    label: "Quiztopia c001",
    articleId: "a0001",
    domain: "music-stage",
    retired: false,
  },
  f00002: {
    kind: "fact",
    label: "Who wrote the lyrics of the „Lied der Deutschen“?",
    articleId: "a0001",
    domain: "music-stage",
    retired: false,
  },
  f00213: {
    kind: "fact",
    label: "Who holds the men's 100 m world record?",
    articleId: "a0043",
    domain: "sport-games",
    retired: false,
  },
  "report:12": {
    kind: "report",
    label: "Report #12",
    articleId: null,
    domain: null,
    retired: false,
  },
  "a0001:body": {
    kind: "body",
    label: "Two Germanys, Two Anthems, and a Children's Hymn",
    articleId: "a0001",
    domain: "music-stage",
    retired: false,
  },
  "domain:history": {
    kind: "domain",
    label: "History",
    articleId: null,
    domain: "history",
    retired: false,
  },
  a0042: {
    kind: "article",
    label: "The Hanseatic League",
    articleId: "a0042",
    domain: "history",
    retired: false,
  },
  w00006: {
    kind: "wording",
    label: "Wer komponierte die Melodie des Deutschlandlieds?",
    articleId: "a0001",
    domain: "music-stage",
    retired: true,
  },
  "trivial-pursuit/k117": {
    kind: "card",
    label: "Trivial Pursuit k117",
    articleId: null,
    domain: null,
    retired: false,
  },
};

const ARTICLE_OF: Record<string, string> = {
  "quiztopia/c001": "a0001",
  f00002: "a0001",
  "a0001:body": "a0001",
  w00006: "a0001",
  f00213: "a0043",
};

// ── Retired ──────────────────────────────────────────────────────────────

const RETIRED_ROWS = [
  {
    kind: "fact",
    id: "f00999",
    articleId: "a0001",
    articleTitle: { en: "Two Germanys, Two Anthems, and a Children's Hymn", de: "Zwei Hymnen" },
    domain: "music-stage",
    question: {
      en: "Which anthem did the GDR adopt in 1949?",
      de: "Welche Hymne führte die DDR 1949 ein?",
    },
    answer: { en: "Auferstanden aus Ruinen", de: "Auferstanden aus Ruinen" },
    at: "2026-10-22",
    code: "duplicate",
    reason: "Asks the same as Q4 in other words.",
    replacedBy: ["f00004"],
    inRetiredArticle: false,
  },
  {
    kind: "wording",
    id: "w00006",
    articleId: "a0001",
    articleTitle: { en: "Two Germanys, Two Anthems, and a Children's Hymn", de: "Zwei Hymnen" },
    domain: "music-stage",
    question: {
      en: "Who composed the melody of the Deutschlandlied?",
      de: "Wer komponierte die Melodie des Deutschlandlieds?",
    },
    answer: { en: "Joseph Haydn", de: "Joseph Haydn" },
    at: "2026-10-21",
    code: "superseded-by-print",
    reason: "Trivial Pursuit prints this question; the generated wording leaves play.",
    printed: { source: "trivial-pursuit", card: "k042", category: 2 },
    inRetiredArticle: false,
  },
  {
    kind: "article",
    id: "a0187",
    articleId: "a0187",
    articleTitle: { en: "Board Game Cafés", de: "Brettspielcafés" },
    domain: "sport-games",
    question: null,
    answer: null,
    at: "2026-10-20",
    code: "quota-trim",
    reason: "Domain over quota; the weakest article went to keep 200.",
    inRetiredArticle: true,
  },
  {
    kind: "fact",
    id: "f00777",
    articleId: "a0187",
    articleTitle: { en: "Board Game Cafés", de: "Brettspielcafés" },
    domain: "sport-games",
    question: { en: "In which city opened the first board game café?", de: "Wo eröffnete…?" },
    answer: { en: "Toronto", de: "Toronto" },
    at: "2026-10-20",
    code: "quota-trim",
    reason: "Left with its article.",
    inRetiredArticle: true,
  },
  {
    kind: "fact",
    id: "f00123",
    articleId: "a0025",
    articleTitle: { en: "The Printing Press", de: "Der Buchdruck" },
    domain: "technology",
    question: { en: "When did Gutenberg print his Bible?", de: "Wann druckte Gutenberg…?" },
    answer: { en: "around 1455", de: "um 1455" },
    at: "2026-09-30",
    reason: "Retired before codes existed: the date range was disputed.",
    inRetiredArticle: false,
  },
  {
    kind: "article",
    id: "a0310",
    articleId: "a0310",
    articleTitle: { en: "Opera Houses of Italy", de: "Opernhäuser Italiens" },
    domain: "music-stage",
    question: null,
    answer: null,
    at: "2026-10-18",
    code: "merged",
    reason: "Merged into the article on La Scala.",
    replacedBy: ["a0311"],
    inRetiredArticle: true,
  },
].map((r) => QuizDeskRetiredRowSchema.parse(r));

// ── Provenance ───────────────────────────────────────────────────────────

const TRANSCRIPT_C001 = {
  category: 1,
  cardDe:
    "Wer schrieb das Gedicht „Kinderhymne“ als Antwort auf die Einführung des „Liedes der Deutschen“ als Nationalhymne der BRD?",
  cardText: null,
  question: {
    en: "Who wrote the poem „Kinderhymne“ in response to the „Lied der Deutschen“ becoming the anthem?",
    de: "Wer schrieb das Gedicht „Kinderhymne“?",
  },
  answer: { en: "Bertolt Brecht", de: "Bertolt Brecht" },
  notes: "Answer printed upside down at the card's foot; umlauts verified against the photo.",
  reworked: false,
  discipline: null,
  source: {
    url: "https://de.wikipedia.org/wiki/Kinderhymne",
    title: "Kinderhymne – Wikipedia",
    lang: "de",
  },
};

const PROVENANCE_A0001 = QuizDeskProvenanceSchema.parse({
  contentVersion: "3f9c2a71be04",
  article: {
    id: "a0001",
    domain: "music-stage",
    sub: "classical",
    title: {
      en: "Two Germanys, Two Anthems, and a Children's Hymn",
      de: "Zwei deutsche Staaten, zwei Hymnen und eine Kinderhymne",
    },
    notes: { en: "", de: "" },
    tags: ["topic:music/anthems", "region:de"],
    derivedTags: ["era:m2/c20"],
    tagLabels: {
      "topic:music/anthems": { en: "Music › Anthems", de: "Musik › Hymnen" },
      "region:de": { en: "Germany", de: "Deutschland" },
      "era:m2/c20": { en: "20th century", de: "20. Jahrhundert" },
    },
    entities: [
      { qid: "Q154679", label: "Kinderhymne", role: "subject" },
      { qid: "Q25348", label: "Deutschlandlied", role: "mentioned" },
    ],
    retired: null,
    hasEvidence: true,
  },
  facts: [
    {
      id: "f00001",
      question: {
        en: "Who wrote the poem „Die Kinderhymne“ in response to the adoption of the „Lied der Deutschen“ as the national anthem?",
        de: "Wer schrieb das Gedicht „Die Kinderhymne“?",
      },
      answer: { en: "Bertolt Brecht", de: "Bertolt Brecht" },
      retired: null,
      cited: {
        url: "https://de.wikipedia.org/wiki/Kinderhymne",
        title: "Kinderhymne – Wikipedia",
        lang: "de",
      },
      tags: ["topic:literature/poetry"],
      derivedTags: [],
      entities: [{ qid: "Q38757", label: "Bertolt Brecht", role: "answer" }],
      reviewBy: null,
      grade: {
        grade: "A",
        independentSources: 2,
        verbatim: 2,
        primary: 1,
        contested: false,
        latestConfidence: "high",
      },
      sources: [
        {
          id: "s1",
          url: "https://de.wikipedia.org/wiki/Kinderhymne",
          title: "Kinderhymne – Wikipedia",
          kind: "encyclopedia",
          lang: "de",
          retrievedAt: "2026-10-23T03:13:46.471Z",
          archiveUrl:
            "https://web.archive.org/web/20261023031346/https://de.wikipedia.org/wiki/Kinderhymne",
          snapshot: "48fbaf4d5a472e64f9ff66df608c58edcbbc6c8da7ecd8b6fbbe97d8a83ea8a8",
        },
        {
          id: "s7",
          url: "https://www.brecht-haus.de/werk/kinderhymne",
          title: "Kinderhymne (1950)",
          publisher: "Brecht-Haus Berlin",
          kind: "official",
          lang: "de",
          retrievedAt: "2026-10-23T04:01:12.000Z",
          snapshot: "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90",
        },
      ],
      assessments: [
        {
          id: "e1",
          at: "2026-10-23",
          target: "f00001",
          claim: "answer",
          verdict: "confirmed",
          confidence: "high",
          support: [
            {
              source: "s1",
              quote: "Die Kinderhymne ist ein Gedicht von Bertolt Brecht aus dem Jahr 1950.",
              quoteLang: "de",
              verbatim: true,
              verifiedAt: "2026-10-23T03:14:02Z",
            },
          ],
          by: "crawler",
          run: "evidence-backfill-2026-10-23",
        },
        {
          id: "e9",
          at: "2026-10-23",
          target: "f00001",
          claim: "answer",
          verdict: "confirmed",
          confidence: "high",
          support: [
            {
              source: "s7",
              quote: "Brecht schrieb die Kinderhymne 1950 als Gegenentwurf zum Deutschlandlied.",
              quoteLang: "de",
              verbatim: true,
              verifiedAt: "2026-10-23T04:01:30Z",
            },
          ],
          by: "research batch 07",
          run: "research-07",
          note: "Primary source: the Brecht estate's own catalogue.",
        },
      ],
      assessmentCount: 3,
      printedOn: [
        {
          source: "quiztopia",
          card: "c001",
          category: 1,
          wordingId: "w00001",
          retiredWording: false,
          photoUrl: `${PHOTO}/c001.jpg`,
          manifest: {
            file: "photos/quiztopia/c001.jpg",
            originalName: "IMG_4412.HEIC",
            rotate: 90,
            takenAt: "2026-09-16T19:02:11Z",
            sha256Stored: "0f1e2d3c4b5a69788796a5b4c3d2e1f00f1e2d3c4b5a69788796a5b4c3d2e1f0",
            width: 3024,
            height: 4032,
            duplicates: [`${PHOTO}/c001-2.jpg`],
          },
          transcript: TRANSCRIPT_C001,
        },
      ],
    },
    {
      id: "f00002",
      question: {
        en: "Who wrote the lyrics of the „Lied der Deutschen“?",
        de: "Wer schrieb den Text des „Liedes der Deutschen“?",
      },
      answer: {
        en: "August Heinrich Hoffmann von Fallersleben",
        de: "August Heinrich Hoffmann von Fallersleben",
      },
      retired: null,
      cited: {
        url: "https://de.wikipedia.org/wiki/Das_Lied_der_Deutschen",
        title: "Das Lied der Deutschen – Wikipedia",
        lang: "de",
      },
      tags: [],
      derivedTags: [],
      entities: [],
      reviewBy: "2027-01-01",
      grade: {
        grade: "D",
        independentSources: 1,
        verbatim: 0,
        primary: 0,
        contested: false,
        latestConfidence: "low",
      },
      sources: [
        {
          id: "s2",
          url: "https://de.wikipedia.org/wiki/Das_Lied_der_Deutschen",
          title: "Das Lied der Deutschen – Wikipedia",
          kind: "encyclopedia",
          lang: "de",
          retrievedAt: "2026-10-23T03:13:47.516Z",
        },
      ],
      assessments: [
        {
          id: "e2",
          at: "2026-10-23",
          target: "f00002",
          claim: "answer",
          verdict: "unverified",
          confidence: "low",
          support: [
            {
              source: "s2",
              quote: "August Heinrich Hoffmann von Fallersleben",
              quoteLang: "de",
              verbatim: false,
            },
          ],
          by: "backfill",
          run: "evidence-backfill-2026-10-23",
          note: "backfill: cited by fact source; transcript c001",
        },
      ],
      assessmentCount: 1,
      printedOn: [
        {
          source: "quiztopia",
          card: "c001",
          category: 2,
          wordingId: "w00002",
          retiredWording: false,
          photoUrl: `${PHOTO}/c001.jpg`,
          manifest: null,
          transcript: null,
        },
      ],
    },
    {
      id: "f00999",
      question: {
        en: "Which anthem did the GDR adopt in 1949?",
        de: "Welche Hymne führte die DDR 1949 ein?",
      },
      answer: { en: "Auferstanden aus Ruinen", de: "Auferstanden aus Ruinen" },
      retired: {
        at: "2026-10-22",
        code: "duplicate",
        reason: "Asks the same as Q4 in other words.",
        replacedBy: ["f00004"],
      },
      cited: {
        url: "https://de.wikipedia.org/wiki/Auferstanden_aus_Ruinen",
        title: "Auferstanden aus Ruinen – Wikipedia",
        lang: "de",
      },
      tags: [],
      derivedTags: [],
      entities: [],
      reviewBy: null,
      grade: {
        grade: "E",
        independentSources: 0,
        verbatim: 0,
        primary: 0,
        contested: false,
        latestConfidence: null,
      },
      sources: [],
      assessments: [],
      assessmentCount: 0,
      printedOn: [],
    },
  ],
  backlog: BACKLOG_ITEMS.filter((b) => ARTICLE_OF[b.target] === "a0001"),
  targets: TARGETS,
  reports: [
    {
      id: 12,
      target: { kind: "question", id: "f00002" },
      issue: "wrong-answer",
      status: "fixed",
      createdAt: "2026-10-22T08:12:00.000Z",
      resolvedAt: "2026-10-22T19:40:00.000Z",
      backlogId: "b00004",
      historyRef: "a0001#31",
    },
    {
      id: 14,
      target: { kind: "article", id: "a0001" },
      issue: "typo",
      status: "open",
      createdAt: "2026-10-23T07:01:00.000Z",
      resolvedAt: null,
      backlogId: null,
      historyRef: null,
    },
  ],
  history: {
    total: 34,
    byKind: {
      printed: 5,
      imported: 5,
      reworded: 3,
      corrected: 4,
      translated: 10,
      marked: 6,
      retired: 1,
    },
    lastAt: "2026-10-22",
  },
  runs: [
    { id: "evidence-backfill-2026-10-23", title: "Evidence backfill from cited sources" },
    { id: "research-07", title: "Research batch 07: primary sources for music & stage" },
    { id: "tp-enrich", title: null },
  ],
});

const PROVENANCE_A0042 = QuizDeskProvenanceSchema.parse({
  contentVersion: "3f9c2a71be04",
  article: {
    id: "a0042",
    domain: "history",
    sub: DOMAINS.find((d) => d.slug === "history")?.subs[0]?.slug ?? "general",
    title: { en: "The Hanseatic League", de: "Die Hanse" },
    notes: { en: "Founding dates vary by source.", de: "Gründungsdaten variieren." },
    tags: [],
    derivedTags: [],
    tagLabels: {},
    entities: [{ qid: "Q78967", label: "Hanseatic League", role: "subject" }],
    retired: null,
    hasEvidence: false,
  },
  facts: [
    {
      id: "f00205",
      question: {
        en: "Which city was the Hanse's capital?",
        de: "Welche Stadt war Hauptort der Hanse?",
      },
      answer: { en: "Lübeck", de: "Lübeck" },
      retired: null,
      cited: {
        url: "https://en.wikipedia.org/wiki/Hanseatic_League",
        title: "Hanseatic League",
        lang: "en",
      },
      tags: [],
      derivedTags: [],
      entities: [],
      reviewBy: null,
      grade: {
        grade: "E",
        independentSources: 0,
        verbatim: 0,
        primary: 0,
        contested: false,
        latestConfidence: null,
      },
      sources: [],
      assessments: [],
      assessmentCount: 0,
      printedOn: [],
    },
  ],
  backlog: BACKLOG_ITEMS.filter((b) => b.target === "a0042"),
  targets: TARGETS,
  reports: [],
  history: { total: 4, byKind: { created: 1, corrected: 3 }, lastAt: "2026-10-18" },
  runs: [{ id: "research-07", title: "Research batch 07: primary sources for music & stage" }],
});

export const FIXTURE_PROVENANCE: Record<string, QuizDeskProvenance> = {
  a0001: PROVENANCE_A0001,
  a0042: PROVENANCE_A0042,
};

// ── API ──────────────────────────────────────────────────────────────────

export const fixtureQuizDeskApi: QuizDeskApi = {
  id: "fixture",
  summary: async () => FIXTURE_SUMMARY,
  backlog: async (q) => {
    const all = filterBacklog(BACKLOG_ITEMS, q, (t, a) => ARTICLE_OF[t] === a);
    const { slice, nextCursor } = page(all, Number(q.limit ?? 50), q.cursor);
    const targets = Object.fromEntries(
      slice.flatMap((b) => (TARGETS[b.target] ? [[b.target, TARGETS[b.target]]] : [])),
    );
    return QuizDeskBacklogResponseSchema.parse({
      items: slice,
      targets,
      total: all.length,
      nextCursor,
    });
  },
  retired: async (q) => {
    const all = filterRetired(RETIRED_ROWS, q);
    const { slice, nextCursor } = page(all, Number(q.limit ?? 50), q.cursor);
    return { rows: slice, total: all.length, nextCursor };
  },
  provenance: async (id) => {
    const p = FIXTURE_PROVENANCE[id];
    if (!p) throw new Error(`No fixture for ${id} — try a0001 or a0042.`);
    return p;
  },
  linkReport: async (id, body) => ({
    id,
    backlogId: body.backlogId ?? null,
    historyRef: body.historyRef ?? null,
  }),
};
