import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { errorMessageOf } from "../../lib/error-message";
import { adminFetchAvailability } from "../../lib/offline-availability";
import { startOfWeekMonday } from "../../lib/offline-week";
import { qk } from "../../lib/query-keys";
import { countMarkedInWindow } from "../../pages/admin-coverage";
import { XIcon } from "../icons";
import Calendar from "../offline/Calendar";
import { IconButton } from "../ui/IconButton";
import type { AdminUser } from "./types";

type Props = {
  user: AdminUser;
  onClose: () => void;
};

/**
 * Right-side drawer with a read-only Calendar showing one user's per-day
 * availability for the next 6 weeks. Loads its own query keyed by user id
 * so the drawer can be popped open without preloading data anywhere else.
 * Closes on Escape.
 */
export function AvailabilityDrawer({ user, onClose }: Props) {
  const today = useMemo(() => new Date(), []);
  const weekStart = useMemo(() => startOfWeekMonday(today), [today]);

  const availabilityQuery = useQuery({
    queryKey: qk.adminUserAvailability(user.id),
    queryFn: ({ signal }) => adminFetchAvailability(user.id, signal),
  });

  const availability = availabilityQuery.data ?? null;
  const isLoading = availabilityQuery.isPending;
  const error = errorMessageOf(availabilityQuery.error, "Failed to load availability");
  // "Across the next 6 weeks" should not include marks from prior weeks (the
  // raw map persists them indefinitely until the user changes them) — count
  // only the editable window from today onward, the same range CoverageCell
  // uses.
  const markedCount = useMemo(
    () => countMarkedInWindow(availability, today, weekStart),
    [availability, today, weekStart],
  );

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-white/10 bg-surface-950 shadow-2xl shadow-black/50 sm:w-[28rem]">
      <header className="flex shrink-0 items-start justify-between gap-3 border-b border-white/5 px-5 py-4">
        <div className="min-w-0">
          <p className="text-3xs font-semibold uppercase tracking-[0.25em] text-accent-400">
            Availability
          </p>
          <h2 className="mt-1 truncate text-base font-semibold text-white">
            {user.name || user.email}
          </h2>
          <p className="mt-0.5 truncate text-xs text-fg-muted">{user.email}</p>
        </div>
        <IconButton
          variant="ghost"
          size="sm"
          aria-label="Close"
          onClick={onClose}
          icon={<XIcon />}
        />
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-3 px-4 py-4 sm:px-5">
        <p className="shrink-0 text-center text-2xs text-fg-secondary">
          <span className="text-accent-300">Can</span>
          <span className="mx-1 opacity-50">·</span>
          <span className="text-amber-300">Maybe</span>
          <span className="mx-1 opacity-50">·</span>
          <span className="opacity-60">unmarked</span>
        </p>

        {isLoading || availability === null ? (
          <p className="text-center text-xs text-fg-muted">Loading…</p>
        ) : (
          <Calendar
            weekStart={weekStart}
            availability={availability}
            readonlyBefore={today}
            interactive={false}
            compact
          />
        )}

        {error && (
          <p className="shrink-0 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
            {error}
          </p>
        )}

        <p className="shrink-0 text-center text-2xs text-fg-muted">
          {isLoading || availability === null
            ? ""
            : markedCount === 0
              ? "No availability set"
              : `${markedCount} ${markedCount === 1 ? "day" : "days"} marked across the next 6 weeks`}
        </p>
      </div>
    </aside>
  );
}
