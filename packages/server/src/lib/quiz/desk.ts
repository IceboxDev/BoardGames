// The admin quiz desk's reads over the content store, the card archive and
// the report table (`auth-routes/admin-quiz-desk.ts` serves them). Nothing
// here writes content: the bank changes through `quiz-ingest` and commits.
//
// Grades are computed from the evidence ledgers by `grade.ts`, never stored.
// The per-domain distribution reads every ledger once per store (memoised —
// the content only changes with a deploy) without filling the ledger cache.

import {
  ReportIssueSchema,
  ReportStatusSchema,
  ReportTargetSchema,
} from "@boardgames/core/protocol";
import type {
  QuizDeskBacklogQuery,
  QuizDeskBacklogResponse,
  QuizDeskEvidenceSource,
  QuizDeskFact,
  QuizDeskLinkedReport,
  QuizDeskPrintedOn,
  QuizDeskProvenance,
  QuizDeskRetiredQuery,
  QuizDeskRetiredResponse,
  QuizDeskSummary,
  QuizDeskTargetLabel,
  QuizGradeCounts,
  RetiredCodeFilter,
} from "@boardgames/core/protocol/http/quiz-desk";
import { RETIRED_CODE_FILTERS } from "@boardgames/core/protocol/http/quiz-desk";
import {
  BACKLOG_KINDS,
  BACKLOG_STATUSES,
  type BacklogItem,
} from "@boardgames/core/quiz/backlog-types";
import {
  type Article,
  allWordings,
  type DomainSlug,
  type Fact,
  type RetiredFact,
} from "@boardgames/core/quiz/content-types";
import type { ArticleEvidence, Assessment } from "@boardgames/core/quiz/evidence-types";
import { factGrade, GRADES, gradeDistribution } from "@boardgames/core/quiz/grade";
import { sourceById } from "@boardgames/core/quiz/sources";
import { derivedTags, tagLabel } from "@boardgames/core/quiz/tags";
import { DOMAIN_SLUGS, QUIZ_DOMAINS } from "@boardgames/core/quiz/taxonomy";
import type { Client } from "@libsql/client";
import { z } from "zod";
import { parseRows } from "../db-rows.ts";
import { type ArchiveStore, defaultPhotoFile, photoUrl } from "./archive-store.ts";
import type { ContentStore } from "./content-store.ts";

type BacklogQuery = Omit<QuizDeskBacklogQuery, "limit"> & { limit: number };
type RetiredQuery = Omit<QuizDeskRetiredQuery, "limit"> & { limit: number };

const zeroGrades = (): QuizGradeCounts => ({ A: 0, B: 0, C: 0, D: 0, E: 0 });
const zeroCodes = (): Record<RetiredCodeFilter, number> =>
  Object.fromEntries(RETIRED_CODE_FILTERS.map((c) => [c, 0])) as Record<RetiredCodeFilter, number>;

function page<T>(all: readonly T[], limit: number, cursor: string | undefined) {
  const offset = cursor ? Number(cursor) : 0;
  const slice = all.slice(offset, offset + limit);
  const next = offset + limit;
  return { slice, total: all.length, nextCursor: next < all.length ? String(next) : null };
}

// ── Grades ─────────────────────────────────────────────────────────────

const gradeCache = new WeakMap<ContentStore, Promise<Map<string, QuizGradeCounts>>>();

/** Per domain, the grades of every active fact (facts without a ledger are E). */
export function domainGrades(store: ContentStore): Promise<Map<string, QuizGradeCounts>> {
  let pending = gradeCache.get(store);
  if (!pending) {
    pending = (async () => {
      const out = new Map<string, QuizGradeCounts>(DOMAIN_SLUGS.map((d) => [d, zeroGrades()]));
      for (const a of store.articles) {
        const evidence = store.hasEvidence(a.id) ? await store.getEvidence(a.id) : null;
        const counts = out.get(a.domain);
        if (!counts) continue;
        const dist = gradeDistribution(
          a.factIds.map((id) => factGrade(id, evidence ?? undefined).grade),
        );
        for (const g of GRADES) counts[g] += dist[g];
      }
      return out;
    })();
    pending.catch(() => gradeCache.delete(store));
    gradeCache.set(store, pending);
  }
  return pending;
}

// ── Summary ────────────────────────────────────────────────────────────

