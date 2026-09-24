import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { PageMain } from "../../../../components/ui";
import { trainerPaths } from "../../paths";
import { TrainerScreen } from "../trainer/TrainerScreen";
import { PREVIEW_TIMELINE } from "./preview-fixture";
import { TimelineView } from "./TimelineView";

// The dev preview's timeline scene: the real view over the forty-moment
// fixture, no auth, no pins request. `?q=` focuses a pin just like the
// live route; `?empty=1` shows the empty state.

const PATHS = trainerPaths("/play/quiztopia/solo");

export default function TimelinePreview() {
  const [params, setParams] = useSearchParams();
  const empty = params.get("empty") === "1";
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
  const items = empty ? [] : PREVIEW_TIMELINE;
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
