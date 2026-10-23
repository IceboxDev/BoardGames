import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { QueryBoundary, SegmentedControl } from "../../ui";
import { deskKeys, useQuizDeskApi } from "./api";
import { BacklogTab } from "./BacklogTab";
import { OverviewTab } from "./OverviewTab";
import { ProvenanceTab } from "./ProvenanceTab";
import { RetiredTab } from "./RetiredTab";

// The admin Quiz desk: the bank's provenance — shape and grades, the
// backlog, the retired database and one article's full record. Tabs and the
// open article live in the URL (`?tab=provenance&article=a0042`), so a link
// from a report or a backlog item lands on the right view.

const DESK_TABS = ["overview", "backlog", "retired", "provenance"] as const;
type DeskTab = (typeof DESK_TABS)[number];

function isDeskTab(v: string | null): v is DeskTab {
  return v !== null && (DESK_TABS as readonly string[]).includes(v);
}

export function QuizDesk() {
  const api = useQuizDeskApi();
  const [params, setParams] = useSearchParams();
  const tabParam = params.get("tab");
  const tab: DeskTab = isDeskTab(tabParam) ? tabParam : "overview";
  const articleId = params.get("article");

  const summary = useQuery({
    queryKey: deskKeys.summary(api.id),
    queryFn: ({ signal }) => api.summary(signal),
    staleTime: 60_000,
  });
  const openBacklog =
    (summary.data?.backlog.byStatus.open ?? 0) + (summary.data?.backlog.byStatus.doing ?? 0);

  const setTab = (next: DeskTab) => {
    const sp = new URLSearchParams(params);
    if (next === "overview") sp.delete("tab");
    else sp.set("tab", next);
    setParams(sp, { replace: true });
  };
  const openArticle = (id: string) => {
    const sp = new URLSearchParams(params);
    sp.set("tab", "provenance");
    sp.set("article", id);
    setParams(sp);
  };

  return (
    <div className="flex flex-col gap-4">
      <SegmentedControl<DeskTab>
        aria-label="Quiz desk sections"
        options={[
          { value: "overview", label: "Overview" },
          { value: "backlog", label: openBacklog ? `Backlog (${openBacklog})` : "Backlog" },
          { value: "retired", label: "Retired" },
          { value: "provenance", label: "Provenance" },
        ]}
        value={tab}
        onChange={setTab}
        shape="pill"
        size="sm"
      />
      {tab === "overview" && (
        <QueryBoundary query={summary} loadingLabel="Loading the bank's summary…">
          {(data) => <OverviewTab summary={data} />}
        </QueryBoundary>
      )}
      {tab === "backlog" && <BacklogTab onOpenArticle={openArticle} />}
      {tab === "retired" && <RetiredTab onOpenArticle={openArticle} />}
      {tab === "provenance" && <ProvenanceTab articleId={articleId} onOpenArticle={openArticle} />}
    </div>
  );
}
