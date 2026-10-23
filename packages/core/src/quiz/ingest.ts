// Merging a new game's printed cards into the quiz bank. Pure: the CLI
// (`scripts/quiz-ingest/`) reads and writes the files, this decides.
//
// The pipeline per card: a worker transcribes the photo into a PRINTED card
// (every question verbatim, translated, answered, dated, sourced); the bank
// is searched for CANDIDATES (facts and articles it may already cover); a
// worker writes a DECISION — for each printed question one of
//   alias        the bank already asks THIS question (same question, same
//                answer): add the printed wording to that fact. A different
//                question that shares the answer is a new fact, never an alias,
//   add-facts    a new fact for an existing article: the whole article is
//                rewritten so every answer appears (generated facts may be
//                retired to stay within 8; an article still too full splits),
//   new-article  a new topic: a new article with the printed fact and a few
//                generated ones,
// and `applyDecision` validates it and returns the new bank. Ids are
// allocated here, never by a worker.

import { createHash } from "node:crypto";
import { z } from "zod";
import { closedForm, locateAnswerSpan } from "./build.ts";

export { closedForm };

import {
  type Article,
  ArticleIdSchema,
  allWordings,
  DomainSlugSchema,
  type Fact,
  FactIdSchema,
  SourceCardIdSchema,
  type SourceCards,
  SourceIdSchema,
  SourceLinkSchema,
  SubSlugSchema,
  TimelineEventSchema,
  type Wording,
} from "./content-types.ts";
import { articleId, factId, idNumber, MAX_FACTS_PER_ARTICLE, wordingId } from "./ids.ts";
import { foldText } from "./search.ts";
import { sourceById } from "./sources.ts";
import { subOf } from "./taxonomy.ts";

// ── Printed cards ────────────────────────────────────────────────────────

/** One question as printed on the card, with what the transcriber added. */
export const PrintedQuestionSchema = z
  .object({
    /** The source's own category, 1-based (`sources.ts`). */
    category: z.number().int().min(1),
    /** The question exactly as printed on a German card (Trivial Pursuit, Quiztopia). */
    cardDe: z.string().min(1).optional(),
    /**
     * Everything the card prints for this question, verbatim in the card's
     * language — for an English card the question, its options, the answer
     * line and the explanation.
     */
    cardText: z.string().min(1).optional(),
    /** The card's own heading for the question ("Botany" on a Publish or Perish card). */
    discipline: z.string().min(1).optional(),
    /**
     * The question members are asked, an OPEN question: equal to the card's
     * question, or — when the card asks yes/no, true/false or picks from a
     * list — reworked to ask the underlying fact (`reworked: true`).
     */
    de: z.string().min(1),
    en: z.string().min(1),
    reworked: z.boolean(),
    answerDe: z.string().min(1),
    answerEn: z.string().min(1),
    timeline: TimelineEventSchema,
    source: SourceLinkSchema,
    /** Misprints, dated premises, accepted alternatives ("" when none). */
    notes: z.string().default(""),
    /** The transcriber's suggestion where the fact belongs (`taxonomy.ts`). */
    domain: DomainSlugSchema,
    sub: SubSlugSchema,
  })
  .superRefine((q, ctx) => {
    if (!subOf(q.domain, q.sub)) {
      ctx.addIssue({ code: "custom", path: ["sub"], message: `unknown sub ${q.domain}/${q.sub}` });
    }
    if (!q.cardDe && !q.cardText) {
      ctx.addIssue({
        code: "custom",
        path: ["cardText"],
        message: "the card's own words are missing",
      });
    }
    if (!q.reworked && q.cardDe && q.de !== q.cardDe) {
      ctx.addIssue({
        code: "custom",
        path: ["de"],
        message: "differs from cardDe but reworked is false",
      });
    }
    if (!q.reworked && !q.cardDe && q.cardText && q.en !== q.cardText) {
      ctx.addIssue({
        code: "custom",
        path: ["en"],
        message: "differs from cardText but reworked is false",
      });
    }
    if (closedForm(q.de) || closedForm(q.en)) {
      ctx.addIssue({ code: "custom", path: ["de"], message: "still a yes/no or choice question" });
    }
  });
