import type { HistoryListResponse, MatchRecord } from "@boardgames/core/history/types";
import {
  type InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { NightCard } from "../components/history/NightCard";
import { RecordMatchModal } from "../components/history/RecordMatchModal";
import { TopNav, TopNavBackButton } from "../components/TopNav";
import {
  Button,
  EmptyState,
  LoadingState,
  PageHeader,
  PageMain,
  PageShell,
} from "../components/ui";
import { useCurrentUser } from "../hooks/useCurrentUser.ts";
import { fetchCalendarLocks, type LockedDate } from "../lib/calendar-locks";
import { deleteMatch, fetchHistory, reorderMatchesInNight } from "../lib/match-history";
import { qk } from "../lib/query-keys";

type Group = {
  dateKey: string | null;
  dayLabel: string;
  /** Sort key — most recent first. ISO of the latest match in the group. */
  sortKey: string;
  lock: LockedDate | null;
  matches: MatchRecord[];
};

function dayLabelOf(playedAt: string): { day: string; label: string } {
  const d = new Date(playedAt);
  if (Number.isNaN(d.getTime()))
    return { day: playedAt.slice(0, 10), label: playedAt.slice(0, 10) };
  const day = d.toISOString().slice(0, 10);
  const label = d.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  return { day, label };
}

function dateKeyLabel(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map((s) => Number.parseInt(s, 10));
  if (!y || !m || !d) return dateKey;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default function HistoryPage() {
  const { user, isAdmin } = useCurrentUser();
  const currentUserId = user?.id ?? null;
  const queryClient = useQueryClient();

  const historyQuery = useInfiniteQuery({
    queryKey: qk.history(),
    queryFn: ({ pageParam, signal }) => fetchHistory({ before: pageParam, signal }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextBefore,
  });

  const locksQuery = useQuery({
    queryKey: qk.calendarLocks(),
    queryFn: ({ signal }) => fetchCalendarLocks(signal),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteMatch(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.history() });
    },
  });

  // Optimistically re-rank the dragged night in the cached pages, then reconcile
  // with the server on settle (mirrors `deleteMutation`'s invalidate).
  const reorderMutation = useMutation({
    mutationFn: ({ dateKey, orderedIds }: { dateKey: string | null; orderedIds: number[] }) =>
      reorderMatchesInNight(dateKey, orderedIds),
    onMutate: async ({ dateKey, orderedIds }) => {
      await queryClient.cancelQueries({ queryKey: qk.history() });
      const previous = queryClient.getQueryData<InfiniteData<HistoryListResponse>>(qk.history());
      const rank = new Map(orderedIds.map((id, i) => [id, i] as const));
      queryClient.setQueryData<InfiniteData<HistoryListResponse>>(qk.history(), (data) =>
        data
          ? {
              ...data,
              pages: data.pages.map((p) => ({
                ...p,
                matches: p.matches.map((m) => {
                  if (m.dateKey !== dateKey) return m;
                  const next = rank.get(m.id);
                  return next === undefined ? m : { ...m, sortOrder: next };
                }),
              })),
            }
          : data,
      );
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(qk.history(), ctx.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: qk.history() });
    },
  });

  const [recording, setRecording] = useState<
    | null
    | { mode: "create"; dateKey: string | null; playedAt?: string }
    | { mode: "edit"; match: MatchRecord }
  >(null);

  const allMatches = useMemo(
    () => historyQuery.data?.pages.flatMap((p) => p.matches) ?? [],
    [historyQuery.data],
  );

  const groups = useMemo<Group[]>(() => {
    const byKey = new Map<string, Group>();
    for (const m of allMatches) {
      const dateKey = m.dateKey;
      if (dateKey) {
        const key = `lock:${dateKey}`;
        let g = byKey.get(key);
        if (!g) {
          g = {
            dateKey,
            dayLabel: dateKeyLabel(dateKey),
            sortKey: dateKey,
            lock: locksQuery.data?.[dateKey] ?? null,
            matches: [],
          };
          byKey.set(key, g);
        }
        if (m.playedAt > g.sortKey) g.sortKey = m.playedAt;
        g.matches.push(m);
      } else {
        const { day, label } = dayLabelOf(m.playedAt);
        const key = `day:${day}`;
        let g = byKey.get(key);
        if (!g) {
          g = { dateKey: null, dayLabel: label, sortKey: day, lock: null, matches: [] };
          byKey.set(key, g);
        }
        if (m.playedAt > g.sortKey) g.sortKey = m.playedAt;
        g.matches.push(m);
      }
    }
    const ordered = [...byKey.values()].sort((a, b) => b.sortKey.localeCompare(a.sortKey));
    // Every group — real night or standalone day — follows the admin-set
    // `sortOrder` (newest first by default, since a new match takes the lowest).
    for (const g of ordered) {
      g.matches.sort((a, b) => a.sortOrder - b.sortOrder);
    }
    return ordered;
  }, [allMatches, locksQuery.data]);

  function handleDelete(m: MatchRecord) {
    if (!confirm(`Delete this ${m.gameTitle} match? This cannot be undone.`)) return;
    deleteMutation.mutate(m.id);
  }

  return (
    <PageShell
      topNav={
        <TopNav>
          <TopNavBackButton to="/offline" label="Calendar" />
        </TopNav>
      }
    >
      <PageMain width="full" className="max-w-3xl lg:max-w-5xl 2xl:max-w-6xl 3xl:max-w-7xl">
        <PageHeader
          size="sm"
          title="Board game history"
          subtitle="Every match the group has logged, newest first."
          actions={
            isAdmin && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => setRecording({ mode: "create", dateKey: null })}
                className="whitespace-nowrap"
              >
                + Record match
              </Button>
            )
          }
          className="mb-6"
        />

        {historyQuery.isLoading ? (
          <LoadingState />
        ) : groups.length === 0 ? (
          <EmptyState
            title="No matches logged yet"
            description={isAdmin ? 'Use "+ Record match" above to add the first one.' : undefined}
          />
        ) : (
          <div className="flex flex-col gap-4">
            {groups.map((g) => {
              const nightKey = g.dateKey;
              return (
                <NightCard
                  key={`${g.dateKey ?? "day"}:${g.sortKey}`}
                  dateKey={g.dateKey}
                  dayLabel={g.dayLabel}
                  lock={g.lock}
                  matches={g.matches}
                  isAdmin={isAdmin}
                  currentUserId={currentUserId}
                  onAddMatch={
                    isAdmin
                      ? () =>
                          setRecording(
                            nightKey
                              ? { mode: "create", dateKey: nightKey }
                              : // Standalone group: new match defaults to this
                                // group's day (its latest match's time) so it
                                // lands here rather than in today's group.
                                { mode: "create", dateKey: null, playedAt: g.sortKey },
                          )
                      : undefined
                  }
                  onEditMatch={
                    isAdmin ? (m) => setRecording({ mode: "edit", match: m }) : undefined
                  }
                  onDeleteMatch={isAdmin ? handleDelete : undefined}
                  onReorder={
                    isAdmin
                      ? (orderedIds) => reorderMutation.mutate({ dateKey: g.dateKey, orderedIds })
                      : undefined
                  }
                />
              );
            })}
            {historyQuery.hasNextPage && (
              <div className="flex justify-center pt-2">
                <Button
                  variant="secondary"
                  size="sm"
                  loading={historyQuery.isFetchingNextPage}
                  onClick={() => historyQuery.fetchNextPage()}
                >
                  Load more
                </Button>
              </div>
            )}
          </div>
        )}
      </PageMain>

      {recording && (
        <RecordMatchModal
          state={recording}
          onClose={() => setRecording(null)}
          onSaved={() => {
            setRecording(null);
            queryClient.invalidateQueries({ queryKey: qk.history() });
          }}
        />
      )}
    </PageShell>
  );
}
