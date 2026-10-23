import type { MyReport, ReportStatus } from "@boardgames/core/protocol";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Badge,
  Button,
  EmptyState,
  ErrorAlert,
  LoadingState,
  MicroLabel,
  PageHeader,
  PageMain,
  SegmentedControl,
  Surface,
  useConfirm,
} from "../../../../components/ui";
import useDocumentTitle from "../../../../hooks/useDocumentTitle";
import { cn } from "../../../../lib/cn";
import { errorMessageOf } from "../../../../lib/error-message";
import { findDomain } from "../../domains";
import { useMyReports, useReportMutations } from "../../hooks/useMyReports";
import { relativeDays } from "../../logic/time";
import { type TrainerPaths, useTrainerPaths } from "../../paths";
import { ISSUE_COPY, STATUS_COPY } from "../report/issues";
import { ReportDialog } from "../report/ReportDialog";
import { TrainerScreen } from "../trainer/TrainerScreen";

// Your reports: every problem you flagged, newest first, with what came of
// it — under review, fixed or declined, and the reviewer's note. A
// resolution you haven't seen yet is highlighted for this visit; opening
// the page marks it seen (which clears the dot on the archive and the hub).
// An open report can be edited or withdrawn.

type Filter = "all" | ReportStatus;

export default function WikiReports() {
  useDocumentTitle("Your reports · Quiz");
  const navigate = useNavigate();
  const paths = useTrainerPaths();
  const { query, reports } = useMyReports();
  const { seen, withdraw } = useReportMutations();
  const { confirm, confirmDialog } = useConfirm();
  const [filter, setFilter] = useState<Filter>("all");
  const [editing, setEditing] = useState<MyReport | null>(null);

  // The resolutions that were new when the page opened stay highlighted for
  // the visit, even after they're marked seen.
  const [fresh, setFresh] = useState<ReadonlySet<number> | null>(null);
  const { mutate: markSeen } = seen;
  useEffect(() => {
    if (fresh !== null || !query.data) return;
    const ids = query.data.reports.filter((r) => r.unread).map((r) => r.id);
    setFresh(new Set(ids));
    if (ids.length > 0) markSeen(ids);
  }, [fresh, query.data, markSeen]);

  const counts = useMemo(() => {
    const c = { open: 0, fixed: 0, declined: 0 };
    for (const r of reports) c[r.status]++;
    return c;
  }, [reports]);
  const shown = filter === "all" ? reports : reports.filter((r) => r.status === filter);

  const onWithdraw = async (r: MyReport) => {
    const ok = await confirm({
      title: "Withdraw this report?",
      description: "It comes off the review list. You can always report it again.",
      confirmLabel: "Withdraw",
    });
    if (ok) withdraw.mutate(r.id);
  };

  const loadError = errorMessageOf(query.error, "Couldn't load your reports.");

  return (
    <TrainerScreen>
      <PageMain width="3xl" className="flex flex-col gap-5 pb-16">
        <PageHeader
          size="lg"
          eyebrow="The Archive"
          title="Your reports"
          subtitle="Problems you've flagged in questions and articles, and what came of them."
          actions={
            <Button variant="link" onClick={() => navigate(paths.wiki)}>
              ← Archive
            </Button>
          }
        />

        {reports.length > 0 && (
          <SegmentedControl
            options={[
              { value: "all" as const, label: `All ${reports.length}` },
              { value: "open" as const, label: `Under review ${counts.open}` },
              { value: "fixed" as const, label: `Fixed ${counts.fixed}` },
              { value: "declined" as const, label: `Declined ${counts.declined}` },
            ]}
            value={filter}
            onChange={setFilter}
            size="sm"
            shape="pill"
            selectionMode="toggle"
            aria-label="Show"
          />
        )}

        {loadError && <ErrorAlert message={loadError} />}
        {withdraw.error && (
          <ErrorAlert message={errorMessageOf(withdraw.error, "Couldn't withdraw it.")} />
        )}
        {query.isPending && <LoadingState label="Fetching your reports…" />}

        {query.data && reports.length === 0 && (
          <EmptyState
            titleAs="h2"
            title="No reports yet"
            description="Spot a mistake in a question or an article? Use the flag beside it — it lands here, and so does the outcome."
            action={
              <Button variant="secondary" onClick={() => navigate(paths.wiki)}>
                Back to the archive
              </Button>
            }
          />
        )}

        <ul className="flex flex-col gap-3">
          {shown.map((r) => (
            <ReportCard
              key={r.id}
              report={r}
              fresh={fresh?.has(r.id) ?? false}
              paths={paths}
              onEdit={() => setEditing(r)}
              onWithdraw={() => void onWithdraw(r)}
            />
          ))}
        </ul>
      </PageMain>

      {editing && (
        <ReportDialog
          context={{
            target: editing.target,
            title:
              editing.snapshot.kind === "question" ? editing.snapshot.en : editing.snapshot.titleEn,
            domain: editing.domain ?? "",
            surface: editing.surface,
            presetIssue: editing.issue,
            language: editing.language,
          }}
          onClose={() => setEditing(null)}
        />
      )}
      {confirmDialog}
    </TrainerScreen>
  );
}