export type PrintedQuestion = z.infer<typeof PrintedQuestionSchema>;

export const PrintedCardSchema = z
  .object({
    source: SourceIdSchema,
    card: SourceCardIdSchema,
    image: z.string().min(1),
    questions: z.array(PrintedQuestionSchema).min(1),
  })
  .superRefine((card, ctx) => {
    const src = sourceById(card.source);
    if (!src) return;
    if (card.questions.length !== src.questionsPerCard) {
      ctx.addIssue({
        code: "custom",
        path: ["questions"],
        message: `${src.title} cards hold ${src.questionsPerCard} questions`,
      });
    }
    card.questions.forEach((q, i) => {
      if (q.category !== i + 1) {
        ctx.addIssue({
          code: "custom",
          path: ["questions", i, "category"],
          message: "out of order",
        });
      }
    });
  });
export type PrintedCard = z.infer<typeof PrintedCardSchema>;

// ── Decisions ────────────────────────────────────────────────────────────
//
// Decisions are written per BUCKET — one (domain, sub) of the taxonomy — so
// parallel workers never touch the same article: a bucket may alias a
// printed question to any fact in the bank, but it adds facts to, splits and
// creates only articles of its own sub-category.

/** One printed question of the run: which card, which of the source's categories. */
export const PrintedRefSchema = z.object({
  card: SourceCardIdSchema,
  category: z.number().int().min(1),
});
export type PrintedRef = z.infer<typeof PrintedRefSchema>;

/** A fact the decision adds: a printed question, or one written alongside. */
const NewFactSchema = z.union([
  z.object({ printed: PrintedRefSchema }),
  z.object({
    generated: z.object({
      de: z.string().min(1),
      en: z.string().min(1),
      answerDe: z.string().min(1),
      answerEn: z.string().min(1),
      timeline: TimelineEventSchema,
      source: SourceLinkSchema,
    }),
  }),
]);
export type NewFact = z.infer<typeof NewFactSchema>;

/** A whole article text: written fresh, or rewritten so every answer appears in it. */
const ArticleTextSchema = z.object({
  titleEn: z.string().min(1),
  titleDe: z.string().min(1),
  bodyEn: z.string().min(1),
  bodyDe: z.string().min(1),
  notesEn: z.string(),
  notesDe: z.string(),
});

const OperationSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("alias"), printed: PrintedRefSchema, factId: FactIdSchema }),
  z.object({
    op: z.literal("add-facts"),
    articleId: ArticleIdSchema,
    /** `articleHash` of the article the decision was written against. */
    baseHash: z.string(),
    facts: z.array(NewFactSchema).min(1),
    /** Generated facts dropped to make room (never printed ones). */
    drop: z.array(FactIdSchema).default([]),
    article: ArticleTextSchema,
  }),
  z.object({
    op: z.literal("new-article"),
    facts: z.array(NewFactSchema).min(1),
    article: ArticleTextSchema,
  }),
  z.object({
    op: z.literal("split"),
    articleId: ArticleIdSchema,
    baseHash: z.string(),
    /** The first part keeps the article's id; every existing fact lands in exactly one part. */
    parts: z
      .array(
        z.object({
          domain: DomainSlugSchema,
          sub: SubSlugSchema,
          factIds: z.array(FactIdSchema),
          facts: z.array(NewFactSchema).default([]),
          article: ArticleTextSchema,
        }),
      )
      .min(2),
  }),
]);
export type Operation = z.infer<typeof OperationSchema>;

