import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { games as gameRegistry } from "../../games/registry";
import { useCurrentUser } from "../../hooks/useCurrentUser.ts";
import { coversWindow } from "../../lib/bgg-format";
import { fetchAvailableGames } from "../../lib/calendar-games";
import { type CalendarLocks, togglePicksLock } from "../../lib/calendar-locks";
import { kickRsvp, type RsvpStatus, setRsvp } from "../../lib/calendar-rsvps";
import { DND_SLUG } from "../../lib/dnd-night";
import { qk } from "../../lib/query-keys";
import { ClockIcon, HostIcon, PadlockIcon, PinIcon } from "../icons";
import {
  EmptyState,
  ErrorAlert,
  IconButton,
  LoadingState,
  Modal,
  SegmentedControl,
  type SegmentedOption,
} from "../ui";
import AttendeesView from "./AttendeesView";
import DndNightPanel from "./DndNightPanel";
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

  const kickMutation = useMutation({
    mutationFn: ({ userId }: { userId: string }) => kickRsvp(date, userId),
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
  const ownedSlugs = gamesQuery.data?.ownedSlugs ?? [];

  // A sealed night whose vote winner is D&D takes over the modal: one quest on
  // the table, a party roster, no bringing. Gated on picks-locked so the normal
  // pick/vote flow runs right up until the guest list is sealed.
  const isDnd = picksLocked && topSlugs[0] === DND_SLUG;

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
    // definite+tentative] window — see `coversWindow` doc. A max-4 game
    // on a 4-going/3-maybe night would lock out the maybes if it became
    // the pick, so it's filtered out here even though `fitsRange` would
    // have allowed it (carousel cards use the looser overlap test).
    const filtered = gameRegistry.filter((g) => ownedSet.has(g.slug) && coversWindow(g, lo, hi));
    // Sort precedence (mirrors the carousel card's badge/border precedence:
    //   New > Best-at-N > default — see CarouselCardFrame):
    //   1. "New" cohort (freshly-added games) leads the whole list.
    //   2. "Best at N" cohort (BGG poll matches the confirmed headcount).
    //   3. Within each cohort, higher averageRating wins.
    //   4. Title alphabetical as a final stable tiebreak.
    return filtered.sort((a, b) => {
      const aNew = a.isNew === true ? 0 : 1;
      const bNew = b.isNew === true ? 0 : 1;
      if (aNew !== bNew) return aNew - bNew;
      const aBest = a.bgg.bestPlayerCount === lo && lo > 0 ? 0 : 1;
      const bBest = b.bgg.bestPlayerCount === lo && lo > 0 ? 0 : 1;
      if (aBest !== bBest) return aBest - bBest;
      const aRating = a.bgg.averageRating ?? 0;
      const bRating = b.bgg.averageRating ?? 0;
      if (aRating !== bRating) return bRating - aRating;
      return a.title.localeCompare(b.title);
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

  const picksLockToggle = canTogglePicksLock ? (
    <IconButton
      variant={picksLocked ? "warning" : "ghost"}
      size="sm"
      pressed={picksLocked}
      aria-label={picksLocked ? "Unlock guest list" : "Lock guest list"}
      title={
        picksLocked
          ? "Guest list is sealed — click to unlock"
          : "Lock the guest list — no more last-second RSVPs"
      }
      disabled={togglePicksLockMutation.isPending}
      onClick={() => togglePicksLockMutation.mutate({ on: !picksLocked })}
      icon={<PadlockIcon closed={picksLocked} />}
    />
  ) : null;

  // Collapse what used to be its own "X going · Y maybe" row into the
  // eyebrow strip — saves a full line of header height on every device.
  // The numeric counts use `normal-case` + reset tracking so they don't
  // inherit the eyebrow's uppercase / wide-letter-spacing rules.
  const eyebrow = (
    <span className="inline-flex flex-wrap items-baseline gap-x-2">
      <span>{isDnd ? "D&D night" : "Game night"}</span>
      {(definiteCount > 0 || tentativeCount > 0) && (
        <span className="inline-flex items-baseline gap-1 tracking-normal normal-case">
          <span aria-hidden="true" className="text-white/30">
            ·
          </span>
          <span className="font-bold text-emerald-300 tabular-nums">{definiteCount}</span>
          <span className="text-fg-secondary">going</span>
          {tentativeCount > 0 && (
            <>
              <span aria-hidden="true" className="text-white/30">
                +
              </span>
              <span className="font-bold text-amber-300 tabular-nums">{tentativeCount}</span>
              <span className="text-fg-secondary">maybe</span>
            </>
          )}
        </span>
      )}
    </span>
  );

  const subheader =
    lock && (lock.host || lock.eventTime || lock.address) ? (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-secondary">
        {lock.host && <HostLine name={lock.host.name} />}
        {lock.eventTime && <TimeLine value={lock.eventTime} />}
        {lock.address && <AddressLink address={lock.address} />}
      </div>
    ) : null;

  return (
    <Modal
      onClose={onClose}
      panelClassName="h-full max-w-[80rem] gap-2 sm:gap-4 sm:p-7 xl:max-w-[92rem] 2xl:max-w-[110rem]"
      eyebrow={eyebrow}
      title={headingDate}
      titleClassName="text-2xl font-bold tracking-tight text-white sm:text-3xl"
      subheader={subheader}
      headerExtra={picksLockToggle}
    >
      {error && <ErrorAlert message={error} className="text-center" />}

      {lockedOut && (
        <EmptyState
          fill
          tone="amber"
          icon={<PadlockIcon closed />}
          title="Guest list is locked"
          description="The host sealed the night before you marked yourself available, so this game night is no longer accepting RSVPs. Catch the next one!"
        />
      )}

      {!lockedOut && (
        // No flex-wrap on purpose: this row MUST stay single-line on every
        // phone, even Galaxy-A13-with-slight-zoom (~330px CSS viewport).
        // Otherwise the game card below loses vertical space. Sizing of the
        // children is tuned so the worst case (3-tab view toggle + Going/Not
        // going) fits at ~250px of content width — see `RsvpSwitch` and the
        // tightened sm padding in SegmentedControl.
        <div className="flex items-center justify-between gap-2">
          {showViewToggle && viewerRsvp !== "no" && !isDnd ? (
            <SegmentedControl
              shape="pill"
              size="sm"
              aria-label="View mode"
              value={effectiveView}
              onChange={setView}
              options={buildViewOptions(canShowResults, canShowAttendees)}
              className="min-w-0"
            />
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
            <EmptyState
              tone="rose"
              className="max-w-md"
              icon={
                <span aria-hidden="true" className="text-lg font-bold">
                  ✗
                </span>
              }
              title="You're sitting this one out"
              description="Skipping the picks and votes since you're not coming. Flip the switch back to Going if you change your mind."
            />
          ) : gamesQuery.isPending ? (
            <LoadingState label="Finding games…" />
          ) : isDnd ? (
            <DndNightPanel attendees={attendees} partyCount={definiteCount} />
          ) : effectiveView === "attendees" ? (
            <AttendeesView
              attendees={attendees}
              topSlugs={topSlugs}
              ownedSlugs={ownedSlugs}
              canKick={isAdmin || isHost}
              onKick={(userId) => kickMutation.mutate({ userId })}
              kickingUserId={
                kickMutation.isPending ? (kickMutation.variables?.userId ?? null) : null
              }
            />
          ) : availableGames.length === 0 ? (
            <EmptyState
              title="No games match"
              description="Either nobody owns the same game, or no game fits the group size."
            />
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
    </Modal>
  );
}

// RSVP "Going / Not going" toggle. Sizing intentionally matches the view-mode
// tab strip just to its left so both controls fit on one line on phone and
// read as a matched pair on PC. `emphasizeActive` adds the colored ring +
// glow that makes the active state read as "committed" rather than a passive
// status indicator.
//
// The label text is rendered `sr-only` below 420px viewport and visible from
// there up. That width matches the cutoff where a 3-tab view toggle + full
// "Going / Not going" labels would otherwise spill onto a second line on a
// p-6 modal panel. Title attribute + sr-only span keep the button
// accessible to screen readers and tooltip-on-hover when the visible label
// is hidden.
const RSVP_OPTIONS: SegmentedOption<RsvpStatus>[] = [
  {
    value: "yes",
    label: <span className="sr-only xs2:not-sr-only">Going</span>,
    icon: <span aria-hidden="true">✓</span>,
    tone: "emerald",
    title: "Going",
  },
  {
    value: "no",
    label: <span className="sr-only xs2:not-sr-only">Not going</span>,
    icon: <span aria-hidden="true">✗</span>,
    tone: "rose",
    title: "Not going",
  },
];

function RsvpSwitch({
  value,
  busy,
  onChange,
}: {
  value: RsvpStatus;
  busy: boolean;
  onChange: (next: RsvpStatus) => void;
}) {
  return (
    <SegmentedControl
      shape="pill"
      size="sm"
      selectionMode="toggle"
      emphasizeActive
      aria-label="RSVP"
      value={value}
      onChange={onChange}
      disabled={busy}
      options={RSVP_OPTIONS}
      className="shrink-0"
    />
  );
}

const VIEW_OPTION_PICK: SegmentedOption<"pick" | "results" | "attendees"> = {
  value: "pick",
  label: "Pick",
  tone: "accent",
};
const VIEW_OPTION_RESULTS: SegmentedOption<"pick" | "results" | "attendees"> = {
  value: "results",
  label: "Results",
  tone: "amber",
};
const VIEW_OPTION_ATTENDEES: SegmentedOption<"pick" | "results" | "attendees"> = {
  value: "attendees",
  label: "Attendees",
  tone: "sky",
};

function buildViewOptions(
  canShowResults: boolean,
  canShowAttendees: boolean,
): SegmentedOption<"pick" | "results" | "attendees">[] {
  const out: SegmentedOption<"pick" | "results" | "attendees">[] = [VIEW_OPTION_PICK];
  if (canShowResults) out.push(VIEW_OPTION_RESULTS);
  if (canShowAttendees) out.push(VIEW_OPTION_ATTENDEES);
  return out;
}

function HostLine({ name }: { name: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-fg-secondary">
      <HostIcon className="h-3.5 w-3.5 shrink-0" />
      <span>
        <span className="text-fg-muted">Host </span>
        <span className="font-semibold text-white">{name}</span>
      </span>
    </span>
  );
}

function TimeLine({ value }: { value: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-fg-secondary">
      <ClockIcon className="h-3.5 w-3.5 shrink-0" />
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
      <PinIcon className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{address}</span>
    </a>
  );
}
