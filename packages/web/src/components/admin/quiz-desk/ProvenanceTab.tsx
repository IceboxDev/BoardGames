import type {
  QuizDeskEvidenceSource,
  QuizDeskFact,
  QuizDeskLinkedReport,
  QuizDeskPrintedOn,
  QuizDeskProvenance,
} from "@boardgames/core/protocol/http/quiz-desk";
import type { EntityLink } from "@boardgames/core/quiz/content-types";
import type { Assessment } from "@boardgames/core/quiz/evidence-types";
import { ARTICLE_ID_RE } from "@boardgames/core/quiz/ids";
import { sourceById } from "@boardgames/core/quiz/sources";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { errorMessageOf } from "../../../lib/error-message";
import { TextLink } from "../../../trainers/quiz/components/common/TextLink";
import { findDomain, subName } from "../../../trainers/quiz/domains";
import { useQuizIndex } from "../../../trainers/quiz/hooks/useContent";
import { historyRefHref, wikidataHref } from "../../../trainers/quiz/logic/archive-links";
import { TRAINER_BASE, trainerPaths } from "../../../trainers/quiz/paths";
import {
  Badge,
  Button,
  ButtonLink,
  EmptyState,
  ErrorAlert,
  Input,
  MicroLabel,
  QueryBoundary,
  SearchInput,
  Surface,
  type Tone,
} from "../../ui";
import { deskKeys, useQuizDeskApi } from "./api";
import { BacklogRow, ExternalLink, RunLink } from "./bits";
import { GradeBadge } from "./GradeBadge";
import { hostOf, pickArticles } from "./logic";

// One article's provenance: per fact the research grade, the ledger's
// sources and latest assessments (with their quotes), the printed cards
// (photo + the transcriber's words), tags and Wikidata entities; then the
// backlog items, member reports and runs that touch it.

const PATHS = trainerPaths(TRAINER_BASE);

const VERDICT_TONE: Record<Assessment["verdict"], Tone> = {
  confirmed: "emerald",
  contested: "amber",
  refuted: "rose",
  unverified: "neutral",
};

// ── Picker ───────────────────────────────────────────────────────────────