export const DecisionSchema = z.object({
  source: SourceIdSchema,
  /** `<domain>/<sub>` — the only articles this decision may change or create. */
  bucket: z.string().regex(/^[a-z][a-z0-9-]*\/[a-z][a-z0-9-]*$/),
  operations: z.array(OperationSchema),
  /** Printed questions that belong to another bucket (handed back to the coordinator). */
  handoff: z
    .array(
      PrintedRefSchema.extend({ domain: DomainSlugSchema, sub: SubSlugSchema, why: z.string() }),
    )
    .default([]),
});
export type Decision = z.infer<typeof DecisionSchema>;

/**
 * A stable fingerprint of an article's text and facts, so a decision can't
 * overwrite one that was rewritten under it. Wordings are left out: an alias
 * only adds a wording, and must not invalidate another decision's rewrite.
 */
export function articleHash(article: Article): string {
  const content = {
    title: [article.titleEn, article.titleDe, article.titleRu],
    body: [article.bodyEn, article.bodyDe, article.bodyRu],
    notes: [article.notesEn, article.notesDe, article.notesRu],
    facts: article.facts.map((f) => [f.id, f.answerEn, f.answerDe]),
  };
  return createHash("sha256").update(JSON.stringify(content)).digest("hex").slice(0, 12);
}

/** The first ingest run's fingerprint (the whole article); decisions written then still carry it. */
function legacyArticleHash(article: Article): string {
  return createHash("sha256").update(JSON.stringify(article)).digest("hex").slice(0, 12);
}

// ── Candidates ───────────────────────────────────────────────────────────

const STOP = new Set(
  "the a an of in on at to and or for with by from which who what when where how was is were are did does this that these his her its their de der die das und oder ein eine einer eines im in am an zu von mit welche welcher welches wer was wann wo wie war ist sind wurde hat".split(
    " ",
  ),
);

function tokens(text: string): Set<string> {
  return new Set(
    foldText(text)
      .replace(/[^\p{L}\p{N} ]/gu, " ")
      .split(" ")
      .filter((t) => t.length > 2 && !STOP.has(t)),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const t of a) if (b.has(t)) shared++;
  return shared / (a.size + b.size - shared);
}

export interface FactCandidate {
  factId: string;
  articleId: string;
  title: string;
  question: string;
  answer: string;
  score: number;
  /** The folded answers are the same — a strong hint of the same fact. */
  sameAnswer: boolean;
}

export interface ArticleCandidate {
  articleId: string;
  title: string;
  domain: string;
  sub: string;
  facts: number;
  score: number;
}

/**
 * What the bank may already know about a printed question: facts ranked by
 * answer match plus word overlap of question and answer (EN and DE), and
 * articles ranked by overlap with their title and facts.
 */
export function rankCandidates(
  articles: readonly Article[],
  q: PrintedQuestion,
  limit = 10,
): { facts: FactCandidate[]; articles: ArticleCandidate[] } {
  const qTokens = tokens(`${q.en} ${q.answerEn} ${q.de} ${q.answerDe}`);
  const answers = new Set([foldText(q.answerEn), foldText(q.answerDe)]);
  const facts: FactCandidate[] = [];
  const arts: ArticleCandidate[] = [];
  for (const a of articles) {
    const titleTokens = tokens(`${a.titleEn} ${a.titleDe}`);
    let best = 0;
    for (const f of a.facts) {
      const w = f.wordings[0];
      const sameAnswer = answers.has(foldText(f.answerEn)) || answers.has(foldText(f.answerDe));
      const overlap = jaccard(qTokens, tokens(`${w.en} ${f.answerEn} ${w.de} ${f.answerDe}`));
      const score = overlap + (sameAnswer ? 0.6 : 0) + 0.2 * jaccard(qTokens, titleTokens);
      best = Math.max(best, score);
      if (score > 0.15) {
        facts.push({
          factId: f.id,
          articleId: a.id,
          title: a.titleEn,
          question: w.en,
          answer: f.answerEn,
          score: Math.round(score * 100) / 100,
          sameAnswer,
        });
      }
    }
    const score = Math.max(best, jaccard(qTokens, titleTokens));
    if (score > 0.1) {
      arts.push({
        articleId: a.id,
        title: a.titleEn,
        domain: a.domain,
        sub: a.sub,
        facts: a.facts.length,
        score: Math.round(score * 100) / 100,
      });
    }
  }
  facts.sort((x, y) => y.score - x.score);
  arts.sort((x, y) => y.score - x.score);
  return { facts: facts.slice(0, limit), articles: arts.slice(0, 5) };
}