export async function deskSummary(store: ContentStore): Promise<QuizDeskSummary> {
  const grades = await domainGrades(store);
  const gradeTotals = zeroGrades();
  for (const counts of grades.values()) for (const g of GRADES) gradeTotals[g] += counts[g];

  const byStatus = Object.fromEntries(BACKLOG_STATUSES.map((s) => [s, 0])) as Record<
    (typeof BACKLOG_STATUSES)[number],
    number
  >;
  const byKind = Object.fromEntries(BACKLOG_KINDS.map((k) => [k, 0])) as Record<
    (typeof BACKLOG_KINDS)[number],
    number
  >;
  for (const b of store.backlog) {
    byStatus[b.status]++;
    byKind[b.kind]++;
  }

  const retired = { facts: zeroCodes(), wordings: zeroCodes(), articles: zeroCodes() };
  for (const r of store.retiredRows) {
    const bucket =
      r.kind === "fact"
        ? retired.facts
        : r.kind === "wording"
          ? retired.wordings
          : retired.articles;
    bucket[r.code ?? "none"]++;
  }

  return {
    contentVersion: store.version,
    shape: Object.fromEntries(DOMAIN_SLUGS.map((d) => [d, store.domainShape[d]])),
    grades: Object.fromEntries(DOMAIN_SLUGS.map((d) => [d, grades.get(d) ?? zeroGrades()])),
    gradeTotals,
    evidenceArticles: store.evidenceArticleIds.length,
    backlog: { total: store.backlog.length, byStatus, byKind },
    retired,
  };
}

// ── Target labels ──────────────────────────────────────────────────────

const domainLabel = (slug: string) => QUIZ_DOMAINS.find((d) => d.slug === slug)?.en ?? slug;

/** A backlog target in words, and the article to open for it. */
export function targetLabel(store: ContentStore, target: string): QuizDeskTargetLabel {
  const unknown: QuizDeskTargetLabel = {
    kind: "unknown",
    label: target,
    articleId: null,
    domain: null,
    retired: false,
  };
  const article = (id: string) => {
    const meta = store.getAnyArticleMeta(id);
    return meta ? { meta, retired: "retired" in meta } : null;
  };
  if (target.startsWith("domain:")) {
    const slug = target.slice(7);
    if (!(DOMAIN_SLUGS as readonly string[]).includes(slug)) return unknown;
    return {
      kind: "domain",
      label: domainLabel(slug),
      articleId: null,
      domain: slug as DomainSlug,
      retired: false,
    };
  }
  if (target.startsWith("report:")) {
    return { ...unknown, kind: "report", label: `Report #${target.slice(7)}` };
  }
  if (target.includes("/")) {
    const [source, card] = target.split("/");
    const articleId = store.cardArticles(source, card)[0];
    const a = articleId ? article(articleId) : null;
    return {
      kind: "card",
      label: `${sourceById(source)?.title ?? source} ${card}`,
      articleId: a?.meta.id ?? null,
      domain: a?.meta.domain ?? null,
      retired: a?.retired ?? false,
    };
  }
  const bodyMatch = /^(a\d{4,}):body$/.exec(target);
  if (bodyMatch || /^a\d{4,}$/.test(target)) {
    const a = article(bodyMatch ? bodyMatch[1] : target);
    if (!a) return unknown;
    return {
      kind: bodyMatch ? "body" : "article",
      label: bodyMatch ? `${a.meta.titleEn} (body)` : a.meta.titleEn,
      articleId: a.meta.id,
      domain: a.meta.domain,
      retired: a.retired,
    };
  }
  const place = store.locate(target);
  if (!place) return unknown;
  const a = article(place.articleId);
  return {
    kind: place.kind,
    label: place.questionEn,
    articleId: place.articleId,
    domain: a?.meta.domain ?? null,
    retired: place.retired || (a?.retired ?? false),
  };
}

function labelsFor(store: ContentStore, items: readonly BacklogItem[]) {
  const out: Record<string, QuizDeskTargetLabel> = {};
  for (const b of items) out[b.target] ??= targetLabel(store, b.target);
  return out;
}

// ── Backlog ────────────────────────────────────────────────────────────

/** Every target that sits inside an article: itself, its body, facts, wordings and their cards. */
async function articleTargets(store: ContentStore, articleId: string): Promise<Set<string> | null> {
  const article = await store.getArticle(articleId, { includeRetired: true });
  if (!article) return null;
  const out = new Set([article.id, `${article.id}:body`]);
  for (const f of [...article.facts, ...(article.retired ?? [])]) {
    out.add(f.id);
    for (const w of allWordings(f)) {
      out.add(w.id);
      if (w.printed) out.add(`${w.printed.source}/${w.printed.card}`);
    }
  }
  return out;
}

