import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { games as gameRegistry } from "../../games/registry";
import type { GameDefinition } from "../../games/types";
import { useSession } from "../../lib/auth-client";
import { fetchAvailableGames } from "../../lib/calendar-games";
import type { CalendarLocks } from "../../lib/calendar-locks";
import { clearRsvp, type RsvpStatus, setRsvp } from "../../lib/calendar-rsvps";
import type { AvailabilityCounts } from "../../lib/offline-availability";
import { qk } from "../../lib/query-keys";
import GameCarousel3D from "./GameCarousel3D";

type Props = {
  date: string;
  locks: CalendarLocks | undefined;
  counts: AvailabilityCounts | undefined;
  onClose: () => void;
  /** Preview mode: skip fetching games, use the full registry, hide RSVP. */
  preview?: boolean;
};

export default function RsvpModal({ date, locks, counts, onClose, preview = false }: Props) {
  const { data: session } = useSession();
  const userId = session?.user?.id ?? null;
  const queryClient = useQueryClient();

  const lock = locks?.[date];
  const viewerRsvp: RsvpStatus | undefined = userId ? lock?.rsvps[userId] : undefined;

  const gamesQuery = useQuery({
    queryKey: qk.availableGames(date),
    queryFn: ({ signal }) => fetchAvailableGames(date, signal),
    enabled: !!lock && !preview,
  });

  const setRsvpMutation = useMutation({
    mutationFn: ({ status }: { status: RsvpStatus }) => setRsvp(date, status),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: qk.calendarLocks() });
      void queryClient.invalidateQueries({ queryKey: qk.availableGames(date) });
    },
  });

  const clearRsvpMutation = useMutation({
    mutationFn: () => clearRsvp(date),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: qk.calendarLocks() });
      void queryClient.invalidateQueries({ queryKey: qk.availableGames(date) });
    },
  });

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const headingDate = useMemo(() => {
    const [y, m, d] = date.split("-").map(Number);
    if (!y || !m || !d) return date;
    return new Date(y, m - 1, d).toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
  }, [date]);

  const availableGames = useMemo<GameDefinition[]>(() => {
    if (preview) return gameRegistry;
    const data = gamesQuery.data;
    if (!data || data.ownedSlugs.length === 0) return [];
    const ownedSet = new Set(data.ownedSlugs);
    return gameRegistry.filter((g) => {
      if (!ownedSet.has(g.slug)) return false;
      const min = g.bgg.minPlayers ?? 0;
      const max = g.bgg.maxPlayers ?? Number.POSITIVE_INFINITY;
      return data.participantCount >= min && data.participantCount <= max;
    });
  }, [gamesQuery.data, preview]);

  const goingCount = preview ? 0 : (gamesQuery.data?.participantCount ?? 0);
  const maybeCount = preview ? 0 : (counts?.[date]?.maybe ?? 0);
  const error =
    setRsvpMutation.error || clearRsvpMutation.error ? "Couldn't update RSVP. Try again." : null;
  const busy = setRsvpMutation.isPending || clearRsvpMutation.isPending;

  const overlay = (
    <AnimatePresence>
      <motion.div
        key="rsvp-modal"
        className="fixed inset-0 z-[200] flex items-center justify-center px-4 py-4 sm:py-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
      >
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="absolute inset-0 cursor-default bg-surface-950/85 backdrop-blur-sm"
        />

        <motion.div
          className="relative z-10 flex h-full w-full max-w-[80rem] flex-col gap-4 rounded-3xl border border-white/10 bg-surface-900/95 p-5 shadow-2xl shadow-black/60 sm:p-7"
          initial={{ y: 16, scale: 0.96, opacity: 0 }}
          animate={{ y: 0, scale: 1, opacity: 1 }}
          exit={{ y: 16, scale: 0.96, opacity: 0 }}
          transition={{ type: "spring", stiffness: 220, damping: 26 }}
        >
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-4 top-4 z-20 rounded-md p-1.5 text-gray-400 transition hover:bg-white/5 hover:text-white"
          >
            <svg
              viewBox="0 0 16 16"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <path d="M3 3l10 10M13 3l-10 10" strokeLinecap="round" />
            </svg>
          </button>

          <header className="flex flex-wrap items-end justify-between gap-4 pr-10">
            <div className="flex min-w-0 flex-col items-start gap-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-amber-300">
                {preview ? "Preview · all games" : "Game night"}
              </p>
              <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
                {preview ? `${availableGames.length} games in library` : headingDate}
              </h2>
              {!preview && (
                <p className="text-xs text-gray-400">
                  <span className="font-semibold text-emerald-300">{goingCount}</span> going
                  {maybeCount > 0 && (
                    <>
                      {" · "}
                      <span className="font-semibold text-amber-300">{maybeCount}</span> maybe
                    </>
                  )}
                </p>
              )}
            </div>

            {!preview && (
              <div className="flex flex-wrap items-center justify-end gap-2">
                {viewerRsvp === "yes" ? (
                  <button
                    type="button"
                    onClick={() => clearRsvpMutation.mutate()}
                    disabled={busy}
                    className="inline-flex items-center gap-2 rounded-full border border-emerald-300/60 bg-emerald-400/15 px-5 py-2 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-400/25 disabled:opacity-50"
                  >
                    <span aria-hidden="true">✓</span>
                    Going · tap to undo
                  </button>
                ) : viewerRsvp === "no" ? (
                  <button
                    type="button"
                    onClick={() => clearRsvpMutation.mutate()}
                    disabled={busy}
                    className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-5 py-2 text-sm font-semibold text-gray-300 transition hover:bg-white/10 disabled:opacity-50"
                  >
                    <span aria-hidden="true">✗</span>
                    Not going · tap to undo
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setRsvpMutation.mutate({ status: "yes" })}
                      disabled={busy}
                      className="rounded-full border border-emerald-400/60 bg-emerald-500/20 px-6 py-2 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/30 disabled:opacity-50"
                    >
                      I'm in
                    </button>
                    <button
                      type="button"
                      onClick={() => setRsvpMutation.mutate({ status: "no" })}
                      disabled={busy}
                      className="rounded-full border border-white/15 bg-white/5 px-6 py-2 text-sm font-semibold text-gray-300 transition hover:bg-white/10 disabled:opacity-50"
                    >
                      I'll pass
                    </button>
                  </>
                )}
              </div>
            )}
          </header>

          {error && <p className="text-center text-xs text-rose-400">{error}</p>}

          <div className="flex min-h-0 flex-1 items-center justify-center">
            {!preview && gamesQuery.isPending ? (
              <p className="text-sm text-gray-500">Finding games…</p>
            ) : availableGames.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/10 px-8 py-10 text-center">
                <p className="text-sm font-medium text-gray-300">No games match.</p>
                <p className="mt-1 text-xs text-gray-500">
                  Either nobody owns the same game, or no game fits the group size.
                </p>
              </div>
            ) : (
              <GameCarousel3D games={availableGames} participantCount={goingCount} />
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );

  if (typeof document === "undefined") return null;
  return createPortal(overlay, document.body);
}