/** Where the target lives now; null once the content no longer has it. */
function targetHref(r: MyReport, paths: TrainerPaths): string | null {
  if (!r.articleId) return null;
  return r.target.kind === "question"
    ? paths.wikiArticle(r.articleId, r.target.id)
    : paths.wikiArticle(r.articleId);
}

function ReportCard({
  report: r,
  fresh,
  paths,
  onEdit,
  onWithdraw,
}: {
  report: MyReport;
  fresh: boolean;
  paths: TrainerPaths;
  onEdit: () => void;
  onWithdraw: () => void;
}) {
  const d = findDomain(r.domain);
  const status = STATUS_COPY[r.status];
  const href = targetHref(r, paths);
  const snap = r.snapshot;
  return (
    <Surface
      as="li"
      variant="tile"
      padding="md"
      className={cn("flex flex-col gap-3", fresh && "border-emerald-400/50")}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={status.tone} size="xs">
          {status.label}
        </Badge>
        {fresh && (
          <Badge tone="emerald" size="xs" ring>
            New
          </Badge>
        )}
        <span className="text-sm font-semibold text-fg-strong">{ISSUE_COPY[r.issue].label}</span>
        {d && (
          <Badge tone={d.tone} size="xs">
            {d.label} · {d.en}
          </Badge>
        )}
        <MicroLabel className="ml-auto">
          reported {relativeDays(r.createdAt)}
          {r.resolvedAt ? ` · resolved ${relativeDays(r.resolvedAt)}` : ""}
        </MicroLabel>
      </div>

      <div className="flex flex-col gap-1 border-l-2 border-line-strong pl-3">
        <MicroLabel>{r.target.kind === "question" ? "The question" : "The article"}</MicroLabel>
        {snap.kind === "question" ? (
          <>
            <p className="text-sm text-fg-primary">{r.language === "de" ? snap.de : snap.en}</p>
            <p className="text-sm text-fg-secondary">
              Answer: {r.language === "de" ? snap.answerDe : snap.answerEn}
            </p>
          </>
        ) : (
          <p className="text-sm text-fg-primary">
            {r.language === "de" ? snap.titleDe : snap.titleEn}
          </p>
        )}
      </div>

      {r.message && (
        <p className="text-sm text-fg-secondary">
          <span className="text-fg-muted">You wrote: </span>
          {r.message}
        </p>
      )}

      {r.status !== "open" && (
        <div
          className={cn(
            "rounded-card-md px-3 py-2 text-sm",
            r.status === "fixed" ? "bg-emerald-500/10 text-emerald-100" : "bg-fill text-fg-primary",
          )}
        >
          {r.resolutionNote ? (
            <>
              <span className="font-semibold">Reviewer: </span>
              {r.resolutionNote}
            </>
          ) : r.status === "fixed" ? (
            "Fixed — thanks for spotting it."
          ) : (
            "Reviewed and left as it is."
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {href && (
          <Link to={href} className="text-xs font-medium text-accent-300 hover:text-accent-200">
            Open in the wiki →
          </Link>
        )}
        {r.status === "open" && (
          <span className="ml-auto flex gap-2">
            <Button variant="secondary" size="xs" onClick={onEdit}>
              Edit
            </Button>
            <Button variant="ghost" tone="rose" size="xs" onClick={onWithdraw}>
              Withdraw
            </Button>
          </span>
        )}
      </div>
    </Surface>
  );
}
