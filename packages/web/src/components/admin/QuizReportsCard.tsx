import type { AdminReport, AdminReportGroup, ReportSnapshot } from "@boardgames/core/protocol";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../../lib/api-fetch";
import { cn } from "../../lib/cn";
import { errorMessageOf } from "../../lib/error-message";
import { qk } from "../../lib/query-keys";
import { adminReportsQuery, reopenReport, resolveReports } from "../../trainers/quiz/api";
import { ISSUE_COPY, STATUS_COPY } from "../../trainers/quiz/components/report/issues";
import { findDomain } from "../../trainers/quiz/domains";
import { relativeDays } from "../../trainers/quiz/logic/time";
import { TRAINER_BASE, trainerPaths } from "../../trainers/quiz/paths";
import {
  Badge,
  Button,
  EmptyState,
  ErrorAlert,
  LoadingState,
  MicroLabel,
  SegmentedControl,
  Surface,
  Textarea,
} from "../ui";
import { AdminSection } from "./AdminSection";
import { fixBrief } from "./quiz-fix-brief";

// The quiz report queue: one card per reported question or article,
// with the content as it is NOW beside what each reporter wrote (and saw,
// when it differs), and the actions — mark fixed / decline with a note to
// the reporters, or reopen. Content is never edited here; "Copy fix brief"
// puts every open report on the clipboard with exactly where to fix it.

type StatusFilter = "open" | "fixed" | "declined" | "all";

const PATHS = trainerPaths(TRAINER_BASE);
const LANGUAGE = { en: "EN", de: "DE", ru: "RU", both: "EN + DE" } as const;

function wikiHref(group: AdminReportGroup): string | null {
  if (!group.articleId) return null;
  return group.target.kind === "question"
    ? PATHS.wikiArticle(group.articleId, group.target.id)
    : PATHS.wikiArticle(group.articleId);
}

