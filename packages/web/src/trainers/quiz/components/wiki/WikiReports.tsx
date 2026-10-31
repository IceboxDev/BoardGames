import type { MyReport, ReportStatus } from "@boardgames/core/protocol";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ErrorAlert, LoadingState, useConfirm } from "../../../../components/ui";
import useDocumentTitle from "../../../../hooks/useDocumentTitle";
import { cn } from "../../../../lib/cn";
import { errorMessageOf } from "../../../../lib/error-message";
import { findDomain } from "../../domains";
import { useMyReports, useReportMutations } from "../../hooks/useMyReports";
import { relativeDays } from "../../logic/time";
import { type TrainerPaths, useTrainerPaths } from "../../paths";
import {
  Headline,
  JumpLine,
  Kicker,
  PaperNote,
  PaperTabs,
  PrintButton,
  Stamp,
} from "../paper/Paper";
import { PaperPage } from "../paper/PaperPage";
import { KICKER } from "../paper/paper-style";
import { ISSUE_COPY, STATUS_COPY } from "../report/issues";
import { ReportDialog } from "../report/ReportDialog";
import { TrainerScreen } from "../trainer/TrainerScreen";

// Letters to the editor (your reports): every problem you flagged, newest first, with what came of
// it — under review, fixed or declined, and the reviewer's note. A
// resolution you haven't seen yet is highlighted for this visit; opening
// the page marks it seen (which clears the dot on the archive and the hub).
// An open report can be edited or withdrawn.

type Filter = "all" | ReportStatus;

export default function WikiReports() {
  useDocumentTitle("Your reports · Quiz");
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
      <PaperPage pageLabel="Letters to the editor" folio="B5" current="archive" className="gap-4">
        <header className="flex flex-col gap-1">
          <Link to={paths.wiki} className={cn(KICKER, "text-fg-muted hover:text-fg-strong")}>
            ◂ The Archive
          </Link>
          <Headline as="h1" size="lg">
            Letters to the editor
          </Headline>
          <p className="font-news text-sm italic text-fg-secondary">
            Problems you've flagged in questions and articles, and what the editor made of them.
          </p>
        </header>

        {reports.length > 0 && (
          <PaperTabs<Filter>
            label="Show"
            value={filter}
            onChange={setFilter}
            className="border-b border-line-strong pb-2"
            options={[
              { value: "all", label: `All ${reports.length}` },
              { value: "open", label: `Under review ${counts.open}` },
              { value: "fixed", label: `Fixed ${counts.fixed}` },
              { value: "declined", label: `Declined ${counts.declined}` },
            ]}
          />
        )}

        {loadError && <ErrorAlert message={loadError} />}
        {withdraw.error && (
          <ErrorAlert message={errorMessageOf(withdraw.error, "Couldn't withdraw it.")} />
        )}
        {query.isPending && <LoadingState label="Fetching your letters…" />}

        {query.data && reports.length === 0 && (
          <PaperNote>
            No letters yet. Spot a mistake in a question or an article? Use the flag beside it — it
            lands here, and so does the editor's reply.
          </PaperNote>
        )}

        <ul className="grid gap-x-8 lg:grid-cols-2">
          {shown.map((r) => (
            <Letter
              key={r.id}
              report={r}
              fresh={fresh?.has(r.id) ?? false}
              paths={paths}
              onEdit={() => setEditing(r)}
              onWithdraw={() => void onWithdraw(r)}
            />
          ))}
        </ul>
      </PaperPage>

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

const STAMP_OF = { open: "sky", fixed: "emerald", declined: "neutral" } as const;

function Letter({
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
  const href = targetHref(r, paths);
  const snap = r.snapshot;
  return (
    <li
      className={cn(
        "flex flex-col gap-2 border-b border-line-strong py-4",
        fresh && "border-l-2 border-l-accent-300 pl-3",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        {d && <Kicker domain={d.slug} icon={24} />}
        <span className={cn(KICKER, "ml-auto text-fg-muted")}>
          To the editor · {relativeDays(r.createdAt)}
        </span>
      </div>
      <div className="flex items-start justify-between gap-3">
        <p className="font-headline text-lg font-bold leading-snug text-fg-strong">
          {ISSUE_COPY[r.issue].label}
        </p>
        <span className="flex shrink-0 gap-1.5">
          {fresh && <Stamp tone="accent">New</Stamp>}
          <Stamp tone={STAMP_OF[r.status]}>{STATUS_COPY[r.status].label}</Stamp>
        </span>
      </div>

      <blockquote className="border-l border-fg-primary/50 pl-3 font-news text-sm">
        <span className={cn(KICKER, "text-fg-muted")}>
          {r.target.kind === "question" ? "Concerning the question" : "Concerning the article"}
        </span>
        {snap.kind === "question" ? (
          <>
            <p className="text-fg-primary">{r.language === "de" ? snap.de : snap.en}</p>
            <p className="text-fg-secondary">
              Answer: {r.language === "de" ? snap.answerDe : snap.answerEn}
            </p>
          </>
        ) : (
          <p className="text-fg-primary">{r.language === "de" ? snap.titleDe : snap.titleEn}</p>
        )}
      </blockquote>

      {r.message && <q className="font-news text-sm italic text-fg-secondary">{r.message}</q>}

      {r.status !== "open" && (
        <div className="ml-4 border-t border-dotted border-line-strong pt-2 font-news text-sm text-fg-primary">
          <span className={cn(KICKER, r.status === "fixed" ? "text-emerald-300" : "text-fg-muted")}>
            The editor replies{r.resolvedAt ? ` · ${relativeDays(r.resolvedAt)}` : ""}
          </span>
          <p>
            {r.resolutionNote ??
              (r.status === "fixed"
                ? "Fixed — thanks for spotting it."
                : "Reviewed and left as it is.")}
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-4">
        {href && <JumpLine to={href}>Open in the archive</JumpLine>}
        {r.status === "open" && (
          <span className="ml-auto flex gap-4">
            <PrintButton onClick={onEdit}>Edit</PrintButton>
            <PrintButton onClick={onWithdraw} className="text-rose-300 hover:text-rose-200">
              Withdraw
            </PrintButton>
          </span>
        )}
      </div>
    </li>
  );
}