const PRIORITY_THEN_NEWEST = (a: BacklogItem, b: BacklogItem) =>
  a.priority - b.priority ||
  (a.created < b.created ? 1 : a.created > b.created ? -1 : 0) ||
  a.id.localeCompare(b.id);

export async function deskBacklog(
  store: ContentStore,
  q: BacklogQuery,
): Promise<QuizDeskBacklogResponse> {
  let inside: Set<string> | null = null;
  if (q.target && /^a\d{4,}$/.test(q.target)) inside = await articleTargets(store, q.target);
  const matches = store.backlog
    .filter(
      (b) =>
        (!q.status || b.status === q.status) &&
        (!q.kind || b.kind === q.kind) &&
        (!q.target || b.target === q.target || (inside?.has(b.target) ?? false)),
    )
    .sort(PRIORITY_THEN_NEWEST);
  const { slice, total, nextCursor } = page(matches, q.limit, q.cursor);
  return { items: slice, targets: labelsFor(store, slice), total, nextCursor };
}

// ── Retired ────────────────────────────────────────────────────────────

export function deskRetired(store: ContentStore, q: RetiredQuery): QuizDeskRetiredResponse {
  const needle = q.q?.toLowerCase();
  const rows = store.retiredRows
    .filter((r) => {
      if (q.kind && r.kind !== q.kind) return false;
      if (q.code && (r.code ?? "none") !== q.code) return false;
      if (q.domain && r.domain !== q.domain) return false;
      if (!needle) return true;
      return [
        r.id,
        r.reason,
        r.articleTitle.en,
        r.articleTitle.de,
        r.question?.en,
        r.question?.de,
        r.answer?.en,
        r.answer?.de,
      ].some((s) => s?.toLowerCase().includes(needle));
    })
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : a.id.localeCompare(b.id)));
  const { slice, total, nextCursor } = page(rows, q.limit, q.cursor);
  return { rows: slice, total, nextCursor };
}

// ── Provenance ─────────────────────────────────────────────────────────

/** The latest assessment per quoted source plus the latest overall, oldest first. */
function latestAssessments(mine: readonly Assessment[]): Assessment[] {
  const keep = new Set<Assessment>();
  const bySource = new Map<string, Assessment>();
  for (const a of mine) for (const s of a.support) bySource.set(s.source, a);
  for (const a of bySource.values()) keep.add(a);
  const last = mine[mine.length - 1];
  if (last) keep.add(last);
  return mine.filter((a) => keep.has(a));
}

async function printedOn(
  archive: ArchiveStore,
  fact: Fact | RetiredFact,
): Promise<QuizDeskPrintedOn[]> {
  const out: QuizDeskPrintedOn[] = [];
  const inPlay = new Set(fact.wordings.map((w) => w.id));
  for (const w of allWordings(fact)) {
    if (!w.printed) continue;
    const { source, card, category } = w.printed;
    const [manifest, transcript] = await Promise.all([
      archive.photo(source, card),
      archive.transcript(source, card, category),
    ]);
    out.push({
      source,
      card,
      category,
      wordingId: w.id,
      retiredWording: !inPlay.has(w.id),
      photoUrl: photoUrl(manifest?.file ?? defaultPhotoFile(source, card)),
      manifest,
      transcript,
    });
  }
  return out;
}

async function deskFact(
  archive: ArchiveStore,
  article: Article,
  fact: Fact | RetiredFact,
  evidence: ArticleEvidence | null,
): Promise<QuizDeskFact> {
  const mine = (evidence?.assessments ?? [])
    .map((a, i) => ({ a, i }))
    .filter(({ a }) => a.target === fact.id)
    .sort((x, y) => (x.a.at < y.a.at ? -1 : x.a.at > y.a.at ? 1 : x.i - y.i))
    .map(({ a }) => a);
  const quoted = new Set(mine.flatMap((a) => a.support.map((s) => s.source)));
  const sources: QuizDeskEvidenceSource[] = [...quoted]
    .sort((x, y) => Number(x.slice(1)) - Number(y.slice(1)))
    .flatMap((id) => {
      const s = evidence?.sources[id];
      return s ? [{ id, ...s }] : [];
    });
  const lead = fact.wordings[0];
  return {
    id: fact.id,
    question: { en: lead.en, de: lead.de },
    answer: { en: fact.answerEn, de: fact.answerDe },
    retired: "retired" in fact ? fact.retired : null,
    cited: fact.source,
    tags: fact.tags ?? [],
    derivedTags: derivedTags(article, fact),
    entities: fact.entities ?? [],
    reviewBy: fact.reviewBy ?? null,
    grade: factGrade(fact.id, evidence ?? undefined),
    sources,
    assessments: latestAssessments(mine),
    assessmentCount: mine.length,
    printedOn: await printedOn(archive, fact),
  };
}