export function QuizReportsCard() {
  const [status, setStatus] = useState<StatusFilter>("open");
  const [copied, setCopied] = useState(false);
  const query = useQuery({
    queryKey: qk.adminQuizReports(status),
    queryFn: adminReportsQuery(status),
  });
  const counts = query.data?.counts;
  const groups = query.data?.groups ?? [];
  const hasOpen = groups.some((g) => g.reports.some((r) => r.status === "open"));

  const copyBrief = async () => {
    try {
      await navigator.clipboard.writeText(fixBrief(groups));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const summary = counts
    ? counts.open === 0
      ? `Nothing to review · ${counts.fixed} fixed · ${counts.declined} declined`
      : `${counts.open} open report${counts.open === 1 ? "" : "s"} · ${counts.fixed} fixed · ${counts.declined} declined`
    : "Loading…";

  return (
    <AdminSection tone="amber" eyebrow="Quiz reports" summary={summary}>
      <div className="flex flex-col gap-4 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl
            options={[
              { value: "open" as const, label: `Open${counts ? ` ${counts.open}` : ""}` },
              { value: "fixed" as const, label: `Fixed${counts ? ` ${counts.fixed}` : ""}` },
              {
                value: "declined" as const,
                label: `Declined${counts ? ` ${counts.declined}` : ""}`,
              },
              { value: "all" as const, label: "All" },
            ]}
            value={status}
            onChange={setStatus}
            size="sm"
            shape="pill"
            selectionMode="toggle"
            aria-label="Show reports"
          />
          <Button
            variant="secondary"
            size="sm"
            className="ml-auto"
            onClick={() => void copyBrief()}
            disabled={!hasOpen}
            title="Every open report as a Markdown task list, with the content file and card photo to fix"
          >
            {copied ? "Copied ✓" : "Copy fix brief"}
          </Button>
        </div>

        {query.error && (
          <ErrorAlert message={errorMessageOf(query.error, "Couldn't load the reports.")} />
        )}
        {query.isPending && <LoadingState label="Loading reports…" />}
        {query.data && groups.length === 0 && (
          <EmptyState
            titleAs="h3"
            title={status === "open" ? "No open reports" : "Nothing here"}
            description={
              status === "open"
                ? "When someone flags a question or an article, it lands here."
                : "No reports with this status."
            }
          />
        )}

        <ul className="flex flex-col gap-3">
          {groups.map((g) => (
            <ReportGroupCard key={g.target.id} group={g} />
          ))}
        </ul>
      </div>
    </AdminSection>
  );
}

function ContentNow({ snap }: { snap: ReportSnapshot | null }) {
  if (!snap) {
    return (
      <p className="text-sm text-rose-300">No longer in the content (removed or renumbered).</p>
    );
  }
  if (snap.kind === "article") {
    return (
      <p className="text-sm text-fg-primary">
        {snap.titleEn} <span className="text-fg-muted">/ {snap.titleDe}</span>
      </p>
    );
  }
  return (
    <dl className="grid gap-x-3 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
      <dt className="text-2xs font-semibold text-fg-muted">EN</dt>
      <dd className="text-fg-primary">
        {snap.en} <span className="font-semibold text-fg-strong">→ {snap.answerEn}</span>
      </dd>
      <dt className="text-2xs font-semibold text-fg-muted">DE</dt>
      <dd className="text-fg-primary">
        {snap.de} <span className="font-semibold text-fg-strong">→ {snap.answerDe}</span>
      </dd>
      {snap.timeline && (
        <>
          <dt className="text-2xs font-semibold text-fg-muted">Date</dt>
          <dd className="text-fg-secondary">
            {snap.timeline.end
              ? `${snap.timeline.start} – ${snap.timeline.end}`
              : snap.timeline.start}{" "}
            · {snap.timeline.labelEn}
          </dd>
        </>
      )}
      {snap.source && (
        <>
          <dt className="text-2xs font-semibold text-fg-muted">Source</dt>
          <dd>
            <a
              href={snap.source.url}
              target="_blank"
              rel="noreferrer"
              className="text-accent-300 hover:text-accent-200"
            >
              {snap.source.title} ↗
            </a>
          </dd>
        </>
      )}
    </dl>
  );
}

/** What a reporter saw, when it differs from the content now. */
function sawDifferent(r: AdminReport, current: ReportSnapshot | null): string | null {
  const s = r.snapshot;
  if (!current || s.kind !== current.kind) return null;
  if (s.kind === "question" && current.kind === "question") {
    const parts: string[] = [];
    if (s.en !== current.en) parts.push(`question “${s.en}”`);
    if (s.answerEn !== current.answerEn) parts.push(`answer “${s.answerEn}”`);
    if (s.de !== current.de) parts.push(`German question “${s.de}”`);
    if (s.answerDe !== current.answerDe) parts.push(`German answer “${s.answerDe}”`);
    if ((s.timeline?.start ?? null) !== (current.timeline?.start ?? null)) {
      parts.push(`date ${s.timeline?.start ?? "none"}`);
    }
    return parts.length > 0 ? parts.join(", ") : null;
  }
  if (s.kind === "article" && current.kind === "article" && s.titleEn !== current.titleEn) {
    return `title “${s.titleEn}”`;
  }
  return null;
}

function ReportGroupCard({ group: g }: { group: AdminReportGroup }) {
  const qc = useQueryClient();
  const d = findDomain(g.domain);
  const href = wikiHref(g);
  const openIds = g.reports.filter((r) => r.status === "open").map((r) => r.id);
  const [note, setNote] = useState("");
  const [conflict, setConflict] = useState<string | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: qk.adminQuizReportsAll() });

  const onConflict = (err: unknown) => {
    if (err instanceof ApiError && err.status === 409) {
      setConflict(err.message);
      void refresh();
      return true;
    }
    return false;
  };
  const resolve = useMutation({
    mutationFn: (status: "fixed" | "declined") =>
      resolveReports({ ids: openIds, status, note: note.trim() }),
    onSuccess: () => {
      setNote("");
      void refresh();
    },
    onError: (err) => void onConflict(err),
  });
  const reopen = useMutation({
    mutationFn: reopenReport,
    onSuccess: () => void refresh(),
    onError: (err) => void onConflict(err),
  });
  const error =
    !conflict && (resolve.error || reopen.error)
      ? errorMessageOf(resolve.error ?? reopen.error, "That didn't go through.")
      : null;

  return (
    <Surface as="li" variant="tile" padding="md" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {d && (
          <Badge tone={d.tone} size="xs">
            {d.label} · {d.en}
          </Badge>
        )}
        <MicroLabel>
          {g.target.kind === "question" ? "Question" : "Article"} {g.target.id}
        </MicroLabel>
        {g.changedSinceReport && (
          <Badge tone="amber" size="xs" title="A reporter saw different content — it may be fixed">
            Content changed since a report
          </Badge>
        )}
        {href && (
          <Link
            to={href}
            className="ml-auto text-xs font-medium text-accent-300 hover:text-accent-200"
          >
            Open in the wiki →
          </Link>
        )}
      </div>

      <div className="flex flex-col gap-1 rounded-card-md bg-fill-soft px-3 py-2">
        <MicroLabel>Now</MicroLabel>
        <ContentNow snap={g.current} />
      </div>

      <ul className="flex flex-col divide-y divide-line-soft">
        {g.reports.map((r) => {
          const saw = sawDifferent(r, g.current);
          return (
            <li key={r.id} className="flex flex-col gap-1 py-2">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-semibold text-fg-strong">{ISSUE_COPY[r.issue].label}</span>
                <Badge tone="neutral" size="xs">
                  {LANGUAGE[r.language]}
                </Badge>
                {r.status !== "open" && (
                  <Badge tone={STATUS_COPY[r.status].tone} size="xs">
                    {STATUS_COPY[r.status].label}
                  </Badge>
                )}
                <span className="ml-auto text-2xs text-fg-muted">
                  {r.reporterName} · {relativeDays(r.createdAt)} · from {r.surface}
                </span>
              </div>
              {r.message && <p className="text-sm text-fg-secondary">“{r.message}”</p>}
              {saw && <p className="text-2xs text-amber-200">They saw: {saw}</p>}
              {r.status !== "open" && (
                <div className="flex flex-wrap items-center gap-2 text-2xs text-fg-muted">
                  <span>
                    {r.resolvedByName ?? "An admin"} ·{" "}
                    {r.resolvedAt ? relativeDays(r.resolvedAt) : ""}
                    {r.resolutionNote ? ` — “${r.resolutionNote}”` : ""}
                  </span>
                  <Button
                    variant="link"
                    size="xs"
                    onClick={() => {
                      setConflict(null);
                      reopen.mutate(r.id);
                    }}
                    loading={reopen.isPending && reopen.variables === r.id}
                  >
                    Reopen
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {openIds.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-line-soft pt-3">
          <Textarea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note to the reporter (optional) — e.g. “Corrected to 24 October 1648, thanks!”"
            maxLength={1000}
            aria-label="Note to the reporter"
          />
          <div className={cn("flex flex-wrap items-center gap-2")}>
            <span className="text-2xs text-fg-muted">
              Applies to {openIds.length} open report{openIds.length === 1 ? "" : "s"} here
            </span>
            <Button
              variant="secondary"
              size="sm"
              className="ml-auto"
              onClick={() => {
                setConflict(null);
                resolve.mutate("declined");
              }}
              loading={resolve.isPending && resolve.variables === "declined"}
            >
              Decline
            </Button>
            <Button
              variant="solid"
              tone="emerald"
              size="sm"
              onClick={() => {
                setConflict(null);
                resolve.mutate("fixed");
              }}
              loading={resolve.isPending && resolve.variables === "fixed"}
            >
              Mark fixed
            </Button>
          </div>
        </div>
      )}
      {conflict && <p className="text-xs text-amber-200">{conflict} — the list is refreshed.</p>}
      {error && <ErrorAlert message={error} />}
    </Surface>
  );
}
