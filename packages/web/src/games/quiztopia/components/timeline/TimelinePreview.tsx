import type { TimelineIndex } from "@boardgames/core/games/quiztopia/content-types";
import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { PageMain } from "../../../../components/ui";
import { useTimelineIndex } from "../../hooks/useContent";
import { joinPins, type TimelineItem } from "../../logic/timeline-layout";
import { trainerPaths } from "../../paths";
import { TrainerScreen } from "../trainer/TrainerScreen";
import { PREVIEW_TIMELINE } from "./preview-fixture";
import { TimelineView } from "./TimelineView";

// The dev preview's timeline scene: the real view over the forty-moment
// fixture, no auth, no pins request. `?q=` focuses a pin just like the
// live route; `?empty=1` shows the empty state; `?dense=1` pins ~300 real
// events from the content (two thirds of them since 1900) to show the
// blocks splitting down to years and months.

const PATHS = trainerPaths("/play/quiztopia/solo");

/** A deterministic sample of the content's events, weighted to the busy 20th century. */
function densePins(index: TimelineIndex): TimelineItem[] {
  const ids = Object.keys(index).sort();
  const modern = ids.filter(
    (id) => !index[id].s.startsWith("-") && Number(index[id].s.slice(0, 4)) >= 1900,
  );
  const older = ids.filter((id) => !modern.includes(id));
  const every = (list: string[], n: number) =>
    list.filter((_, i) => i % Math.max(1, Math.floor(list.length / n)) === 0).slice(0, n);
  const pins = [...every(modern, 200), ...every(older, 100)].map((questionId, i) => ({
    questionId,
    state: "review" as const,
    known: i % 3 !== 0,
    lastReviewedAt: null,
  }));
  return joinPins(pins, index).items;
}

export default function TimelinePreview() {
  const [params, setParams] = useSearchParams();
  const empty = params.get("empty") === "1";
  const dense = params.get("dense") === "1";
  const index = useTimelineIndex(dense);
  const denseItems = useMemo(() => (index.data ? densePins(index.data) : []), [index.data]);
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
  const items = empty ? [] : dense ? denseItems : PREVIEW_TIMELINE;
  return (
    <div className="flex h-screen flex-col bg-surface-950">
      <TrainerScreen>
        <PageMain width="7xl" className="flex flex-col gap-6 pb-16">
          <TimelineView
            items={items}
            totalPins={items.length + (empty ? 0 : 3)}
            undated={empty ? 0 : 3}
            paths={PATHS}
            focusId={params.get("q")}
            onFocus={onFocus}
          />
        </PageMain>
      </TrainerScreen>
    </div>
  );
}
