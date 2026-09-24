import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { qk } from "../../../lib/query-keys";
import { pinsQuery } from "../api";
import { joinPins, type TimelineItem } from "../logic/timeline-layout";
import { useTimelineIndex } from "./useContent";

// The member's pins (every question graded in the trainer) and, once any
// exist, the content's event index joined onto them. Pins refetch on every
// mount — a study session in between adds some — while the index is an
// immutable content chunk.

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

/**
 * `eager` loads the event index alongside the pins (the timeline screen);
 * otherwise it waits until there is at least one pin (the hub teaser).
 */
export function usePinnedTimeline({ eager = false }: { eager?: boolean } = {}): PinnedTimeline {
  const pins = usePins();
  const hasPins = (pins.data?.pins.length ?? 0) > 0;
  const index = useTimelineIndex(eager || hasPins);
  const joined = useMemo(
    () =>
      pins.data && index.data ? joinPins(pins.data.pins, index.data) : { items: [], undated: 0 },
    [pins.data, index.data],
  );
  return { pins, index, items: joined.items, undated: joined.undated };
}
