import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { qk } from "../../../lib/query-keys";
import { pinsQuery } from "../api";
import { joinPins, type TimelineItem } from "../logic/timeline-layout";
import { useTimelineIndex } from "./useContent";

// The member's pins (every question graded in the trainer) and the content's
// event index joined onto them. Pins refetch on every mount — a study session
// in between adds some — while the index is an immutable content chunk that
// only the timeline screen loads (the hub reads the pins' own summary).

export function usePins(enabled = true) {
  return useQuery({
    queryKey: qk.quiztopiaPins(),
    queryFn: pinsQuery(),
    staleTime: 0,
    enabled,
  });
}

/** The set of pinned question ids (empty until the pins load). */
export function usePinnedIds(enabled = true): ReadonlySet<string> {
  const pins = usePins(enabled);
  return useMemo(() => new Set((pins.data?.pins ?? []).map((p) => p.questionId)), [pins.data]);
}

export interface PinnedTimeline {
  pins: ReturnType<typeof usePins>;
  index: ReturnType<typeof useTimelineIndex>;
  items: TimelineItem[];
  /** Pinned questions whose content carries no event yet. */
  undated: number;
}

/** The timeline screen's data: the pins joined with the content's event index. */
export function usePinnedTimeline(): PinnedTimeline {
  const pins = usePins();
  const index = useTimelineIndex();
  const joined = useMemo(
    () =>
      pins.data && index.data ? joinPins(pins.data.pins, index.data) : { items: [], undated: 0 },
    [pins.data, index.data],
  );
  return { pins, index, items: joined.items, undated: joined.undated };
}
