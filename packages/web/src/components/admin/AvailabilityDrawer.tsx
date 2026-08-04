import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { adminFetchAvailability } from "../../lib/offline-availability";
import { startOfWeekMonday } from "../../lib/offline-week";
import { qk } from "../../lib/query-keys";
import { countMarkedInWindow } from "../../pages/admin-coverage";
import Calendar from "../offline/Calendar";
import { Drawer } from "../ui/Drawer";
import { LoadingState } from "../ui/LoadingState";
import { QueryBoundary } from "../ui/QueryBoundary";
import type { AdminUser } from "./types";

type Props = {
  user: AdminUser;
  onClose: () => void;
};

/**
 * Right-side drawer with a read-only Calendar showing one user's per-day
 * availability for the next 6 weeks. Loads its own query keyed by user id
 * so the drawer can be popped open without preloading data anywhere else.
 * All dialog behavior (scrim, portal, focus trap, Escape) comes from the
 * shared `Drawer` primitive.
 */
export function AvailabilityDrawer({ user, onClose }: Props) {
  const today = useMemo(() => new Date(), []);
  const weekStart = useMemo(() => startOfWeekMonday(today), [today]);

  const availabilityQuery = useQuery({
    queryKey: qk.adminUserAvailability(user.id),
    queryFn: ({ signal }) => adminFetchAvailability(user.id, signal),
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
      </p>

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
              interactive={false}
              compact
            />
            <MarkedSummary availability={availability} today={today} weekStart={weekStart} />
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
}: {
  availability: Parameters<typeof countMarkedInWindow>[0];
  today: Date;
  weekStart: Date;
}) {
  // "Across the next 6 weeks" should not include marks from prior weeks (the
  // raw map persists them indefinitely until the user changes them) — count
  // only the editable window from today onward, the same range CoverageCell
  // uses.
  const markedCount = useMemo(
    () => countMarkedInWindow(availability, today, weekStart),
    [availability, today, weekStart],
  );
  return (
    <p className="shrink-0 text-center text-2xs text-fg-muted">
      {markedCount === 0
        ? "No availability set"
        : `${markedCount} ${markedCount === 1 ? "day" : "days"} marked across the next 6 weeks`}
    </p>
  );
}
