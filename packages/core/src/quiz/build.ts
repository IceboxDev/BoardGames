// Deriving the generated files (index, meta, timeline) from the article and
// source-card files, and checking the whole bank's invariants. Node-only
// (hashing): used by the converter / ingest scripts and the integrity test,
// never by the web.

import { createHash } from "node:crypto";
import {
  type Article,
  type ContentIndex,
  type ContentMeta,
  type DomainSlug,
  type EntityLink,
  isActiveArticle,
  type SourceCards,
  type TimelineIndex,
  toTimelineIndexEntry,
} from "./content-types.ts";
import { idNumber, MAX_FACTS_PER_ARTICLE } from "./ids.ts";
import { QUIZ_SOURCES, sourceById } from "./sources.ts";
import { derivedTags, type TagRegistry, tagProblems } from "./tags.ts";
import { DOMAIN_SLUGS, subOf } from "./taxonomy.ts";

/**
 * Yes/no, true/false and pick-from-a-list questions — never asked in the
 * bank. A heuristic over the usual phrasings in English and German.
 */
export function closedForm(question: string): boolean {
  const q = question.toLowerCase();
  return (
    /richtig oder falsch|wahr oder falsch|ja oder nein|true or false|yes or no|right or wrong/.test(
      q,
    ) ||
    // "…: A, B oder C?" / "…: A, B or C?" — options listed after a colon.
    /:\s*[^:?]+,\s*[^:?]+\s+(oder|or)\s+[^:?]+\?\s*$/.test(q) ||
    // "…: A oder B?" — a pair after a colon.
    /:\s*[^:?,]+\s+(oder|or)\s+[^:?,]+\?\s*$/.test(q)
  );
}

/** Where an answer sits in a body: exact first, then case-insensitively. */
export function locateAnswerSpan(body: string, answer: string): [number, number] | null {
  const exact = body.indexOf(answer);
  if (exact >= 0) return [exact, answer.length];
  const m = new RegExp(answer.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "iu").exec(body);
  if (!m) return null;
  return [m.index, m[0].length];
}

const byId = <T extends { id: string }>(a: T, b: T) =>
  (idNumber(a.id) ?? 0) - (idNumber(b.id) ?? 0);

/** An article's index tags: its stored tags and its active facts' ∪ its derived tags, sorted. */
export function indexTags(a: Article): string[] {
  return [
    ...new Set([...(a.tags ?? []), ...a.facts.flatMap((f) => f.tags ?? []), ...derivedTags(a)]),
  ].sort();
}

/** The Wikidata ids an article and its active facts link, sorted. */
export function indexEntities(a: Article): string[] {
  const links: EntityLink[] = [...(a.entities ?? []), ...a.facts.flatMap((f) => f.entities ?? [])];
  return [...new Set(links.map((e) => e.qid))].sort(
    (x, y) => Number(x.slice(1)) - Number(y.slice(1)),
  );
}

/** The articles in play (a retired article keeps its file but leaves every generated file). */
export function activeArticles(articles: readonly Article[]): Article[] {
  return articles.filter(isActiveArticle);
}

export function buildIndex(articles: readonly Article[]): ContentIndex {
  return {
    articles: activeArticles(articles)
      .sort(byId)
      .map((a) => {
        const entities = indexEntities(a);
        return {
          id: a.id,
          domain: a.domain,
          sub: a.sub,
          titleEn: a.titleEn,
          titleDe: a.titleDe,
          ...(a.titleRu ? { titleRu: a.titleRu } : {}),
          factIds: a.facts.map((f) => f.id),
          sources: QUIZ_SOURCES.map((s) => s.id).filter((s) =>
            a.facts.some((f) => f.wordings.some((w) => w.printed?.source === s)),
          ),
          tags: indexTags(a),
          ...(entities.length > 0 ? { entities } : {}),
        };
      }),
  };
}

export function buildTimeline(articles: readonly Article[]): TimelineIndex {
  const out: TimelineIndex = {};
  for (const a of activeArticles(articles).sort(byId)) {
    for (const f of a.facts) out[f.id] = toTimelineIndexEntry(a.domain, f.timeline);
  }
  return out;
}

export interface DomainShape {
  /** Active articles in the domain. */
  articles: number;
  /** Active facts in its active articles. */
  facts: number;
  /** `byFactCount[n]` = active articles with exactly n active facts (0…8). */
  byFactCount: number[];
}

