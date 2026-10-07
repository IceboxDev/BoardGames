import {
  type GroupDayMatch,
  rankGroupDates,
  scoreGroupDates,
} from "@boardgames/core/availability/group-match";
import type { ProfileDirectoryEntry } from "@boardgames/core/protocol";
import { useMemo, useState } from "react";
import type { CalendarLocks } from "../../lib/calendar-locks";
import type { AggregateAvailabilityMap } from "../../lib/offline-availability";

/**
 * Lock mode's "Find a date" state: the picked group, every date's fit for
 * it and the best nights. `dates` are the calendar's own (today onward).
 */
export function useGroupMatch({
  dates,
  availability,
  awayByUser,
  locks,
  members,
}: {
  dates: readonly string[];
  availability: AggregateAvailabilityMap | null;
  awayByUser: Readonly<Record<string, readonly string[]>> | undefined;
  locks: CalendarLocks | undefined;
  members: readonly ProfileDirectoryEntry[];
}) {
  const [ids, setIds] = useState<ReadonlySet<string>>(() => new Set());

  const byDate = useMemo<Record<string, GroupDayMatch>>(
    () =>
      scoreGroupDates({
        group: [...ids],
        dates,
        availability: availability ?? {},
        awayByUser,
        lockedNightKeys: new Set(Object.keys(locks ?? {})),
      }),
    [ids, dates, availability, awayByUser, locks],
  );
  const ranked = useMemo(() => rankGroupDates(byDate), [byDate]);
  const names = useMemo(() => new Map(members.map((m) => [m.id, m.name])), [members]);

  function toggle(id: string) {
    setIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return {
    ids,
    active: ids.size > 0,
    byDate,
    ranked,
    names,
    toggle,
    clear: () => setIds(new Set()),
  };
}
