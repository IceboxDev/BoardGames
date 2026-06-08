import type { MatchRecord } from "@boardgames/core/history/types";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { NightCard } from "../components/history/NightCard";
import { RecordMatchModal } from "../components/history/RecordMatchModal";
import { TopNav, TopNavBackButton } from "../components/TopNav";
import { Button, EmptyState, LoadingState, PageMain, PageShell } from "../components/ui";
import { useCurrentUser } from "../hooks/useCurrentUser.ts";
import { fetchCalendarLocks, type LockedDate } from "../lib/calendar-locks";
import { deleteMatch, fetchHistory } from "../lib/match-history";
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

  const [recording, setRecording] = useState<
    null | { mode: "create"; dateKey: string | null } | { mode: "edit"; match: MatchRecord }
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
    return [...byKey.values()].sort((a, b) => b.sortKey.localeCompare(a.sortKey));
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
        <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-fg-primary">Board game history</h1>
            <p className="mt-1 text-sm text-fg-muted">
              Every match the group has logged, newest first.
            </p>
          </div>
          {isAdmin && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => setRecording({ mode: "create", dateKey: null })}
              className="shrink-0 self-start whitespace-nowrap sm:self-auto"
            >
              + Record match
            </Button>
          )}
        </header>

        {historyQuery.isLoading ? (
          <LoadingState />
        ) : groups.length === 0 ? (
          <EmptyState
            title="No matches logged yet"
            description={isAdmin ? 'Use "+ Record match" above to add the first one.' : undefined}
          />
        ) : (
          <div className="flex flex-col gap-4">
            {groups.map((g) => (
              <NightCard
                key={`${g.dateKey ?? "day"}:${g.sortKey}`}
                dateKey={g.dateKey}
                dayLabel={g.dayLabel}
                lock={g.lock}
                matches={g.matches}
                isAdmin={isAdmin}
                currentUserId={currentUserId}
                onAddMatch={
                  isAdmin && g.dateKey
                    ? () => setRecording({ mode: "create", dateKey: g.dateKey })
                    : undefined
                }
                onEditMatch={isAdmin ? (m) => setRecording({ mode: "edit", match: m }) : undefined}
                onDeleteMatch={isAdmin ? handleDelete : undefined}
              />
            ))}
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