/** Per domain: how many active articles, active facts, and articles of each size. */
export function domainShape(articles: readonly Article[]): Record<DomainSlug, DomainShape> {
  const out = {} as Record<DomainSlug, DomainShape>;
  for (const d of DOMAIN_SLUGS) {
    out[d] = { articles: 0, facts: 0, byFactCount: Array(MAX_FACTS_PER_ARTICLE + 1).fill(0) };
  }
  for (const a of activeArticles(articles)) {
    const shape = out[a.domain];
    if (!shape) continue;
    shape.articles++;
    shape.facts += a.facts.length;
    shape.byFactCount[Math.min(a.facts.length, MAX_FACTS_PER_ARTICLE)]++;
  }
  return out;
}

export function buildMeta(
  articles: readonly Article[],
  sources: readonly SourceCards[],
  /** The sealed history root to carry over (`ContentMeta.historyRoot`). */
  historyRoot?: string,
): ContentMeta {
  const hash = createHash("sha256");
  for (const a of [...articles].sort(byId)) hash.update(JSON.stringify(a));
  for (const s of sources) hash.update(JSON.stringify(s));
  const printed: Record<string, number> = {};
  for (const s of sources) {
    printed[s.source] = s.cards.reduce((n, c) => n + c.slots.length, 0);
  }
  const active = activeArticles(articles);
  const retiredArticles = articles.length - active.length;
  return {
    version: hash.digest("hex").slice(0, 12),
    counts: {
      articles: active.length,
      facts: active.reduce((n, a) => n + a.facts.length, 0),
      wordings: active.reduce((n, a) => n + a.facts.reduce((m, f) => m + f.wordings.length, 0), 0),
      retired: articles.reduce((n, a) => n + (a.retired?.length ?? 0), 0),
      retiredWordings: articles.reduce(
        (n, a) =>
          n +
          [...a.facts, ...(a.retired ?? [])].reduce(
            (m, f) => m + (f.retiredWordings?.length ?? 0),
            0,
          ),
        0,
      ),
      ...(retiredArticles > 0 ? { retiredArticles } : {}),
      printed,
    },
    ...(historyRoot ? { historyRoot } : {}),
  };
}

