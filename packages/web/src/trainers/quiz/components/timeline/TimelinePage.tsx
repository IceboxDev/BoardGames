import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { QueryBoundary } from "../../../../components/ui";
import useDocumentTitle from "../../../../hooks/useDocumentTitle";
import { usePinnedTimeline } from "../../hooks/usePinnedTimeline";
import { useTrainerPaths } from "../../paths";
import { PaperPage } from "../paper/PaperPage";
import { TrainerScreen } from "../trainer/TrainerScreen";
import { TimelineView } from "./TimelineView";

// `/trainer/quiz/timeline[?q=<questionId>]` — the member's pins
// joined with the content's event index. The focused pin lives in the URL,
// so a chip on a study card or in the wiki deep-links straight to it; walking
// the river replaces the entry, so Back leaves the timeline in one step.

export default function TimelinePage() {
  useDocumentTitle("Your timeline · Quiz");
  const paths = useTrainerPaths();
  const [params, setParams] = useSearchParams();
  const focusId = params.get("q");
  const { pins, index, items, undated } = usePinnedTimeline();

  const onFocus = useCallback(
    (id: string | null) =>
      setParams(
        (cur) => {
          const next = new URLSearchParams(cur);
          if (id) next.set("q", id);
          else next.delete("q");
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );

  return (
    <TrainerScreen>
      <PaperPage pageLabel="The Timeline" folio="D1" current="timeline" className="gap-4 pb-12">
        <QueryBoundary query={pins} loadingLabel="Gathering your pins…">
          {(data) => (
            <QueryBoundary query={index} loadingLabel="Unrolling the timeline…">
              {() => (
                <TimelineView
                  items={items}
                  totalPins={data.pins.length}
                  undated={undated}
                  paths={paths}
                  focusId={focusId}
                  onFocus={onFocus}
                />
              )}
            </QueryBoundary>
          )}
        </QueryBoundary>
      </PaperPage>
    </TrainerScreen>
  );
}
