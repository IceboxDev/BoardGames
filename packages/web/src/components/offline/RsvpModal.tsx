import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { games as gameRegistry } from "../../games/registry";
import type { GameDefinition } from "../../games/types";
import { useSession } from "../../lib/auth-client";
import { fetchAvailableGames } from "../../lib/calendar-games";
import type { CalendarLocks } from "../../lib/calendar-locks";
import { type RsvpStatus, setRsvp } from "../../lib/calendar-rsvps";
import { qk } from "../../lib/query-keys";
import GameCarousel3D from "./GameCarousel3D";
import RankedGameList from "./RankedGameList";

type Props = {
  date: string;
  locks: CalendarLocks | undefined;
  onClose: () => void;
  /** Preview mode: skip fetching games, use the full registry, hide RSVP. */
  preview?: boolean;
};

export default function RsvpModal({ date, locks, onClose, preview = false }: Props) {
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

  // Auto-confirm "yes" the first time a viewer opens the modal without an
  // existing RSVP — opening the overlay is itself the commitment. Existing
  // "yes" or "no" choices are preserved on subsequent re-opens.
  const autoRsvpRef = useRef(false);
  useEffect(() => {
    if (preview) return;
    if (!lock || !userId) return;
    if (viewerRsvp !== undefined) return;
    if (autoRsvpRef.current) return;
    autoRsvpRef.current = true;
    setRsvpMutation.mutate({ status: "yes" });
  }, [preview, lock, userId, viewerRsvp, setRsvpMutation.mutate]);

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

  const definiteCount = preview ? 0 : (gamesQuery.data?.definiteCount ?? 0);
  const tentativeCount = preview ? 0 : (gamesQuery.data?.tentativeCount ?? 0);
  const reactions = preview ? {} : (gamesQuery.data?.reactions ?? {});

  const availableGames = useMemo<GameDefinition[]>(() => {
    if (preview) return gameRegistry;
    const data = gamesQuery.data;
    if (!data || data.ownedSlugs.length === 0) return [];
    const ownedSet = new Set(data.ownedSlugs);
    const lo = data.definiteCount;
    const hi = data.definiteCount + data.tentativeCount;
    return gameRegistry.filter((g) => {
      if (!ownedSet.has(g.slug)) return false;
      const min = g.bgg.minPlayers ?? 0;
      const max = g.bgg.maxPlayers ?? Number.POSITIVE_INFINITY;
      return min <= hi && max >= lo;
    });
  }, [gamesQuery.data, preview]);

  const hypedCount = useMemo(
    () => availableGames.filter((g) => (reactions[g.slug]?.hype ?? 0) > 0).length,
    [availableGames, reactions],
  );

  // Always default to "pick games"; the user can switch to results via the
  // Pick / Results toggle below, or by navigating past the rightmost card.
  const [view, setView] = useState<"pick" | "results">("pick");
  const canShowResults = hypedCount > 0;
  const showRanked = view === "results" && canShowResults;
  const showViewToggle = !preview && canShowResults;

  // While the auto-yes mutation is in flight on first open, render "Going"
  // optimistically so the header doesn't flicker through an empty state.
  const effectiveRsvp: RsvpStatus = viewerRsvp ?? "yes";

  const error = setRsvpMutation.error ? "Couldn't update RSVP. Try again." : null;
  const busy = setRsvpMutation.isPending;

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
                  <span className="font-semibold text-emerald-300">{definiteCount}</span> going
                  {tentativeCount > 0 && (
                    <>
                      {" · "}
                      <span className="font-semibold text-amber-300">{tentativeCount}</span> maybe
                    </>
                  )}
                </p>
              )}
              {!preview && lock && (lock.host || lock.eventTime || lock.address) && (
                <EventDetails
                  host={lock.host?.name ?? null}
                  eventTime={lock.eventTime}
                  address={lock.address}
                />
              )}
            </div>

            {!preview && (
              <div className="flex flex-wrap items-center justify-end gap-2">
                {showViewToggle && (
                  <div
                    role="tablist"
                    aria-label="View mode"
                    className="inline-flex items-center gap-0.5 rounded-full border border-white/10 bg-surface-950/60 p-0.5 text-xs font-semibold"
                  >
                    <button
                      type="button"
                      role="tab"
                      aria-selected={!showRanked}
                      onClick={() => setView("pick")}
                      className={`rounded-full px-3 py-1.5 transition ${
                        !showRanked
                          ? "bg-accent-500/20 text-accent-300"
                          : "text-gray-400 hover:text-white"
                      }`}
                    >
                      Pick games
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={showRanked}
                      onClick={() => setView("results")}
                      className={`rounded-full px-3 py-1.5 transition ${
                        showRanked
                          ? "bg-amber-400/20 text-amber-200"
                          : "text-gray-400 hover:text-white"
                      }`}
                    >
                      Results
                    </button>
                  </div>
                )}
                {effectiveRsvp === "yes" ? (
                  <button
                    type="button"
                    onClick={() => setRsvpMutation.mutate({ status: "no" })}
                    disabled={busy}
                    aria-label="Going — tap to switch to not going"
                    className="inline-flex items-center gap-2 rounded-full border border-emerald-300/60 bg-emerald-400/15 px-5 py-2 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-400/25 disabled:opacity-50"
                  >
                    <span aria-hidden="true">✓</span>
                    Going
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setRsvpMutation.mutate({ status: "yes" })}
                    disabled={busy}
                    aria-label="Not going — tap to switch to going"
                    className="inline-flex items-center gap-2 rounded-full border border-rose-400/60 bg-rose-500/20 px-5 py-2 text-sm font-semibold text-rose-100 transition hover:bg-rose-500/30 disabled:opacity-50"
                  >
                    <span aria-hidden="true">✗</span>
                    Not going
                  </button>
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
            ) : showRanked ? (
              <RankedGameList date={date} games={availableGames} reactions={reactions} />
            ) : (
              <GameCarousel3D
                games={availableGames}
                minPlayers={definiteCount}
                maxPlayers={definiteCount + tentativeCount}
                date={preview ? "" : date}
                reactions={reactions}
                onPastEnd={canShowResults ? () => setView("results") : undefined}
              />
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );

  if (typeof document === "undefined") return null;
  return createPortal(overlay, document.body);
}

function EventDetails({
  host,
  eventTime,
  address,
}: {
  host: string | null;
  eventTime: string | null;
  address: string | null;
}) {
  const mapHref = address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
    : null;
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-300">
      {host && (
        <span className="inline-flex items-center gap-1.5">
          <HostIcon />
          <span>
            <span className="text-gray-500">Host </span>
            <span className="font-semibold text-white">{host}</span>
          </span>
        </span>
      )}
      {eventTime && (
        <span className="inline-flex items-center gap-1.5">
          <ClockIcon />
          <span className="font-semibold tabular-nums text-white">{eventTime}</span>
        </span>
      )}
      {address && mapHref && (
        <a
          href={mapHref}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex max-w-full items-center gap-1.5 truncate text-emerald-300 underline-offset-2 hover:text-emerald-200 hover:underline"
        >
          <PinIcon />
          <span className="truncate">{address}</span>
        </a>
      )}
    </div>
  );
}

function HostIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-3.5 w-3.5 shrink-0 text-gray-400"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 14l6-11 6 11" />
      <path d="M5 14V9h6v5" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-3.5 w-3.5 shrink-0 text-gray-400"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="6" />
      <path d="M8 5v3l2 1.5" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-3.5 w-3.5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M8 14s5-4.5 5-8.5A5 5 0 0 0 3 5.5C3 9.5 8 14 8 14z" />
      <circle cx="8" cy="6" r="1.6" />
    </svg>
  );
}
