import {
  type QuizDeskSummary,
  RETIRED_CODE_FILTERS,
} from "@boardgames/core/protocol/http/quiz-desk";
import { BACKLOG_KINDS, BACKLOG_STATUSES } from "@boardgames/core/quiz/backlog-types";
import { GRADES } from "@boardgames/core/quiz/grade";
import { cn } from "../../../lib/cn";
import { findDomain } from "../../../trainers/quiz/domains";
import { Badge, MicroLabel, StatTile, Surface } from "../../ui";
import {
  ARTICLES_TARGET,
  FACTS_TARGET,
  formatDelta,
  GRADE_FILL,
  GRADE_RULE,
  GRADE_TONE,
  gradeSegments,
  SHAPE_SIZES,
  STATUS_TONE,
  shapeRows,
} from "./logic";

// The bank at a glance: each domain's shape against the target, the grade
// distribution, the backlog and the retired counts by code.

const domainName = (slug: string) => findDomain(slug)?.en ?? slug;

function Delta({ delta }: { delta: number }) {
  if (delta === 0) return null;
  return (
    <span
      className={cn("ml-1 text-3xs font-semibold", delta > 0 ? "text-sky-300" : "text-rose-300")}
    >
      {formatDelta(delta)}
    </span>
  );
}

function ShapeTable({ summary }: { summary: QuizDeskSummary }) {
  const rows = shapeRows(summary.shape);
  const off = rows.filter((r) => !r.ok).length;
  return (
    <Surface as="section" variant="panel" padding="none" aria-label="Shape per domain">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-2">
        <h2 className="text-sm font-semibold text-fg-strong">Shape per domain</h2>
        <MicroLabel>
          target {ARTICLES_TARGET} articles · {FACTS_TARGET} facts · 10×8 10×7 30×6 120×5 30×4
          {off > 0 ? ` · ${off} off target` : " · all on target"}
        </MicroLabel>
      </div>
      <div className="overflow-x-auto border-t border-line-soft">
        <table className="w-full min-w-xl text-xs tabular-nums">
          <thead>
            <tr className="text-left text-fg-muted">
              <th className="px-3 py-1.5 font-medium">Domain</th>
              <th className="px-2 py-1.5 text-right font-medium">Articles</th>
              <th className="px-2 py-1.5 text-right font-medium">Facts</th>
              {SHAPE_SIZES.map((n) => (
                <th key={n} className="px-2 py-1.5 text-right font-medium">
                  ×{n}
                </th>
              ))}
              <th className="px-3 py-1.5 text-right font-medium" title="Articles with 0–3 facts">
                ≤3
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-soft">
            {rows.map((r) => (
              <tr key={r.domain} className={cn(!r.ok && "bg-amber-500/5")}>
                <th scope="row" className="px-3 py-1.5 text-left font-medium text-fg-primary">
                  <span className="flex items-center gap-1.5">
                    <span
                      aria-hidden="true"
                      className={cn(
                        "h-1.5 w-1.5 shrink-0 rounded-full",
                        r.ok ? "bg-emerald-400" : "bg-amber-400",
                      )}
                    />
                    {domainName(r.domain)}
                  </span>
                </th>
                <td className="px-2 py-1.5 text-right text-fg-secondary">
                  {r.articles}
                  <Delta delta={r.articlesDelta} />
                </td>
                <td className="px-2 py-1.5 text-right text-fg-secondary">
                  {r.facts}
                  <Delta delta={r.factsDelta} />
                </td>
                {r.sizes.map((s) => (
                  <td
                    key={s.size}
                    className={cn(
                      "px-2 py-1.5 text-right",
                      s.delta === 0 ? "text-fg-muted" : "font-semibold text-amber-200",
                    )}
                    title={`${s.have} articles with ${s.size} facts (target ${s.want})`}
                  >
                    {s.have}
                    <Delta delta={s.delta} />
                  </td>
                ))}
                <td
                  className={cn(
                    "px-3 py-1.5 text-right",
                    r.small === 0 ? "text-fg-disabled" : "font-semibold text-rose-300",
                  )}
                >
                  {r.small}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Surface>
  );
}

function GradeBar({ counts, label }: { counts: QuizDeskSummary["gradeTotals"]; label: string }) {
  const segments = gradeSegments(counts);
  const text = segments.map((s) => `${s.grade} ${s.count}`).join(", ");
  return (
    <div
      role="img"
      aria-label={`${label}: ${text}`}
      title={text}
      className="flex h-2.5 w-full overflow-hidden rounded-full bg-fill"
    >
      {segments.map(
        (s) =>
          s.count > 0 && (
            <span
              key={s.grade}
              className={GRADE_FILL[s.grade]}
              style={{ width: `${(s.share * 100).toFixed(2)}%` }}
            />
          ),
      )}
    </div>
  );
}

function GradeDistribution({ summary }: { summary: QuizDeskSummary }) {
  return (
    <Surface as="section" variant="panel" padding="md" aria-label="Research grades">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-fg-strong">Research grades</h2>
        <div className="flex flex-wrap gap-1">
          {GRADES.map((g) => (
            <span key={g} title={GRADE_RULE[g]}>
              <Badge tone={GRADE_TONE[g]} size="xs">
                {g} {summary.gradeTotals[g] ?? 0}
              </Badge>
            </span>
          ))}
        </div>
      </div>
      <div className="mb-3">
        <GradeBar counts={summary.gradeTotals} label="Every active fact" />
      </div>
      <ul className="grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
        {Object.entries(summary.grades).map(([domain, counts]) => (
          <li key={domain} className="grid grid-cols-[8rem_1fr] items-center gap-2">
            <span className="truncate text-xs text-fg-secondary">{domainName(domain)}</span>
            <GradeBar counts={counts} label={domainName(domain)} />
          </li>
        ))}
      </ul>
    </Surface>
  );
}

function BacklogCounts({ summary }: { summary: QuizDeskSummary }) {
  const { backlog } = summary;
  return (
    <Surface as="section" variant="panel" padding="md" aria-label="Backlog counts">
      <h2 className="mb-2 text-sm font-semibold text-fg-strong">Backlog · {backlog.total}</h2>
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-1">
          {BACKLOG_STATUSES.map((s) => (
            <Badge key={s} tone={STATUS_TONE[s]} size="sm">
              {s} {backlog.byStatus[s] ?? 0}
            </Badge>
          ))}
        </div>
        <div className="flex flex-wrap gap-1">
          {BACKLOG_KINDS.map((k) => (
            <Badge key={k} tone="neutral" size="xs">
              {k} {backlog.byKind[k] ?? 0}
            </Badge>
          ))}
        </div>
      </div>
    </Surface>
  );
}

function RetiredCounts({ summary }: { summary: QuizDeskSummary }) {
  const { retired } = summary;
  const codes = RETIRED_CODE_FILTERS.filter(
    (c) => (retired.facts[c] ?? 0) + (retired.wordings[c] ?? 0) + (retired.articles[c] ?? 0) > 0,
  );
  return (
    <Surface as="section" variant="panel" padding="none" aria-label="Retired by code">
      <h2 className="px-3 py-2 text-sm font-semibold text-fg-strong">Retired by code</h2>
      <div className="overflow-x-auto border-t border-line-soft">
        <table className="w-full text-xs tabular-nums">
          <thead>
            <tr className="text-left text-fg-muted">
              <th className="px-3 py-1.5 font-medium">Code</th>
              <th className="px-2 py-1.5 text-right font-medium">Facts</th>
              <th className="px-2 py-1.5 text-right font-medium">Wordings</th>
              <th className="px-3 py-1.5 text-right font-medium">Articles</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-soft">
            {codes.map((c) => (
              <tr key={c}>
                <th scope="row" className="px-3 py-1 text-left font-medium text-fg-secondary">
                  {c === "none" ? "— (no code)" : c}
                </th>
                <td className="px-2 py-1 text-right text-fg-secondary">{retired.facts[c] ?? 0}</td>
                <td className="px-2 py-1 text-right text-fg-secondary">
                  {retired.wordings[c] ?? 0}
                </td>
                <td className="px-3 py-1 text-right text-fg-secondary">
                  {retired.articles[c] ?? 0}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Surface>
  );
}

export function OverviewTab({ summary }: { summary: QuizDeskSummary }) {
  const activeFacts = GRADES.reduce((n, g) => n + (summary.gradeTotals[g] ?? 0), 0);
  const graded = (summary.gradeTotals.A ?? 0) + (summary.gradeTotals.B ?? 0);
  const articles = Object.values(summary.shape).reduce((n, s) => n + s.articles, 0);
  const retiredFacts = Object.values(summary.retired.facts).reduce((n, c) => n + c, 0);
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile variant="tile" size="lg" label="Articles" value={articles} />
        <StatTile variant="tile" size="lg" label="Active facts" value={activeFacts} />
        <StatTile
          variant="tile"
          size="lg"
          tone="emerald"
          label="Grade A or B"
          value={activeFacts ? `${Math.round((graded / activeFacts) * 100)}%` : "—"}
          sub={`${graded} facts`}
        />
        <StatTile
          variant="tile"
          size="lg"
          label="With evidence"
          value={summary.evidenceArticles}
          sub="articles"
        />
        <StatTile
          variant="tile"
          size="lg"
          tone="amber"
          label="Backlog open"
          value={(summary.backlog.byStatus.open ?? 0) + (summary.backlog.byStatus.doing ?? 0)}
          sub={`of ${summary.backlog.total}`}
        />
        <StatTile variant="tile" size="lg" label="Retired facts" value={retiredFacts} />
      </div>
      <ShapeTable summary={summary} />
      <GradeDistribution summary={summary} />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <BacklogCounts summary={summary} />
        <RetiredCounts summary={summary} />
      </div>
      <MicroLabel>Content version {summary.contentVersion}</MicroLabel>
    </div>
  );
}
