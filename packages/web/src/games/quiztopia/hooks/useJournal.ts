import { useInfiniteQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { qk } from "../../../lib/query-keys";
import { journalQuery } from "../api";

// The journal, a page of active days at a time, newest first. The caller's
// time zone goes with every request so a read lands on the day it was lived.

export const JOURNAL_PAGE_DAYS = 7;

export function viewerTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function useJournal() {
  const tz = useMemo(viewerTimeZone, []);
  const query = useInfiniteQuery({
    queryKey: qk.quiztopiaJournal(tz),
    initialPageParam: null as string | null,
    queryFn: (ctx) =>
      journalQuery({ before: ctx.pageParam ?? undefined, days: JOURNAL_PAGE_DAYS, tz })(ctx),
    getNextPageParam: (last) => last.nextBefore,
    staleTime: 60_000,
  });
  const days = useMemo(() => query.data?.pages.flatMap((p) => p.days) ?? [], [query.data]);
  return { ...query, days };
}
