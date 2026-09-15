import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { errorMessageOf } from "../../lib/error-message";
import { adminFetchAvailability, adminSetAwayDay } from "../../lib/offline-availability";
import { startOfWeekMonday } from "../../lib/offline-week";
import { qk } from "../../lib/query-keys";
import { countMarkedInWindow } from "../../pages/admin-coverage";
import Calendar from "../offline/Calendar";
import { Drawer } from "../ui/Drawer";
import { ErrorAlert } from "../ui/ErrorAlert";
import { LoadingState } from "../ui/LoadingState";
import { QueryBoundary } from "../ui/QueryBoundary";
import type { AdminUser } from "./types";

type Props = {
  user: AdminUser;
  /** This member's admin-noted away days (from the page's `qk.adminAwayDays()` map). */
  awayDays: readonly string[];
  onClose: () => void;
};

/**
 * Right-side drawer with one user's per-day availability for the next 6
 * weeks. Loads its own query keyed by user id so the drawer can be popped
 * open without preloading data anywhere else. All dialog behavior (scrim,
 * portal, focus trap, Escape) comes from the shared `Drawer` primitive.
 *
 * The member's marks are read-only here; what the admin CAN do is note a
 * blank future day as "away" — a reminder that the member saw the calendar
 * and can't make it — which drops the day from their coverage pie. The note
 * never touches the member's availability, and a day they later mark
 * themselves wins over it.
 */
export function AvailabilityDrawer({ user, awayDays, onClose }: Props) {
  const today = useMemo(() => new Date(), []);
  const weekStart = useMemo(() => startOfWeekMonday(today), [today]);
  const queryClient = useQueryClient();

  const availabilityQuery = useQuery({
    queryKey: qk.adminUserAvailability(user.id),
    queryFn: ({ signal }) => adminFetchAvailability(user.id, signal),
  });

  const awaySet = useMemo(() => new Set(awayDays), [awayDays]);
  const awayMutation = useMutation({
    mutationFn: ({ dateKey, away }: { dateKey: string; away: boolean }) =>
      adminSetAwayDay(user.id, dateKey, away),
    onSuccess: (days) => {
      // The page's map feeds both this drawer and the pie behind it.
      queryClient.setQueryData<Record<string, string[]>>(qk.adminAwayDays(), (prev) => ({
        ...(prev ?? {}),
        [user.id]: days,
      }));
    },
  });

  return (
    <Drawer
      onClose={onClose}
      eyebrow="Availability"
      title={user.name || user.email}
      subheader={<p className="mt-0.5 truncate text-xs text-fg-muted">{user.email}</p>}
    >
      <p className="shrink-0 text-center text-2xs text-fg-secondary">
        <span className="text-accent-300">Can</span>
        <span className="mx-1 opacity-50">·</span>
        <span className="text-amber-300">Maybe</span>
        <span className="mx-1 opacity-50">·</span>
        <span className="opacity-60">unmarked</span>
        <span className="mx-1 opacity-50">·</span>
        <span className="text-fg-muted line-through">Away</span>
      </p>
      <p className="shrink-0 text-center text-3xs text-fg-muted">
        Tap a blank day to note them as away — it leaves their coverage pie.
      </p>

      {awayMutation.error && (
        <ErrorAlert message={errorMessageOf(awayMutation.error, "Could not save the note") ?? ""} />
      )}

      <QueryBoundary
        query={availabilityQuery}
        loading={<LoadingState />}
        errorLabel="Failed to load availability"
      >
        {(availability) => (
          <>
            <Calendar
              weekStart={weekStart}
              availability={availability}
              readonlyBefore={today}
              compact
              awayDays={awaySet}
              awayMode
              onAwayToggle={(dateKey, currentlyAway) =>
                awayMutation.mutate({ dateKey, away: !currentlyAway })
              }
            />
            <MarkedSummary
              availability={availability}
              today={today}
              weekStart={weekStart}
              awayCount={awayDays.filter((d) => availability[d] === undefined).length}
            />
          </>
        )}
      </QueryBoundary>
    </Drawer>
  );
}

function MarkedSummary({
  availability,
  today,
  weekStart,
  awayCount,
}: {
  availability: Parameters<typeof countMarkedInWindow>[0];
  today: Date;
  weekStart: Date;
  awayCount: number;
}) {
  // "Across the next 6 weeks" should not include marks from prior weeks (the
  // raw map persists them indefinitely until the user changes them) — count
  // only the editable window from today onward, the same range CoverageCell
  // uses.
  const markedCount = useMemo(
    () => countMarkedInWindow(availability, today, weekStart),
    [availability, today, weekStart],
  );
  const awayNote = awayCount > 0 ? ` · ${awayCount} away` : "";
  return (
    <p className="shrink-0 text-center text-2xs text-fg-muted">
      {markedCount === 0
        ? `No availability set${awayNote}`
        : `${markedCount} ${markedCount === 1 ? "day" : "days"} marked across the next 6 weeks${awayNote}`}
    </p>
  );
}