function ArticlePicker({ onPick }: { onPick: (id: string) => void }) {
  const [q, setQ] = useState("");
  const index = useQuizIndex();
  const hits = index.data ? pickArticles(index.data.articles, q) : [];
  const typedId = q.trim().toLowerCase();
  const submit = () => {
    if (ARTICLE_ID_RE.test(typedId)) onPick(typedId);
    else if (hits[0]) onPick(hits[0].id);
  };
  return (
    <div className="flex flex-col gap-1.5">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <SearchInput
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Article id (a0042) or title"
          aria-label="Find an article"
          containerClassName="flex-1"
        />
        <Button type="submit" size="sm" variant="secondary" disabled={!typedId}>
          Open
        </Button>
      </form>
      {hits.length > 0 && (
        <ul className="flex flex-col divide-y divide-line-soft">
          {hits.map((a) => (
            <li key={a.id}>
              <Button
                variant="ghost"
                size="sm"
                align="start"
                block
                onClick={() => {
                  onPick(a.id);
                  setQ("");
                }}
                className="items-baseline px-1 py-1 text-left"
              >
                <MicroLabel className="shrink-0 tabular-nums">{a.id}</MicroLabel>
                <span className="min-w-0 truncate">{a.titleEn}</span>
                <span className="ml-auto shrink-0 text-xs text-fg-muted">
                  {findDomain(a.domain)?.en ?? a.domain}
                </span>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Chips ────────────────────────────────────────────────────────────────

function TagChips({
  tags,
  derived,
  labels,
}: {
  tags: readonly string[];
  derived: readonly string[];
  labels?: Record<string, { en: string }>;
}) {
  if (tags.length + derived.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {tags.map((t) => (
        <span key={t} title={t}>
          <Badge tone="accent" size="xs">
            {labels?.[t]?.en ?? t}
          </Badge>
        </span>
      ))}
      {derived.map((t) => (
        <span key={t} title={`${t} (derived)`}>
          <Badge tone="neutral" size="xs">
            {labels?.[t]?.en ?? t}
          </Badge>
        </span>
      ))}
    </div>
  );
}

function EntityChips({ entities }: { entities: readonly EntityLink[] }) {
  if (entities.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
      {entities.map((e) => (
        <ExternalLink
          key={`${e.qid}-${e.role}`}
          href={wikidataHref(e.qid)}
          title={`${e.qid} · ${e.role}`}
        >
          {e.label} <span className="text-fg-muted">({e.role})</span>
        </ExternalLink>
      ))}
    </div>
  );
}

// ── Evidence ─────────────────────────────────────────────────────────────

function SourceRow({ source }: { source: QuizDeskEvidenceSource }) {
  return (
    <li className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
      <MicroLabel className="tabular-nums">{source.id}</MicroLabel>
      <Badge
        tone={["primary", "official", "scholarly"].includes(source.kind) ? "emerald" : "neutral"}
        size="xs"
      >
        {source.kind}
      </Badge>
      <MicroLabel>{source.lang}</MicroLabel>
      <ExternalLink href={source.url} title={source.url} className="max-w-full">
        {source.title ?? hostOf(source.url)}
        {source.publisher ? ` · ${source.publisher}` : ""}
      </ExternalLink>
      {source.archiveUrl && <ExternalLink href={source.archiveUrl}>archive</ExternalLink>}
      {source.snapshot && (
        <span className="text-fg-muted" title={`snapshot ${source.snapshot}`}>
          snapshot ✓
        </span>
      )}
      {source.cloneOf && (
        <Badge tone="orange" size="xs">
          clone of {source.cloneOf}
        </Badge>
      )}
      <span className="text-fg-disabled">retrieved {source.retrievedAt.slice(0, 10)}</span>
    </li>
  );
}

function AssessmentRow({ a }: { a: Assessment }) {
  return (
    <li className="flex flex-col gap-1 border-l-2 border-line pl-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone={VERDICT_TONE[a.verdict]} size="xs">
          {a.verdict}
        </Badge>
        <MicroLabel>{a.claim}</MicroLabel>
        <MicroLabel>confidence {a.confidence}</MicroLabel>
        {a.run && <RunLink id={a.run} />}
        <MicroLabel className="ml-auto tabular-nums">
          {a.id} · {a.at.slice(0, 10)} · {a.by}
        </MicroLabel>
      </div>
      {a.note && <p className="text-xs text-fg-secondary">{a.note}</p>}
      {a.support.map((s) => (
        <blockquote
          key={`${s.source}-${s.quote}`}
          className="text-xs leading-snug text-fg-secondary"
        >
          <q lang={s.quoteLang}>{s.quote}</q>{" "}
          <span className="text-fg-muted">
            — {s.source}
            {s.verbatim ? " · verbatim" : " · paraphrase"}
            {s.verifiedAt ? ` · verified ${s.verifiedAt.slice(0, 10)}` : " · not machine-verified"}
          </span>
        </blockquote>
      ))}
    </li>
  );
}

// ── Printed cards ────────────────────────────────────────────────────────

function PrintedOnRow({ p }: { p: QuizDeskPrintedOn }) {
  const source = sourceById(p.source);
  const category = source?.categories.find((c) => c.n === p.category);
  const rotate = p.manifest?.rotate ?? 0;
  const t = p.transcript;
  return (
    <li className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-fg-secondary">
          {source?.title ?? p.source} {p.card} · {category?.en ?? `category ${p.category}`}
        </span>
        <MicroLabel className="tabular-nums">{p.wordingId}</MicroLabel>
        {p.retiredWording && (
          <Badge tone="rose" size="xs">
            wording retired
          </Badge>
        )}
        <ButtonLink href={p.photoUrl} external size="xs" variant="secondary" className="ml-auto">
          Card photo ↗
        </ButtonLink>
      </div>
      {(rotate !== 0 || (p.manifest?.duplicates.length ?? 0) > 0) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
          {rotate !== 0 && (
            <MicroLabel>photo needs a {rotate}° clockwise turn to read upright</MicroLabel>
          )}
          {p.manifest?.duplicates.map((d, i) => (
            <ExternalLink key={d} href={d}>
              re-photo {i + 1}
            </ExternalLink>
          ))}
        </div>
      )}
      {t && (
        <Surface variant="tile" padding="sm" className="flex flex-col gap-1 text-xs">
          <MicroLabel>Transcript · category {t.category}</MicroLabel>
          {t.cardDe && (
            <p lang="de" className="text-fg-primary">
              <span className="text-fg-muted">Card (DE): </span>
              {t.cardDe}
            </p>
          )}
          {t.cardText && (
            <p lang="en" className="text-fg-primary">
              <span className="text-fg-muted">Card: </span>
              {t.cardText}
            </p>
          )}
          <p className="text-fg-secondary">
            <span className="text-fg-muted">Transcribed: </span>
            {t.question.en} <span className="text-fg-muted">→</span> {t.answer.en}
            {t.reworked ? <span className="text-fg-muted"> (reworked)</span> : null}
          </p>
          {t.discipline && <p className="text-fg-muted">Field: {t.discipline}</p>}
          {t.notes && (
            <p className="whitespace-pre-line text-fg-secondary">
              <span className="text-fg-muted">Transcriber: </span>
              {t.notes}
            </p>
          )}
          {t.source && (
            <ExternalLink href={t.source.url} title={t.source.url}>
              {t.source.title}
            </ExternalLink>
          )}
        </Surface>
      )}
    </li>
  );
}

// ── Fact ─────────────────────────────────────────────────────────────────

function FactCard({
  fact,
  n,
  labels,
}: {
  fact: QuizDeskFact;
  n: number | null;
  labels: Record<string, { en: string }>;
}) {
  return (
    <Surface as="li" variant="panel" padding="md" id={fact.id} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone={fact.retired ? "rose" : "neutral"} size="sm">
          {n === null ? "Retired" : `Q${n}`}
        </Badge>
        <MicroLabel className="tabular-nums">{fact.id}</MicroLabel>
        <GradeBadge grade={fact.grade} size="sm" />
        <MicroLabel>
          {fact.assessments.length}/{fact.assessmentCount} assessments
        </MicroLabel>
        {fact.reviewBy && <MicroLabel>review by {fact.reviewBy}</MicroLabel>}
        <TextLink className="ml-auto" to={PATHS.wikiFact(fact.id)}>
          Wiki →
        </TextLink>
      </div>
      <div>
        <p className="text-sm text-fg-primary">{fact.question.en}</p>
        <p lang="de" className="text-xs text-fg-muted">
          {fact.question.de}
        </p>
        <p className="mt-0.5 text-sm font-semibold text-fg-strong">
          {fact.answer.en}
          {fact.answer.de !== fact.answer.en && (
            <span lang="de" className="ml-2 text-xs font-normal text-fg-muted">
              {fact.answer.de}
            </span>
          )}
        </p>
      </div>
      {fact.retired && (
        <p className="text-xs text-fg-secondary">
          <Badge tone="rose" size="xs">
            {fact.retired.code ?? "retired"} · {fact.retired.at}
          </Badge>{" "}
          {fact.retired.reason}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-x-2 text-xs">
        <span className="text-fg-muted">Cited:</span>
        <ExternalLink href={fact.cited.url} title={fact.cited.url}>
          {fact.cited.title}
        </ExternalLink>
        <MicroLabel>{fact.cited.lang}</MicroLabel>
      </div>
      <TagChips tags={fact.tags} derived={fact.derivedTags} labels={labels} />
      <EntityChips entities={fact.entities} />

      {fact.sources.length > 0 && (
        <section className="flex flex-col gap-1">
          <MicroLabel as="h4">Sources</MicroLabel>
          <ul className="flex flex-col gap-1">
            {fact.sources.map((s) => (
              <SourceRow key={s.id} source={s} />
            ))}
          </ul>
        </section>
      )}
      {fact.assessments.length > 0 && (
        <section className="flex flex-col gap-1">
          <MicroLabel as="h4">Assessments</MicroLabel>
          <ul className="flex flex-col gap-2">
            {fact.assessments.map((a) => (
              <AssessmentRow key={a.id} a={a} />
            ))}
          </ul>
        </section>
      )}
      {fact.printedOn.length > 0 && (
        <section className="flex flex-col gap-1">
          <MicroLabel as="h4">Printed on</MicroLabel>
          <ul className="flex flex-col gap-2">
            {fact.printedOn.map((p) => (
              <PrintedOnRow key={`${p.source}-${p.card}-${p.wordingId}`} p={p} />
            ))}
          </ul>
        </section>
      )}
    </Surface>
  );
}

// ── Reports ──────────────────────────────────────────────────────────────

function ReportRow({ report, articleId }: { report: QuizDeskLinkedReport; articleId: string }) {
  const api = useQuizDeskApi();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [backlogId, setBacklogId] = useState(report.backlogId ?? "");
  const [historyRef, setHistoryRef] = useState(report.historyRef ?? "");
  const save = useMutation({
    mutationFn: () =>
      api.linkReport(report.id, {
        backlogId: backlogId.trim() || null,
        historyRef: historyRef.trim() || null,
      }),
    onSuccess: () => {
      setEditing(false);
      void qc.invalidateQueries({ queryKey: deskKeys.provenance(api.id, articleId) });
    },
  });
  const historyHref = report.historyRef ? historyRefHref(report.historyRef) : null;
  return (
    <li className="flex flex-col gap-1 py-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <MicroLabel className="tabular-nums">#{report.id}</MicroLabel>
        <Badge
          tone={
            report.status === "open" ? "amber" : report.status === "fixed" ? "emerald" : "neutral"
          }
          size="xs"
        >
          {report.status}
        </Badge>
        <Badge tone="neutral" size="xs">
          {report.issue}
        </Badge>
        <MicroLabel>
          {report.target.kind} {report.target.id}
        </MicroLabel>
        <MicroLabel className="ml-auto tabular-nums">
          {report.createdAt.slice(0, 10)}
          {report.resolvedAt ? ` → ${report.resolvedAt.slice(0, 10)}` : ""}
        </MicroLabel>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
        <span className="text-fg-muted">Backlog: {report.backlogId ?? "—"}</span>
        <span className="text-fg-muted">
          History:{" "}
          {report.historyRef && historyHref ? (
            <ExternalLink href={historyHref}>{report.historyRef}</ExternalLink>
          ) : (
            (report.historyRef ?? "—")
          )}
        </span>
        <Button
          size="xs"
          variant="link"
          onClick={() => setEditing((e) => !e)}
          aria-expanded={editing}
        >
          {editing ? "Cancel" : "Link…"}
        </Button>
      </div>
      {editing && (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <Input
            width="auto"
            className="w-28 px-2 py-1 text-xs"
            value={backlogId}
            onChange={(e) => setBacklogId(e.target.value)}
            placeholder="b00012"
            aria-label="Backlog item"
          />
          <Input
            width="auto"
            className="w-40 px-2 py-1 text-xs"
            value={historyRef}
            onChange={(e) => setHistoryRef(e.target.value)}
            placeholder="a0042#17"
            aria-label="History entry"
          />
          <Button type="submit" size="xs" variant="secondary" loading={save.isPending}>
            Save
          </Button>
          {save.error && (
            <ErrorAlert message={errorMessageOf(save.error, "Couldn't save the links.")} />
          )}
        </form>
      )}
    </li>
  );
}

// ── Article ──────────────────────────────────────────────────────────────

function ProvenanceView({
  data,
  onOpenArticle,
}: {
  data: QuizDeskProvenance;
  onOpenArticle: (id: string) => void;
}) {
  const { article, history } = data;
  const domain = findDomain(article.domain);
  let q = 0;
  return (
    <div className="flex flex-col gap-3">
      <Surface variant="panel" padding="md" className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <MicroLabel className="tabular-nums">{article.id}</MicroLabel>
          <MicroLabel>
            {domain?.en ?? article.domain} · {domain ? subName(domain, article.sub) : article.sub}
          </MicroLabel>
          {article.retired && (
            <Badge tone="rose" size="xs">
              retired · {article.retired.code} · {article.retired.at}
            </Badge>
          )}
          <Badge tone={article.hasEvidence ? "emerald" : "neutral"} size="xs">
            {article.hasEvidence ? "evidence ledger" : "no evidence yet"}
          </Badge>
          <TextLink className="ml-auto" to={PATHS.wikiArticle(article.id)}>
            Wiki →
          </TextLink>
        </div>
        <h2 className="text-lg font-semibold text-fg-strong">
          {article.title.en}
          <span lang="de" className="ml-2 text-sm font-normal text-fg-muted">
            {article.title.de}
          </span>
        </h2>
        {article.retired && <p className="text-xs text-fg-secondary">{article.retired.reason}</p>}
        {article.notes.en && <p className="text-xs text-fg-secondary">Note: {article.notes.en}</p>}
        <TagChips tags={article.tags} derived={article.derivedTags} labels={article.tagLabels} />
        <EntityChips entities={article.entities} />
        <MicroLabel as="p">
          History: {history.total} entries
          {history.lastAt ? ` · last ${history.lastAt}` : ""}
          {Object.entries(history.byKind).length > 0 &&
            ` · ${Object.entries(history.byKind)
              .map(([k, n]) => `${k} ${n}`)
              .join(", ")}`}
        </MicroLabel>
      </Surface>

      <ol className="flex flex-col gap-2">
        {data.facts.map((f) => {
          const n = f.retired ? null : ++q;
          return <FactCard key={f.id} fact={f} n={n} labels={article.tagLabels} />;
        })}
      </ol>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Surface as="section" variant="panel" padding="none" className="px-3" aria-label="Backlog">
          <MicroLabel as="h3" className="pt-2">
            Backlog · {data.backlog.length}
          </MicroLabel>
          {data.backlog.length === 0 ? (
            <p className="py-2 text-xs text-fg-muted">No backlog items.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line-soft">
              {data.backlog.map((b) => (
                <BacklogRow
                  key={b.id}
                  item={b}
                  label={data.targets[b.target]}
                  onOpenArticle={(id) => id !== article.id && onOpenArticle(id)}
                />
              ))}
            </ul>
          )}
        </Surface>
        <div className="flex flex-col gap-3">
          <Surface
            as="section"
            variant="panel"
            padding="none"
            className="px-3"
            aria-label="Reports"
          >
            <MicroLabel as="h3" className="pt-2">
              Member reports · {data.reports.length}
            </MicroLabel>
            {data.reports.length === 0 ? (
              <p className="py-2 text-xs text-fg-muted">No reports.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-line-soft">
                {data.reports.map((r) => (
                  <ReportRow key={r.id} report={r} articleId={article.id} />
                ))}
              </ul>
            )}
          </Surface>
          <Surface as="section" variant="panel" padding="sm" aria-label="Runs">
            <MicroLabel as="h3">Runs · {data.runs.length}</MicroLabel>
            <ul className="mt-1 flex flex-col gap-0.5">
              {data.runs.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2">
                  <RunLink id={r.id} title={r.title} />
                  {r.title && <span className="text-xs text-fg-muted">{r.title}</span>}
                </li>
              ))}
            </ul>
          </Surface>
        </div>
      </div>
      <MicroLabel>Content version {data.contentVersion}</MicroLabel>
    </div>
  );
}

export function ProvenanceTab({
  articleId,
  onOpenArticle,
}: {
  articleId: string | null;
  onOpenArticle: (id: string) => void;
}) {
  const api = useQuizDeskApi();
  const query = useQuery({
    queryKey: deskKeys.provenance(api.id, articleId ?? ""),
    queryFn: ({ signal }) => api.provenance(articleId ?? "", signal),
    enabled: articleId !== null,
  });
  return (
    <div className="flex flex-col gap-3">
      <Surface variant="tile" padding="md">
        <ArticlePicker onPick={onOpenArticle} />
      </Surface>
      {articleId === null ? (
        <EmptyState
          titleAs="h3"
          title="Pick an article"
          description="Its facts' grades, evidence, card photos and transcripts open here."
        />
      ) : (
        <QueryBoundary query={query} loadingLabel={`Loading ${articleId}…`}>
          {(data) => <ProvenanceView data={data} onOpenArticle={onOpenArticle} />}
        </QueryBoundary>
      )}
    </div>
  );
}
