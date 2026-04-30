import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AvailabilityActionBar } from "../components/offline/AvailabilityActionBar";
import Calendar from "../components/offline/Calendar";
import { TopNav, TopNavBackButton } from "../components/TopNav";
import { useSession } from "../lib/auth-client";
import {
  type Availability,
  type AvailabilityMap,
  adminFetchAllAvailability,
  fetchAvailability,
  pushAvailability,
} from "../lib/offline-availability";
import { startOfWeekMonday } from "../lib/offline-week";
import { qk } from "../lib/query-keys";

type Mode = "view" | "edit";

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

  const committed: AvailabilityMap = availabilityQuery.data ?? {};
  const allAvailability = aggregateQuery.data ?? null;

  const [mode, setMode] = useState<Mode>("view");
  const [draft, setDraft] = useState<AvailabilityMap>({});

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

  function handleChange(key: string, value: Availability | undefined) {
    setDraft((prev) => {
      const next = { ...prev };
      if (value === undefined) delete next[key];
      else next[key] = value;
      return next;
    });
  }

  const visible = mode === "edit" ? draft : committed;
  const markedCount = Object.keys(visible).length;
  const errorMessage = saveMutation.error
    ? saveMutation.error instanceof Error
      ? saveMutation.error.message
      : "Could not save. Try again."
    : null;

  return (
    <div className="flex min-h-dvh flex-col bg-surface-950 bg-grid">
      <TopNav>
        <TopNavBackButton to="/" label="Dashboard" />
      </TopNav>

      <div className="flex min-h-0 flex-1 flex-col gap-3 px-3 py-3 sm:gap-5 sm:px-6 sm:py-5">
        <p
          className={`shrink-0 text-center text-[11px] text-gray-400 ${
            mode === "edit" ? "" : "invisible"
          }`}
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
          dayLabels={isAdmin ? (allAvailability ?? undefined) : undefined}
        />

        <AvailabilityActionBar
          mode={mode}
          markedCount={markedCount}
          saving={saveMutation.isPending}
          error={errorMessage}
          onEdit={enterEdit}
          onCancel={cancel}
          onSave={save}
        />
      </div>
    </div>
  );
}
