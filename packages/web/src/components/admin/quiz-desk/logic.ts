import type {
  QuizDeskBacklogQuery,
  QuizDeskRetiredQuery,
  QuizDeskRetiredRow,
  QuizDeskSummary,
  QuizFactGrade,
  QuizGrade,
  QuizGradeCounts,
} from "@boardgames/core/protocol/http/quiz-desk";
import type { BacklogItem } from "@boardgames/core/quiz/backlog-types";
import { GRADES } from "@boardgames/core/quiz/grade";
import type { Tone } from "../../ui";

// The Quiz desk's pure side: the bank's target shape and how far each domain
// is from it, what a research grade means (the tooltip), tones, query
// strings, and the filters the fixture API applies the way the server does.

// ── Shape ────────────────────────────────────────────────────────────────

/**
 * The fixed shape every domain is filled to: `SHAPE[n]` articles with exactly
 * n active facts — 10×8, 10×7, 30×6, 120×5, 30×4 (mirrors
 * `scripts/quiz-ingest/provenance.ts:SHAPE`).
 */
export const SHAPE_TARGET: readonly number[] = [0, 0, 0, 0, 30, 120, 30, 10, 10];
/** The sizes the desk shows as columns, largest first. */
export const SHAPE_SIZES = [8, 7, 6, 5, 4] as const;
export const ARTICLES_TARGET = SHAPE_TARGET.reduce((s, n) => s + n, 0);
export const FACTS_TARGET = SHAPE_TARGET.reduce((s, n, i) => s + n * i, 0);

export interface ShapeRow {
  domain: string;
  articles: number;
  facts: number;
  /** have − want per size in `SHAPE_SIZES` order. */
  sizes: { size: number; have: number; want: number; delta: number }[];
  /** Articles with 0–3 facts (never wanted). */
  small: number;
  /** Every count matches the target. */
  ok: boolean;
  articlesDelta: number;
  factsDelta: number;
}

/** One row per domain of the summary's shape, with the deviations from the target. */
export function shapeRows(shape: QuizDeskSummary["shape"]): ShapeRow[] {
  return Object.entries(shape).map(([domain, s]) => {
    const sizes = SHAPE_SIZES.map((size) => {
      const have = s.byFactCount[size] ?? 0;
      const want = SHAPE_TARGET[size] ?? 0;
      return { size, have, want, delta: have - want };
    });
    const small = s.byFactCount.slice(0, 4).reduce((n, c) => n + c, 0);
    const articlesDelta = s.articles - ARTICLES_TARGET;
    const factsDelta = s.facts - FACTS_TARGET;
    return {
      domain,
      articles: s.articles,
      facts: s.facts,
      sizes,
      small,
      articlesDelta,
      factsDelta,
      ok: small === 0 && articlesDelta === 0 && sizes.every((x) => x.delta === 0),
    };
  });
}

/** "+3" / "−2" / "" (no deviation). */
export function formatDelta(delta: number): string {
  if (delta === 0) return "";
  return delta > 0 ? `+${delta}` : `−${-delta}`;
}

// ── Grades ───────────────────────────────────────────────────────────────

export const GRADE_TONE: Record<QuizGrade, Tone> = {
  A: "emerald",
  B: "sky",
  C: "amber",
  D: "orange",
  E: "rose",
};

/** The fill for a grade's segment in a distribution bar (full literals for Tailwind). */
export const GRADE_FILL: Record<QuizGrade, string> = {
  A: "bg-emerald-500",
  B: "bg-sky-500",
  C: "bg-amber-400",
  D: "bg-orange-500",
  E: "bg-rose-500",
};