/** A question folded for duplicate detection: lower case, no punctuation or extra spaces. */
export function foldQuestion(q: string): string {
  return q
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * Every invariant the schemas can't see on their own, as readable problems
 * (empty = sound): unique ids, spans that point at their answers, a known
 * sub-category, and printed wordings and card slots that reference each
 * other one to one. `complete` adds what the finished bank must have:
 * Russian everywhere, at least one image per article, and no yes/no or
 * pick-from-a-list question left. `tags` (the `content/tags.json` registry)
 * checks every stored tag against it. Always checked: an entity linked twice
 * in one role, retirements whose `replacedBy` names nothing (or, for an
 * article, a retired article or itself).
 */
export function contentProblems(
  articles: readonly Article[],
  sources: readonly SourceCards[],
  opts: { complete?: boolean; tags?: TagRegistry } = {},
): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  const printedWordings = new Map<string, string>();
  const questions = new Map<string, string>();
  const claim = (id: string, where: string) => {
    if (seen.has(id)) problems.push(`${where}: duplicate id ${id}`);
    seen.add(id);
  };
  const allFacts = new Set<string>();
  const allWordings = new Set<string>();
  const articleById = new Map<string, Article>();
  for (const a of articles) {
    articleById.set(a.id, a);
    for (const f of [...a.facts, ...(a.retired ?? [])]) {
      allFacts.add(f.id);
      for (const w of [...f.wordings, ...(f.retiredWordings ?? [])]) allWordings.add(w.id);
    }
  }
  const entityLinks = (id: string, links: readonly EntityLink[] | undefined) => {
    const keys = new Set<string>();
    for (const e of links ?? []) {
      const key = `${e.qid}/${e.role}`;
      if (keys.has(key)) problems.push(`${id}: entity ${e.qid} linked twice as ${e.role}`);
      keys.add(key);
    }
  };
  for (const a of articles) {
    if (opts.tags) problems.push(...tagProblems(a, opts.tags));
    entityLinks(a.id, a.entities);
    for (const f of [...a.facts, ...(a.retired ?? [])]) {
      entityLinks(f.id, f.entities);
      for (const r of ("retired" in f ? f.retired.replacedBy : undefined) ?? []) {
        if (!allFacts.has(r)) problems.push(`${f.id}: replaced by unknown fact ${r}`);
      }
      for (const w of f.retiredWordings ?? []) {
        for (const r of w.retired.replacedBy ?? []) {
          if (!allWordings.has(r)) problems.push(`${w.id}: replaced by unknown wording ${r}`);
        }
      }
    }
    for (const r of a.articleRetired?.replacedBy ?? []) {
      const by = articleById.get(r);
      if (r === a.id) problems.push(`${a.id}: retired, replaced by itself`);
      else if (!by) problems.push(`${a.id}: retired, replaced by unknown article ${r}`);
      else if (by.articleRetired) problems.push(`${a.id}: retired, replaced by retired ${r}`);
    }
  }
  for (const a of articles) {
    claim(a.id, a.id);
    if (!subOf(a.domain, a.sub)) problems.push(`${a.id}: unknown sub ${a.domain}/${a.sub}`);
    if (a.facts.length > MAX_FACTS_PER_ARTICLE) problems.push(`${a.id}: more than 8 facts`);
    if (opts.complete) {
      if (!a.titleRu || !a.bodyRu || a.notesRu === undefined)
        problems.push(`${a.id}: no Russian text`);
      if (a.images.length === 0) problems.push(`${a.id}: no image`);
    }
    for (const f of a.facts) {
      claim(f.id, a.id);
      // One question, one fact: the same question with the same answer twice is a duplicate
      // (among the articles in play — a retired article may hold what replaced it).
      const question = `${foldQuestion(f.wordings[0].en)}|${f.answerEn.trim().toLowerCase()}`;
      const twin = questions.get(question);
      if (isActiveArticle(a)) {
        if (twin) problems.push(`${f.id}: asks the same question as ${twin}`);
        else questions.set(question, f.id);
      }
      for (const lang of ["en", "de", "ru"] as const) {
        const body = { en: a.bodyEn, de: a.bodyDe, ru: a.bodyRu }[lang];
        const answer = { en: f.answerEn, de: f.answerDe, ru: f.answerRu }[lang];
        const span = f.spans[lang];
        if (lang === "ru" && (!body || !answer || !span)) {
          if (opts.complete) problems.push(`${f.id}: no Russian answer or span`);
          continue;
        }
        if (!body || !answer || !span) continue;
        const [start, len] = span;
        const slice = body.slice(start, start + len);
        if (slice.toLowerCase() !== answer.toLowerCase()) {
          problems.push(`${f.id} ${lang}: span "${slice}" != "${answer}"`);
        }
      }
      // Homebrew only stands in until a game prints the question.
      if (f.wordings.some((w) => w.printed)) {
        for (const w of f.wordings) {
          if (w.origin === "generated")
            problems.push(`${w.id}: homebrew wording of ${f.id}, which a game prints — retire it`);
        }
      }
      for (const w of f.retiredWordings ?? []) {
        claim(w.id, f.id);
        if (w.printed) {
          printedWordings.set(w.id, `${w.printed.source}/${w.printed.card}/${w.printed.category}`);
        }
      }
      for (const w of f.wordings) {
        claim(w.id, f.id);
        if (opts.complete) {
          if (!w.ru) problems.push(`${w.id}: no Russian wording`);
          if (closedForm(w.de) || closedForm(w.en))
            problems.push(`${w.id}: yes/no or choice question`);
        }
        if (w.printed) {
          if (!sourceById(w.printed.source)) problems.push(`${w.id}: unknown source`);
          printedWordings.set(w.id, `${w.printed.source}/${w.printed.card}/${w.printed.category}`);
        }
      }
    }
  }
  for (const a of articles) {
    for (const f of a.retired ?? []) {
      claim(f.id, a.id);
      for (const w of [...f.wordings, ...(f.retiredWordings ?? [])]) {
        claim(w.id, f.id);
        if (w.printed) {
          printedWordings.set(w.id, `${w.printed.source}/${w.printed.card}/${w.printed.category}`);
        }
      }
    }
  }
  const slotted = new Set<string>();
  for (const s of sources) {
    const source = sourceById(s.source);
    const cardIds = new Set<string>();
    for (const card of s.cards) {
      if (cardIds.has(card.id)) problems.push(`${s.source}/${card.id}: duplicate card`);
      cardIds.add(card.id);
      if (source && card.slots.length !== source.questionsPerCard) {
        problems.push(`${s.source}/${card.id}: ${card.slots.length} slots`);
      }
      card.slots.forEach((slot, i) => {
        if (slot.category !== i + 1)
          problems.push(`${s.source}/${card.id}: slot ${i} out of order`);
        const where = printedWordings.get(slot.wordingId);
        if (where !== `${s.source}/${card.id}/${slot.category}`) {
          problems.push(
            `${s.source}/${card.id}/${slot.category}: slot ${slot.wordingId} ≠ ${where}`,
          );
        }
        if (slotted.has(slot.wordingId)) problems.push(`${slot.wordingId}: in two slots`);
        slotted.add(slot.wordingId);
      });
    }
  }
  for (const id of printedWordings.keys()) {
    if (!slotted.has(id)) problems.push(`${id}: printed but in no card slot`);
  }
  return problems;
}