// ── Applying decisions ───────────────────────────────────────────────────

export interface Bank {
  articles: Article[];
  sources: SourceCards[];
}

export interface ApplySummary {
  aliases: number;
  newFacts: number;
  newArticles: number;
  rewritten: string[];
  splits: string[];
  dropped: string[];
  /** Printed questions no decision used (only allowed with `partial`). */
  unused: string[];
}

export class DecisionError extends Error {
  constructor(where: string, message: string) {
    super(`${where}: ${message}`);
    this.name = "DecisionError";
  }
}

function nextNumber(ids: Iterable<string>): number {
  let max = 0;
  for (const id of ids) max = Math.max(max, idNumber(id) ?? 0);
  return max + 1;
}

const refKey = (r: PrintedRef) => `${r.card}#${r.category}`;

const today = () => new Date().toISOString().slice(0, 10);

function clearRussianText(a: Article): void {
  delete a.titleRu;
  delete a.bodyRu;
  delete a.notesRu;
  for (const f of a.facts) delete f.spans.ru;
}

/**
 * The bank after a run's decisions, or a `DecisionError` naming what is
 * wrong: every printed question of `cards` used exactly once across all
 * decisions; a bucket changing or creating only its own sub-category's
 * articles; rewritten articles still holding every answer (spans are
 * re-located here — the enrichment pass places them properly later); no
 * article over 8 facts. `partial` validates some decisions on their own:
 * unused printed questions are listed, not refused, and no printed card is
 * recorded. Nothing is mutated.
 */
