import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { games as gameRegistry } from "../../games/registry";
import { useCurrentUser } from "../../hooks/useCurrentUser.ts";
import { fetchAvailableGames } from "../../lib/calendar-games";
import { type CalendarLocks, togglePicksLock } from "../../lib/calendar-locks";
import { type RsvpStatus, setRsvp } from "../../lib/calendar-rsvps";
import { qk } from "../../lib/query-keys";
import AttendeesView from "./AttendeesView";
import GameCarousel3D from "./GameCarousel3D";
import RankedGameList from "./RankedGameList";

type Props = {
  date: string;
  locks: CalendarLocks | undefined;
  onClose: () => void;
};

export default function RsvpModal({ date, locks, onClose }: Props) {
  const { user, isAdmin } = useCurrentUser();
  const userId = user?.id ?? null;
  const queryClient = useQueryClient();

  const lock = locks?.[date];
  const viewerRsvp: RsvpStatus | undefined = userId ? lock?.rsvps[userId] : undefined;

  const gamesQuery = useQuery({
    queryKey: qk.availableGames(date),
    queryFn: ({ signal }) => fetchAvailableGames(date, signal),
    enabled: !!lock,
  });

  const setRsvpMutation = useMutation({
    mutationFn: ({ status, auto }: { status: RsvpStatus; auto?: boolean }) =>
      setRsvp(date, status, auto ?? false),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: qk.calendarLocks() });
      void queryClient.invalidateQueries({ queryKey: qk.availableGames(date) });
    },
  });

  const togglePicksLockMutation = useMutation({
    mutationFn: ({ on }: { on: boolean }) => togglePicksLock(date, on),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: qk.calendarLocks() });
      void queryClient.invalidateQueries({ queryKey: qk.availableGames(date) });
    },
  });

  const isHost = !!lock?.host && lock.host.userId === userId;
  const canTogglePicksLock = !!lock && (isAdmin || isHost);
  const picksLocked = !!lock?.picksLockedAt;

  // Opening the card is the physical interaction we care about (the user
  // has now seen the location, time, and game picks), so we promote the
  // RSVP to a manual yes — both for first-time openers (no row yet) and
  // for users who were lock-batch auto-yes'd (auto=1 row → re-write as
  // auto=0 to clear the "Hasn't RSVP'd yet" pill). Explicit "no" survives
  // — we don't override a deliberate decline.
  const autoRsvpRef = useRef(false);
  useEffect(() => {
    if (!lock || !userId) return;
    if (viewerRsvp === "no") return;
    if (autoRsvpRef.current) return;
    // If the guest list is sealed and the viewer wasn't on it, never
    // auto-RSVP — server would reject and we'd show a confusing error.
    if (picksLocked && !lock.expectedUserIds.includes(userId) && !isAdmin && !isHost) return;
    autoRsvpRef.current = true;
    setRsvpMutation.mutate({ status: "yes" });
  }, [lock, userId, viewerRsvp, setRsvpMutation.mutate, picksLocked, isAdmin, isHost]);

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

  const definiteCount = gamesQuery.data?.definiteCount ?? 0;
  const tentativeCount = gamesQuery.data?.tentativeCount ?? 0;
  const reactions = gamesQuery.data?.reactions ?? {};
  const topSlugs = gamesQuery.data?.topSlugs ?? [];
  const attendees = gamesQuery.data?.attendees ?? [];

  // When picks are locked, the modal contents are inaccessible to anyone who
  // wasn't in the expected (RSVP yes / maybe) snapshot at lock-in time. The
  // host and admin can still see everything regardless. Past attendees who
  // RSVPed "no" are still in expectedUserIds and retain access.
  const lockedOut =
    picksLocked &&
    !!lock &&
    !!userId &&
    !isAdmin &&
    !isHost &&
    !lock.expectedUserIds.includes(userId);

  const availableGames = useMemo(() => {
    const data = gamesQuery.data;
    if (!data || data.ownedSlugs.length === 0) return [];
    const ownedSet = new Set(data.ownedSlugs);
    const lo = data.definiteCount;
    const hi = data.definiteCount + data.tentativeCount;
    // Only suggest games that fit *every* headcount in the [definite,
    // definite+tentative] window — i.e. game.minPlayers ≤ definite AND
    // game.maxPlayers ≥ definite+tentative. A game that caps at
    // `definite` is no use if a maybe shows up; one that needs more than
    // `definite+tentative` can't be played at all. Previously this used
    // overlap (min ≤ hi && max ≥ lo), which let games like Azul (max 4)
    // through on a 4-going / 3-maybe night.
    return gameRegistry.filter((g) => {
      if (!ownedSet.has(g.slug)) return false;
      const min = g.bgg.minPlayers ?? 0;
      const max = g.bgg.maxPlayers ?? Number.POSITIVE_INFINITY;
      return min <= lo && max >= hi;
    });
  }, [gamesQuery.data]);

  const hypedCount = useMemo(
    () => availableGames.filter((g) => (reactions[g.slug]?.hype ?? 0) > 0).length,
    [availableGames, reactions],
  );

  // Default to "pick games"; the user switches via the toggle below or by
  // navigating past the rightmost card.
  const [view, setView] = useState<"pick" | "results" | "attendees">("pick");
  const canShowResults = hypedCount > 0;
  const canShowAttendees = attendees.length > 0;
  const showViewToggle = canShowResults || canShowAttendees;
  // Guard against a stale view selection if the underlying availability
  // disappeared (e.g. the only hyped game was un-hyped and we're still on
  // the results tab). Fall back to "pick" silently.
  const effectiveView: "pick" | "results" | "attendees" =
    view === "results" && !canShowResults
      ? "pick"
      : view === "attendees" && !canShowAttendees
        ? "pick"
        : view;

  // While the auto-yes mutation is in flight on first open, render "Going"
  // optimistically so the header doesn't flicker through an empty state.
  const effectiveRsvp: RsvpStatus = viewerRsvp ?? "yes";

  const error = setRsvpMutation.error ? "Couldn't update RSVP. Try again." : null;
  const busy = setRsvpMutation.isPending;

  const overlay = (
    <AnimatePresence>
      <motion.div
        key="rsvp-modal"
        className="fixed inset-0 z-[200] flex items-center justify-center px-2 py-2 sm:px-4 sm:py-6"
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
          className="relative z-10 flex h-full w-full max-w-[80rem] flex-col gap-2 rounded-3xl border border-white/10 bg-surface-900/95 p-3 shadow-2xl shadow-black/60 sm:gap-4 sm:p-7 xl:max-w-[92rem] 2xl:max-w-[110rem]"
          initial={{ y: 16, scale: 0.96, opacity: 0 }}
          animate={{ y: 0, scale: 1, opacity: 1 }}
          exit={{ y: 16, scale: 0.96, opacity: 0 }}
          transition={{ type: "spring", stiffness: 220, damping: 26 }}
        >
          {canTogglePicksLock && (
            <button
              type="button"
              onClick={() => togglePicksLockMutation.mutate({ on: !picksLocked })}
              disabled={togglePicksLockMutation.isPending}
              aria-label={picksLocked ? "Unlock guest list" : "Lock guest list"}
              title={
                picksLocked
                  ? "Guest list is sealed — click to unlock"
                  : "Lock the guest list — no more last-second RSVPs"
              }
              className={`absolute right-12 top-4 z-20 rounded-md p-1.5 transition disabled:opacity-50 ${
                picksLocked
                  ? "bg-amber-400/15 text-amber-200 hover:bg-amber-400/25"
                  : "text-gray-400 hover:bg-white/5 hover:text-white"
              }`}
            >
              <PadlockGlyph closed={picksLocked} />
            </button>
          )}

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

          <header className="flex min-w-0 flex-col items-start gap-1 pr-20">
            <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-amber-300">
              Game night
            </p>
            <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
              {headingDate}
            </h2>
            <p className="text-xs text-gray-400">
              <span className="font-semibold text-emerald-300">{definiteCount}</span> going
              {tentativeCount > 0 && (
                <>
                  {" · "}
                  <span className="font-semibold text-amber-300">{tentativeCount}</span> maybe
                </>
              )}
            </p>
            {lock && (lock.host || lock.eventTime || lock.address) && (
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-300">
                {lock.host && <HostLine name={lock.host.name} />}
                {lock.eventTime && <TimeLine value={lock.eventTime} />}
                {lock.address && <AddressLink address={lock.address} />}
              </div>
            )}
          </header>

          {error && <p className="text-center text-xs text-rose-400">{error}</p>}

          {lockedOut && (
            <div className="flex min-h-0 flex-1 items-center justify-center px-4">
              <div className="max-w-md rounded-2xl border border-amber-300/30 bg-amber-400/[0.06] px-6 py-8 text-center">
                <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-amber-400/20 text-amber-200">
                  <PadlockGlyph closed />
                </div>
                <p className="text-sm font-semibold text-amber-100">Guest list is locked</p>
                <p className="mt-2 text-xs leading-relaxed text-amber-200/70">
                  The host sealed the night before you marked yourself available, so this game night
                  is no longer accepting RSVPs. Catch the next one!
                </p>
              </div>
            </div>
          )}

          {!lockedOut && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              {showViewToggle && viewerRsvp !== "no" ? (
                <div
                  role="tablist"
                  aria-label="View mode"
                  className="inline-flex items-center gap-0.5 rounded-full border border-white/10 bg-surface-950/60 p-0.5 text-[11px] font-semibold sm:text-xs"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={effectiveView === "pick"}
                    onClick={() => setView("pick")}
                    className={`rounded-full px-2 py-1 transition sm:px-3 sm:py-1.5 ${
                      effectiveView === "pick"
                        ? "bg-accent-500/20 text-accent-300"
                        : "text-gray-400 hover:text-white"
                    }`}
                  >
                    Pick
                  </button>
                  {canShowResults && (
                    <button
                      type="button"
                      role="tab"
                      aria-selected={effectiveView === "results"}
                      onClick={() => setView("results")}
                      className={`rounded-full px-2 py-1 transition sm:px-3 sm:py-1.5 ${
                        effectiveView === "results"
                          ? "bg-amber-400/20 text-amber-200"
                          : "text-gray-400 hover:text-white"
                      }`}
                    >
                      Results
                    </button>
                  )}
                  {canShowAttendees && (
                    <button
                      type="button"
                      role="tab"
                      aria-selected={effectiveView === "attendees"}
                      onClick={() => setView("attendees")}
                      className={`rounded-full px-2 py-1 transition sm:px-3 sm:py-1.5 ${
                        effectiveView === "attendees"
                          ? "bg-sky-400/20 text-sky-200"
                          : "text-gray-400 hover:text-white"
                      }`}
                    >
                      Attendees
                    </button>
                  )}
                </div>
              ) : (
                <span aria-hidden="true" />
              )}
              <RsvpSwitch
                value={effectiveRsvp}
                busy={busy}
                onChange={(status) => {
                  if (status !== effectiveRsvp) {
                    setRsvpMutation.mutate({ status });
                  }
                }}
              />
            </div>
          )}

          {!lockedOut && (
            <div className="flex min-h-0 flex-1 items-center justify-center">
              {viewerRsvp === "no" ? (
                <div className="max-w-md rounded-2xl border border-rose-400/25 bg-rose-500/[0.06] px-6 py-8 text-center">
                  <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-rose-500/20 text-rose-200">
                    <span aria-hidden="true" className="text-lg font-bold">
                      ✗
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-rose-100">You're sitting this one out</p>
                  <p className="mt-2 text-xs leading-relaxed text-rose-200/70">
                    Skipping the picks and votes since you're not coming. Flip the switch back to
                    Going if you change your mind.
                  </p>
                </div>
              ) : gamesQuery.isPending ? (
                <p className="text-sm text-gray-500">Finding games…</p>
              ) : effectiveView === "attendees" ? (
                <AttendeesView attendees={attendees} topSlugs={topSlugs} />
              ) : availableGames.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/10 px-8 py-10 text-center">
                  <p className="text-sm font-medium text-gray-300">No games match.</p>
                  <p className="mt-1 text-xs text-gray-500">
                    Either nobody owns the same game, or no game fits the group size.
                  </p>
                </div>
              ) : effectiveView === "results" ? (
                <RankedGameList
                  date={date}
                  games={availableGames}
                  reactions={reactions}
                  topSlugs={topSlugs}
                />
              ) : (
                <GameCarousel3D
                  games={availableGames}
                  minPlayers={definiteCount}
                  maxPlayers={definiteCount + tentativeCount}
                  date={date}
                  reactions={reactions}
                  onPastEnd={canShowResults ? () => setView("results") : undefined}
                />
              )}
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );

  if (typeof document === "undefined") return null;
  return createPortal(overlay, document.body);
}

