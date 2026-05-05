import { mkOptimisticLock } from "@boardgames/core/protocol";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AvailabilityActionBar } from "../components/offline/AvailabilityActionBar";
import Calendar from "../components/offline/Calendar";
import LockInModal from "../components/offline/LockInModal";
import RsvpModal from "../components/offline/RsvpModal";
import { TopNav, TopNavBackButton } from "../components/TopNav";
import { useCurrentUser } from "../hooks/useCurrentUser.ts";
import {
  adminSetCalendarLock,
  adminUnsetCalendarLock,
  type CalendarLocks,
  fetchCalendarLocks,
  type LockHost,
  type LockInForm,
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
  const { user, isAdmin } = useCurrentUser();
  const userId = user?.id ?? null;

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
  const [lockingDate, setLockingDate] = useState<string | null>(null);
  const [debugAsPlayer, setDebugAsPlayer] = useState(false);
  const inAdminView = isAdmin && !debugAsPlayer;

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
    mutationFn: ({ date, form }: { date: string; form: LockInForm }) =>
      adminSetCalendarLock(date, form),
    onMutate: async ({ date, form }) => {
      await queryClient.cancelQueries({ queryKey: qk.calendarLocks() });
      const previous = queryClient.getQueryData<CalendarLocks>(qk.calendarLocks());
      queryClient.setQueryData<CalendarLocks>(qk.calendarLocks(), (prev) => {
        const next: CalendarLocks = { ...(prev ?? {}) };
        next[date] = mkOptimisticLock(form, next[date], userId ?? "");
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

  const unlockMutation = useMutation({
    mutationFn: (date: string) => adminUnsetCalendarLock(date),
    onMutate: async (date) => {
      await queryClient.cancelQueries({ queryKey: qk.calendarLocks() });
      const previous = queryClient.getQueryData<CalendarLocks>(qk.calendarLocks());
      queryClient.setQueryData<CalendarLocks>(qk.calendarLocks(), (prev) => {
        if (!prev) return prev;
        const next: CalendarLocks = { ...prev };
        delete next[date];
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
    unlockMutation.reset();
    setMode("lock");
  }

  function exitLockMode() {
    lockMutation.reset();
    unlockMutation.reset();
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

  function handleLockToggle(date: string, _currentlyLocked: boolean) {
    lockMutation.reset();
    unlockMutation.reset();
    setLockingDate(date);
  }

  async function submitLock(form: LockInForm) {
    if (!lockingDate) return;
    try {
      await lockMutation.mutateAsync({ date: lockingDate, form });
      setLockingDate(null);
    } catch {
      // error surfaces via lockMutation.error; modal stays open
    }
  }

  async function removeLock() {
    if (!lockingDate) return;
    try {
      await unlockMutation.mutateAsync(lockingDate);
      setLockingDate(null);
    } catch {
      // error surfaces via unlockMutation.error; modal stays open
    }
  }

  const hostCandidates = useMemo<LockHost[]>(() => {
    if (!lockingDate) return [];
    const out: LockHost[] = [];
    const seen = new Set<string>();
    if (user?.id && user.name) {
      out.push({ userId: user.id, name: `${user.name} (you)` });
      seen.add(user.id);
    }
    const entries = allAvailability?.[lockingDate];
    if (entries) {
      for (const e of entries) {
        if (seen.has(e.userId)) continue;
        seen.add(e.userId);
        out.push({ userId: e.userId, name: e.name });
      }
    }
    return out;
  }, [lockingDate, user, allAvailability]);

  const visible = mode === "edit" ? draft : committed;
  const markedCount = Object.keys(visible).length;
  const saveError = saveMutation.error
    ? saveMutation.error instanceof Error
      ? saveMutation.error.message
      : "Could not save. Try again."
    : null;
  const lockMutationError =
    lockMutation.error instanceof Error
      ? lockMutation.error.message
      : lockMutation.error
        ? "Could not update lock-in. Try again."
        : null;
  const unlockMutationError =
    unlockMutation.error instanceof Error
      ? unlockMutation.error.message
      : unlockMutation.error
        ? "Could not remove lock-in. Try again."
        : null;
  const errorMessage = mode === "lock" ? (lockMutationError ?? unlockMutationError) : saveError;

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-surface-950 bg-grid">
      <TopNav>
        <TopNavBackButton to="/" label="Dashboard" />
      </TopNav>

      <div className="flex min-h-0 flex-1 flex-col gap-2 px-3 py-2 sm:px-6">
        <p
          className={`shrink-0 text-center text-[11px] text-gray-400 ${mode === "edit" ? "" : "invisible"}`}
          aria-hidden={mode !== "edit"}
        >
          <span className="hidden sm:inline">Tap a day to cycle: </span>
          <span className="text-accent-300">Can</span>
          <span className="mx-1 opacity-50">→</span>
          <span className="text-amber-300">Maybe</span>
          <span className="mx-1 opacity-50">→</span>
          <span className="opacity-60">clear</span>
        </p>

        <Calendar
          weekStart={weekStart}
          availability={visible}
          onChange={handleChange}
          readonlyBefore={today}
          interactive={mode === "edit"}
          dayLabels={inAdminView ? (allAvailability ?? undefined) : undefined}
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
          showLockInButton={inAdminView && mode === "view"}
          showAdminToggle={isAdmin && mode === "view"}
          adminViewActive={inAdminView}
          onToggleAdminView={() => setDebugAsPlayer((prev) => !prev)}
          onEdit={enterEdit}
          onCancel={cancel}
          onSave={save}
          onEnterLockMode={enterLockMode}
          onExitLockMode={exitLockMode}
        />
      </div>

      {rsvpDate && <RsvpModal date={rsvpDate} locks={locks} onClose={() => setRsvpDate(null)} />}

      {lockingDate && (
        <LockInModal
          date={lockingDate}
          initialLock={locks?.[lockingDate] ?? null}
          candidates={hostCandidates}
          busy={lockMutation.isPending || unlockMutation.isPending}
          error={lockMutationError ?? unlockMutationError}
          onSubmit={submitLock}
          onRemove={locks?.[lockingDate] ? removeLock : undefined}
          onClose={() => setLockingDate(null)}
        />
      )}
    </div>
  );
}