export function applyDecisions(
  bank: Bank,
  cards: readonly PrintedCard[],
  decisions: readonly Decision[],
  opts: { partial?: boolean } = {},
): { bank: Bank; summary: ApplySummary } {
  let where = "run";
  const fail = (msg: string): never => {
    throw new DecisionError(where, msg);
  };
  const source = cards[0]?.source;
  if (cards.some((c) => c.source !== source)) fail("cards from several sources in one run");
  const sourceCards = bank.sources.find((s) => s.source === source);
  for (const c of cards) {
    if (sourceCards?.cards.some((x) => x.id === c.card)) fail(`${c.card} already merged`);
  }
  const printedBy = new Map<string, PrintedQuestion>();
  for (const c of cards)
    for (const q of c.questions) printedBy.set(refKey({ card: c.card, category: q.category }), q);

  const articles = new Map(bank.articles.map((a) => [a.id, structuredClone(a)]));
  const factHome = new Map<string, string>();
  for (const a of articles.values()) for (const f of a.facts) factHome.set(f.id, a.id);
  const allIds = [...articles.values()].flatMap((a) => [
    a.id,
    ...[...a.facts, ...(a.retired ?? [])].flatMap((f) => [
      f.id,
      ...allWordings(f).map((w) => w.id),
    ]),
  ]);
  let nextArticle = nextNumber(allIds.filter((id) => id.startsWith("a")));
  let nextFact = nextNumber(allIds.filter((id) => id.startsWith("f")));
  let nextWording = nextNumber(allIds.filter((id) => id.startsWith("w")));

  const used = new Map<string, string>(); // printed ref → wording id
  const summary: ApplySummary = {
    aliases: 0,
    newFacts: 0,
    newArticles: 0,
    rewritten: [],
    splits: [],
    dropped: [],
    unused: [],
  };

  const printedOf = (r: PrintedRef): PrintedQuestion => {
    const q = printedBy.get(refKey(r));
    if (!q) return fail(`no printed question ${refKey(r)} in this run`);
    if (used.has(refKey(r))) fail(`printed question ${refKey(r)} used twice`);
    return q;
  };
  const printedWording = (r: PrintedRef, q: PrintedQuestion): Wording => {
    const id = wordingId(nextWording++);
    used.set(refKey(r), id);
    return {
      id,
      en: q.en,
      de: q.de,
      origin: "printed",
      printed: { source: source ?? "", card: r.card, category: r.category },
      ...(q.reworked ? { cardText: q.cardText ?? q.cardDe } : {}),
    };
  };
  const makeFact = (nf: NewFact): Fact => {
    summary.newFacts++;
    if ("printed" in nf) {
      const q = printedOf(nf.printed);
      return {
        id: factId(nextFact++),
        answerEn: q.answerEn,
        answerDe: q.answerDe,
        spans: { en: [0, 1], de: [0, 1] },
        timeline: q.timeline,
        source: q.source,
        wordings: [printedWording(nf.printed, q)],
      };
    }
    const g = nf.generated;
    return {
      id: factId(nextFact++),
      answerEn: g.answerEn,
      answerDe: g.answerDe,
      spans: { en: [0, 1], de: [0, 1] },
      timeline: g.timeline,
      source: g.source,
      wordings: [{ id: wordingId(nextWording++), en: g.en, de: g.de, origin: "generated" }],
    };
  };
  /** A game now prints the fact's question: its homebrew wordings leave play. */
  const retireHomebrew = (fact: Fact, printed: Wording) => {
    const homebrew = fact.wordings.filter((w) => w.origin === "generated");
    if (homebrew.length === 0) return;
    fact.wordings = fact.wordings.filter((w) => w.origin !== "generated");
    const card = `${printed.printed?.source} card ${printed.printed?.card}`;
    fact.retiredWordings = [
      ...(fact.retiredWordings ?? []),
      ...homebrew.map((w) => ({
        ...w,
        retired: {
          at: today(),
          reason: `Homebrew stand-in retired: ${card} asks the same question (${printed.id}).`,
          replacedBy: [printed.id],
        },
      })),
    ];
  };
  /** Re-locate every span against the (new) bodies; an answer the text lacks fails. */
  const respan = (a: Article): Article => {
    if (!subOf(a.domain, a.sub)) fail(`${a.id}: unknown sub ${a.domain}/${a.sub}`);
    if (a.facts.length > MAX_FACTS_PER_ARTICLE) fail(`${a.id}: ${a.facts.length} facts (max 8)`);
    for (const f of a.facts) {
      const en = locateAnswerSpan(a.bodyEn, f.answerEn);
      const de = locateAnswerSpan(a.bodyDe, f.answerDe);
      if (!en) fail(`${a.id}: "${f.answerEn}" is not in the English text`);
      if (!de) fail(`${a.id}: "${f.answerDe}" is not in the German text`);
      if (en && de) f.spans = { ...f.spans, en, de };
    }
    return a;
  };

  for (const decision of decisions) {
    where = decision.bucket;
    if (decision.source !== source) fail(`decision for ${decision.source}, cards are ${source}`);
    const [domain, sub] = decision.bucket.split("/");
    if (!subOf(domain, sub)) fail(`unknown bucket ${decision.bucket}`);
    const own = (id: string, baseHash: string): Article => {
      const a = articles.get(id);
      if (!a) return fail(`no article ${id}`);
      if (a.domain !== domain || a.sub !== sub)
        fail(`${id} is ${a.domain}/${a.sub}, not this bucket`);
      // Against the article as the earlier decisions of this run left it, so
      // a second-round decision can build on a first-round rewrite.
      const original = bank.articles.find((x) => x.id === id);
      const legacy =
        original !== undefined &&
        legacyArticleHash(original) === baseHash &&
        articleHash(original) === articleHash(a);
      if (articleHash(a) !== baseHash && !legacy) {
        fail(`${id} changed since the decision was written — rerun its merge`);
      }
      return a;
    };
    for (const op of decision.operations) {
      switch (op.op) {
        case "alias": {
          const home = articles.get(factHome.get(op.factId) ?? "");
          const fact = home?.facts.find((f) => f.id === op.factId);
          if (!fact) return fail(`no fact ${op.factId}`);
          const printed = printedWording(op.printed, printedOf(op.printed));
          fact.wordings.push(printed);
          retireHomebrew(fact, printed);
          summary.aliases++;
          break;
        }
        case "add-facts": {
          const a = own(op.articleId, op.baseHash);
          for (const id of op.drop) {
            const f = a.facts.find((x) => x.id === id);
            if (!f) fail(`${a.id} has no fact ${id} to drop`);
            if (f?.wordings.some((w) => w.origin === "printed"))
              fail(`${id} is printed; never dropped`);
          }
          // Dropped generated facts retire with the article — nothing is deleted.
          const dropped = a.facts.filter((f) => op.drop.includes(f.id));
          a.facts = a.facts.filter((f) => !op.drop.includes(f.id));
          if (dropped.length > 0) {
            a.retired = [
              ...(a.retired ?? []),
              ...dropped.map((f) => ({
                ...f,
                retired: {
                  at: today(),
                  reason: `Dropped to make room when ${decision.bucket} rewrote the article.`,
                },
              })),
            ];
          }
          summary.dropped.push(...op.drop);
          const added = op.facts.map(makeFact);
          for (const f of added) factHome.set(f.id, a.id);
          a.facts.push(...added);
          Object.assign(a, op.article);
          // The rewrite is EN/DE; a Russian text of the old article no longer matches it.
          clearRussianText(a);
          articles.set(a.id, respan(a));
          summary.rewritten.push(a.id);
          break;
        }
        case "new-article": {
          const a: Article = {
            id: articleId(nextArticle++),
            domain,
            sub,
            ...op.article,
            images: [],
            facts: op.facts.map(makeFact),
          };
          for (const f of a.facts) factHome.set(f.id, a.id);
          articles.set(a.id, respan(a));
          summary.newArticles++;
          break;
        }
        case "split": {
          const a = own(op.articleId, op.baseHash);
          const claimed = op.parts.flatMap((p) => p.factIds);
          const ownFacts = a.facts.map((f) => f.id);
          if (claimed.length !== ownFacts.length || ownFacts.some((id) => !claimed.includes(id))) {
            fail(`${a.id}: the parts must hold each of its facts exactly once`);
          }
          op.parts.forEach((part, i) => {
            const next: Article = {
              id: i === 0 ? a.id : articleId(nextArticle++),
              domain: part.domain,
              sub: part.sub,
              ...part.article,
              images: i === 0 ? a.images : [],
              facts: [
                ...part.factIds.map((id) => a.facts.find((f) => f.id === id) as Fact),
                ...part.facts.map(makeFact),
              ],
              // The article's retired facts stay with the part that keeps its id.
              ...(i === 0 && a.retired ? { retired: a.retired } : {}),
            };
            for (const f of next.facts) factHome.set(f.id, next.id);
            clearRussianText(next);
            articles.set(next.id, respan(next));
            if (i > 0) summary.newArticles++;
          });
          summary.splits.push(a.id);
          break;
        }
      }
    }
  }

  where = "run";
  summary.unused = [...printedBy.keys()].filter((k) => !used.has(k));
  if (opts.partial)
    return { bank: { articles: [...articles.values()], sources: bank.sources }, summary };
  if (summary.unused.length > 0) fail(`printed questions not used: ${summary.unused.join(", ")}`);
  const newCards = cards.map((c) => ({
    id: c.card,
    image: c.image,
    slots: c.questions.map((q) => ({
      category: q.category,
      wordingId: used.get(refKey({ card: c.card, category: q.category })) ?? "",
    })),
  }));
  const sources = sourceCards
    ? bank.sources.map((s) => (s === sourceCards ? { ...s, cards: [...s.cards, ...newCards] } : s))
    : [...bank.sources, { source: source ?? "", cards: newCards }];
  return { bank: { articles: [...articles.values()], sources }, summary };
}