function RsvpSwitch({
  value,
  busy,
  onChange,
}: {
  value: RsvpStatus;
  busy: boolean;
  onChange: (next: RsvpStatus) => void;
}) {
  // Segmented switch: both states are always visible so it's obvious the
  // pill is interactive (click to flip), not just a status indicator.
  // The active half is filled with semantic color; the inactive half is a
  // muted ghost the user clicks to switch to that state. Implemented with
  // aria-pressed toggle buttons — the equivalent semantics without the
  // form-control implications of role=radio.
  // Sizing intentionally matches the View-mode tab strip just to its left so
  // both segmented controls fit on the same line on phone and read as a
  // matched pair on PC.
  return (
    <div className="inline-flex shrink-0 items-center rounded-full border border-white/10 bg-surface-950/60 p-0.5 text-[11px] font-semibold sm:text-xs">
      <button
        type="button"
        aria-pressed={value === "yes"}
        aria-label="Going"
        onClick={() => onChange("yes")}
        disabled={busy}
        className={`inline-flex items-center gap-1 rounded-full px-2 py-1 transition disabled:opacity-50 sm:px-3 sm:py-1.5 ${
          value === "yes"
            ? "bg-emerald-400/20 text-emerald-100 ring-1 ring-emerald-300/60 shadow-[0_0_12px_-4px_rgba(16,185,129,0.5)]"
            : "text-gray-500 hover:text-emerald-200"
        }`}
      >
        <span aria-hidden="true">✓</span>
        Going
      </button>
      <button
        type="button"
        aria-pressed={value === "no"}
        aria-label="Not going"
        onClick={() => onChange("no")}
        disabled={busy}
        className={`inline-flex items-center gap-1 rounded-full px-2 py-1 transition disabled:opacity-50 sm:px-3 sm:py-1.5 ${
          value === "no"
            ? "bg-rose-500/20 text-rose-100 ring-1 ring-rose-300/60 shadow-[0_0_12px_-4px_rgba(244,63,94,0.5)]"
            : "text-gray-500 hover:text-rose-200"
        }`}
      >
        <span aria-hidden="true">✗</span>
        Not going
      </button>
    </div>
  );
}

function HostLine({ name }: { name: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <HostIcon />
      <span>
        <span className="text-gray-500">Host </span>
        <span className="font-semibold text-white">{name}</span>
      </span>
    </span>
  );
}

function TimeLine({ value }: { value: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <ClockIcon />
      <span className="font-semibold tabular-nums text-white">{value}</span>
    </span>
  );
}

function AddressLink({ address }: { address: string }) {
  const mapHref = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
  return (
    <a
      href={mapHref}
      target="_blank"
      rel="noreferrer noopener"
      className="inline-flex max-w-full items-center gap-1.5 truncate text-emerald-300 underline-offset-2 hover:text-emerald-200 hover:underline"
    >
      <PinIcon />
      <span className="truncate">{address}</span>
    </a>
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

function PadlockGlyph({ closed }: { closed: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-4 w-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="7" width="10" height="7" rx="1.5" />
      {closed ? (
        // Closed: full shackle attached on both sides
        <path d="M5.5 7V4.5a2.5 2.5 0 015 0V7" />
      ) : (
        // Open: shackle swung up and to the right
        <path d="M5.5 7V4.5a2.5 2.5 0 014.5-1.5" />
      )}
    </svg>
  );
}