/** What each grade needs (`core/quiz/grade.ts`). */
export const GRADE_RULE: Record<QuizGrade, string> = {
  A: "≥2 independent sources, all verbatim-verified, ≥1 primary / official / scholarly, nothing contested",
  B: "≥2 independent verbatim-verified sources, or 1 primary source verbatim-verified",
  C: "1 source with the answer verbatim-verified on its page",
  D: "a source is given, but the answer wasn't verified on it (or it has no snapshot)",
  E: "no source, or a contest / refutation nobody has resolved",
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** What would lift the fact one grade, in words; null at A. */
function nextStep(g: QuizFactGrade): string | null {
  if (g.contested) return "resolve the contest with a later confirmation";
  switch (g.grade) {
    case "A":
      return null;
    case "B":
      return "every source verbatim-verified, one of them primary / official / scholarly";
    case "C":
      return "a second independent verbatim-verified source (or make this one primary)";
    case "D":
      return "verify the answer verbatim on a source's page (quote + snapshot)";
    case "E":
      return "cite a source and verify the answer on it";
  }
}

/**
 * The grade badge's tooltip: what the grade means, the counts behind it and
 * what the next grade needs.
 */
export function gradeTooltip(g: QuizFactGrade): string {
  const lines = [
    `Grade ${g.grade}: ${GRADE_RULE[g.grade]}.`,
    `This fact: ${plural(g.independentSources, "independent source")}, ${g.verbatim} verbatim-verified, ${g.primary} primary / official / scholarly${g.contested ? ", contested or refuted (unresolved)" : ""}.`,
  ];
  if (g.latestConfidence) lines.push(`Latest assessment confidence: ${g.latestConfidence}.`);
  const next = nextStep(g);
  if (next) lines.push(`Next: ${next}.`);
  return lines.join("\n");
}

/** A distribution's segments in grade order, with shares of the total (0–1). */
export function gradeSegments(
  counts: QuizGradeCounts,
): { grade: QuizGrade; count: number; share: number }[] {
  const total = GRADES.reduce((n, g) => n + (counts[g] ?? 0), 0);
  return GRADES.map((grade) => {
    const count = counts[grade] ?? 0;
    return { grade, count, share: total === 0 ? 0 : count / total };
  });
}

// ── Backlog ──────────────────────────────────────────────────────────────

export const PRIORITY_TONE: Record<number, Tone> = {
  1: "rose",
  2: "amber",
  3: "sky",
  4: "neutral",
};

export const STATUS_TONE: Record<BacklogItem["status"], Tone> = {
  open: "amber",
  doing: "sky",
  done: "emerald",
  wontfix: "neutral",
};

/** `?a=1&b=2` from the string / number fields (empty strings dropped); "" when none. */
export function queryString(params: Readonly<Record<string, unknown>>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if ((typeof v === "string" && v !== "") || typeof v === "number") sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

/** The server's backlog order: priority, newest, id. */
export function sortBacklog(items: readonly BacklogItem[]): BacklogItem[] {
  return [...items].sort(
    (a, b) =>
      a.priority - b.priority || b.created.localeCompare(a.created) || a.id.localeCompare(b.id),
  );
}

/**
 * The backlog filter as the server applies it: status, kind and target (an
 * article id also matches its body, facts, wordings and cards — the caller
 * passes `inArticle` to resolve those).
 */
export function filterBacklog(
  items: readonly BacklogItem[],
  q: Pick<QuizDeskBacklogQuery, "status" | "kind" | "target">,
  inArticle: (target: string, articleId: string) => boolean = () => false,
): BacklogItem[] {
  return sortBacklog(
    items.filter(
      (b) =>
        (!q.status || b.status === q.status) &&
        (!q.kind || b.kind === q.kind) &&
        (!q.target || b.target === q.target || inArticle(b.target, q.target)),
    ),
  );
}

// ── Retired ──────────────────────────────────────────────────────────────

/** The retired filter as the server applies it (newest first, then id). */
export function filterRetired(
  rows: readonly QuizDeskRetiredRow[],
  q: Pick<QuizDeskRetiredQuery, "kind" | "code" | "domain" | "q">,
): QuizDeskRetiredRow[] {
  const needle = q.q?.trim().toLowerCase() ?? "";
  return rows
    .filter((r) => {
      if (q.kind && r.kind !== q.kind) return false;
      if (q.code && (r.code ?? "none") !== q.code) return false;
      if (q.domain && r.domain !== q.domain) return false;
      if (!needle) return true;
      const hay = [
        r.id,
        r.articleTitle.en,
        r.articleTitle.de,
        r.question?.en,
        r.question?.de,
        r.answer?.en,
        r.answer?.de,
        r.reason,
      ];
      return hay.some((t) => t?.toLowerCase().includes(needle));
    })
    .sort((a, b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id));
}

/** Offset pagination over an in-memory list (the fixture API). */
export function page<T>(
  rows: readonly T[],
  limit = 50,
  cursor?: string,
): { slice: T[]; nextCursor: string | null } {
  const start = cursor ? Number(cursor) : 0;
  const end = start + limit;
  return { slice: rows.slice(start, end), nextCursor: end < rows.length ? String(end) : null };
}

/** "https://www.bbc.co.uk/x" → "bbc.co.uk"; the input when it isn't a URL. */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// ── Article picker ───────────────────────────────────────────────────────

export interface PickableArticle {
  id: string;
  domain: string;
  titleEn: string;
  titleDe: string;
}

/** Articles whose id or title contains the query; an exact id first. */
export function pickArticles<T extends PickableArticle>(
  articles: readonly T[],
  query: string,
  limit = 12,
): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const exact = articles.filter((a) => a.id === q);
  const rest = articles.filter(
    (a) =>
      a.id !== q &&
      (a.id.includes(q) ||
        a.titleEn.toLowerCase().includes(q) ||
        a.titleDe.toLowerCase().includes(q)),
  );
  return [...exact, ...rest].slice(0, limit);
}
