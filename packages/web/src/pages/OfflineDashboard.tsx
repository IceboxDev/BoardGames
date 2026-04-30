import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AvailabilityActionBar } from "../components/offline/AvailabilityActionBar";
import Calendar from "../components/offline/Calendar";
import RsvpModal from "../components/offline/RsvpModal";
import { TopNav, TopNavBackButton } from "../components/TopNav";
import { useSession } from "../lib/auth-client";
import {
  adminSetCalendarLock,
  adminUnsetCalendarLock,
  type CalendarLocks,
  fetchCalendarLocks,
} from "../lib/calendar-locks";
import type { RsvpStatus } from "../lib/calendar-rsvps";
import {
  type Availability,
  type AvailabilityMap,
  adminFetchAllAvailability,
  fetchAvailability,
  fetchAvailabilityCounts,
  pushAvailability,
} from "../lib/offline-availability";
import { startOfWeekMonday } from "../lib/offline-week";
import { qk } from "../lib/query-keys";

type Mode = "view" | "edit" | "lock";

export default function OfflineDashboard() {
  const { data } = useSession();
  const userId = data?.user?.id ?? null;
  const isAdmin = (data?.user as { role?: string } | undefined)?.role === "admin";

  const today = useMemo(() => new Date(), []);
  const weekStart = useMemo(() => startOfWeekMonday(today), [today]);

  const queryClient = useQueryClient();

  const availabilityQuery = useQuery({
    queryKey: qk.availability(userId),
    queryFn: ({ signal }) => fetchAvailability(signal),
    enabled: !!userId,
  });

  const aggregateQuery = useQuery({
    queryKey: qk.adminAggregateAvailability(),
    queryFn: ({ signal }) => adminFetchAllAvailability(signal),
    enabled: isAdmin,
  });

  const countsQuery = useQuery({
    queryKey: qk.availabilityCounts(),
    queryFn: ({ signal }) => fetchAvailabilityCounts(signal),
    enabled: !!userId,
  });

  const locksQuery = useQuery({
    queryKey: qk.calendarLocks(),
    queryFn: ({ signal }) => fetchCalendarLocks(signal),
    enabled: !!userId,
  });

  const committed: AvailabilityMap = availabilityQuery.data ?? {};
  const allAvailability = aggregateQuery.data ?? null;
  const counts = countsQuery.data ?? undefined;
  const locks = locksQuery.data ?? undefined;

  const [mode, setMode] = useState<Mode>("view");
  const [draft, setDraft] = useState<AvailabilityMap>({});
  const [rsvpDate, setRsvpDate] = useState<string | null>(null);

  const viewerRsvpByDate = useMemo<Record<string, RsvpStatus | undefined>>(() => {
    if (!locks || !userId) return {};
    const out: Record<string, RsvpStatus | undefined> = {};
    for (const [d, lock] of Object.entries(locks)) {
      out[d] = lock.rsvps[userId];
    }
    return out;
  }, [locks, userId]);

  const saveMutation = useMutation({
    mutationFn: (next: AvailabilityMap) => pushAvailability(next),
    onMutate: async (next) => {
      await queryClient.cancelQueries({ queryKey: qk.availability(userId) });
      const previous = queryClient.getQueryData<AvailabilityMap>(qk.availability(userId));
      queryClient.setQueryData(qk.availability(userId), next);
      return { previous };
    },
    onError: (_e, _next, ctx) => {
      if (ctx && ctx.previous !== undefined) {
        queryClient.setQueryData(qk.availability(userId), ctx.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: qk.availability(userId) });
      void queryClient.invalidateQueries({ queryKey: qk.adminAggregateAvailability() });
      void queryClient.invalidateQueries({ queryKey: qk.availabilityCounts() });
    },
  });

  const lockMutation = useMutation({
    mutationFn: async ({ date, currentlyLocked }: { date: string; currentlyLocked: boolean }) => {
      if (currentlyLocked) await adminUnsetCalendarLock(date);
      else await adminSetCalendarLock(date);
    },
    onMutate: async ({ date, currentlyLocked }) => {
      await queryClient.cancelQueries({ queryKey: qk.calendarLocks() });
      const previous = queryClient.getQueryData<CalendarLocks>(qk.calendarLocks());
      queryClient.setQueryData<CalendarLocks>(qk.calendarLocks(), (prev) => {
        const next: CalendarLocks = { ...(prev ?? {}) };
        if (currentlyLocked) {
          delete next[date];
        } else {
          next[date] = {
            lockedBy: userId ?? "",
            lockedAt: new Date().toISOString(),
            expectedUserIds: [],
            rsvps: {},
          };
        }
        return next;
      });
      return { previous };
    },
    onError: (_e, _vars, ctx) => {
      if (ctx?.previous !== undefined) {
        queryClient.setQueryData(qk.calendarLocks(), ctx.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: qk.calendarLocks() });
    },
  });

  function enterEdit() {
    setDraft(committed);
    saveMutation.reset();
    setMode("edit");
  }

  function cancel() {
    saveMutation.reset();
    setMode("view");
  }

  async function save() {
    if (!userId) return;
    try {
      await saveMutation.mutateAsync(draft);
      setMode("view");
    } catch {
      // error surfaces via saveMutation.error; stay in edit mode
    }
  }

  function enterLockMode() {
    saveMutation.reset();
    lockMutation.reset();
    setMode("lock");
  }

  function exitLockMode() {
    lockMutation.reset();
    setMode("view");
  }

  function handleChange(key: string, value: Availability | undefined) {
    setDraft((prev) => {
      const next = { ...prev };
      if (value === undefined) delete next[key];
      else next[key] = value;
      return next;
    });
  }

  function handleLockToggle(date: string, currentlyLocked: boolean) {
    lockMutation.mutate({ date, currentlyLocked });
  }

  const visible = mode === "edit" ? draft : committed;
  const markedCount = Object.keys(visible).length;
  const saveError = saveMutation.error
    ? saveMutation.error instanceof Error
      ? saveMutation.error.message
      : "Could not save. Try again."
    : null;
  const lockError = lockMutation.error
    ? lockMutation.error instanceof Error
      ? lockMutation.error.message
      : "Could not lock/unlock. Try again."
    : null;
  const errorMessage = mode === "lock" ? lockError : saveError;

  return (
    <div className="flex min-h-dvh flex-col bg-surface-950 bg-grid">
      <TopNav>
        <TopNavBackButton to="/" label="Dashboard" />
      </TopNav>

      <div className="flex min-h-0 flex-1 flex-col gap-3 px-3 py-3 sm:gap-5 sm:px-6 sm:py-5">
        <p
          className={`shrink-0 text-center text-[11px] ${
            mode === "edit"
              ? "text-gray-400"
              : mode === "lock"
                ? "text-amber-300"
                : "invisible text-gray-400"
          }`}
          aria-hidden={mode === "view"}
        >
          {mode === "edit" && (
            <>
              <span className="hidden sm:inline">Tap a day to cycle: </span>
              <span className="text-accent-300">Can</span>
              <span className="mx-1 opacity-50">→</span>
              <span className="text-amber-300">Maybe</span>
              <span className="mx-1 opacity-50">→</span>
              <span className="opacity-60">clear</span>
            </>
          )}
          {mode === "lock" && (
            <>
              <span className="font-semibold">Lock mode.</span>
              <span className="mx-2 opacity-60">·</span>
              Tap a day to lock or unlock for game night.
            </>
          )}
        </p>

        <Calendar
          weekStart={weekStart}
          availability={visible}
          onChange={handleChange}
          readonlyBefore={today}
          interactive={mode === "edit"}
          dayLabels={isAdmin ? (allAvailability ?? undefined) : undefined}
          counts={counts}
          locks={locks}
          lockMode={mode === "lock"}
          onLockToggle={handleLockToggle}
          onLockedClick={mode === "lock" ? undefined : (date) => setRsvpDate(date)}
          viewerRsvpByDate={viewerRsvpByDate}
        />

        <AvailabilityActionBar
          mode={mode}
          markedCount={markedCount}
          saving={saveMutation.isPending}
          error={errorMessage}
          isAdmin={isAdmin}
          onEdit={enterEdit}
          onCancel={cancel}
          onSave={save}
          onEnterLockMode={enterLockMode}
          onExitLockMode={exitLockMode}
        />
      </div>

      {rsvpDate && (
        <RsvpModal
          date={rsvpDate}
          locks={locks}
          counts={counts}
          onClose={() => setRsvpDate(null)}
        />
      )}
    </div>
  );
}