const LinkedReportRowSchema = z.object({
  id: z.number().int(),
  target_kind: z.string(),
  target_id: z.string(),
  issue: ReportIssueSchema,
  status: ReportStatusSchema,
  created_at: z.string(),
  resolved_at: z.string().nullable(),
  backlog_id: z.string().nullable(),
  history_ref: z.string().nullable(),
});

async function linkedReports(
  db: Client,
  articleId: string,
  factIds: readonly string[],
): Promise<QuizDeskLinkedReport[]> {
  const ids = [articleId, ...factIds];
  const { rows } = await db.execute({
    sql: `SELECT id, target_kind, target_id, issue, status, created_at, resolved_at,
                 backlog_id, history_ref
            FROM quiz_reports
           WHERE target_id IN (${ids.map(() => "?").join(", ")})
           ORDER BY created_at DESC, id DESC`,
    args: ids,
  });
  return parseRows(LinkedReportRowSchema, rows, "quiz_reports.desk").map((r) => ({
    id: r.id,
    target: ReportTargetSchema.parse({ kind: r.target_kind, id: r.target_id }),
    issue: r.issue,
    status: r.status,
    createdAt: r.created_at,
    resolvedAt: r.resolved_at,
    backlogId: r.backlog_id,
    historyRef: r.history_ref,
  }));
}

/** The article's provenance; null for an id the bank doesn't have (active or retired). */
export async function deskProvenance(
  store: ContentStore,
  archive: ArchiveStore,
  db: Client,
  articleId: string,
): Promise<QuizDeskProvenance | null> {
  const article = await store.getArticle(articleId, { includeRetired: true });
  if (!article) return null;
  const [evidence, history] = await Promise.all([
    store.getEvidence(article.id),
    store.getHistory(article.id, { includeRetired: true }),
  ]);
  const allFacts = [...article.facts, ...(article.retired ?? [])];
  const facts = await Promise.all(allFacts.map((f) => deskFact(archive, article, f, evidence)));

  const inside = (await articleTargets(store, article.id)) ?? new Set<string>();
  const backlog = store.backlog.filter((b) => inside.has(b.target)).sort(PRIORITY_THEN_NEWEST);

  const stored = article.tags ?? [];
  const derived = derivedTags(article);
  const tagLabels: Record<string, { en: string; de: string }> = {};
  const registry = store.tagRegistry;
  for (const t of new Set([
    ...stored,
    ...derived,
    ...facts.flatMap((f) => [...f.tags, ...f.derivedTags]),
  ])) {
    tagLabels[t] = registry
      ? { en: tagLabel(registry, t, "en"), de: tagLabel(registry, t, "de") }
      : { en: t, de: t };
  }

  const entries = history?.entries ?? [];
  const byKind: Partial<Record<(typeof entries)[number]["kind"], number>> = {};
  let lastAt: string | null = null;
  for (const e of entries) {
    byKind[e.kind] = (byKind[e.kind] ?? 0) + 1;
    if (lastAt === null || e.at > lastAt) lastAt = e.at;
  }

  const runIds = new Set<string>();
  for (const e of entries) if (e.run) runIds.add(e.run);
  for (const a of evidence?.assessments ?? []) if (a.run) runIds.add(a.run);
  for (const b of backlog) if (b.run) runIds.add(b.run);
  const runs = await Promise.all(
    [...runIds].sort().map(async (id) => ({ id, title: await archive.runTitle(id) })),
  );

  return {
    contentVersion: store.version,
    article: {
      id: article.id,
      domain: article.domain,
      sub: article.sub,
      title: { en: article.titleEn, de: article.titleDe },
      notes: { en: article.notesEn, de: article.notesDe },
      tags: stored,
      derivedTags: derived,
      tagLabels,
      entities: article.entities ?? [],
      retired: article.articleRetired ?? null,
      hasEvidence: store.hasEvidence(article.id),
    },
    facts,
    backlog,
    targets: labelsFor(store, backlog),
    reports: await linkedReports(
      db,
      article.id,
      allFacts.map((f) => f.id),
    ),
    history: { total: entries.length, byKind, lastAt },
    runs,
  };
}
