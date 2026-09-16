import { useEffect, useRef, useState } from "react";
import { useCurrentUser } from "../../hooks/useCurrentUser.ts";
import { type CalendarLocks, nightLabel } from "../../lib/calendar-locks";
import type { RsvpStatus } from "../../lib/calendar-rsvps";
import { compactAddress } from "../../lib/compact-address.ts";
import { formatDayKey } from "../../lib/date-format.ts";
import { DND_SLUG } from "../../lib/dnd-night";
import { EXIT_CATALOG_SLUG } from "../../lib/exit-night";
import { canManageNight, seatsLeft, viewerSeat, waitlistPosition } from "../../lib/night-access";
import { reportPageView } from "../../lib/page-views";
import { ClockIcon, HostIcon, PadlockIcon, PinIcon, UsersIcon } from "../icons";
import {
  Badge,
  EmptyState,
  ErrorAlert,
  IconButton,
  LoadingState,
  Modal,
  SegmentedControl,
  type SegmentedOption,
  useConfirm,
} from "../ui";
import AttendeesView from "./AttendeesView";
import DndNightPanel from "./DndNightPanel";
import ExitNightPanel from "./ExitNightPanel";
import GameCarousel3D from "./GameCarousel3D";
import GameReactions from "./GameReactions";
import PrivateNightManageSheet from "./PrivateNightManageSheet";
import RankedGameList from "./RankedGameList";
import { useRsvpAvailability } from "./useRsvpAvailability.ts";

type Props = {
  date: string;
  locks: CalendarLocks | undefined;
  onClose: () => void;
};

type View = "pick" | "results" | "attendees";

export default function RsvpModal({ date, locks, onClose }: Props) {
  const { user, isAdmin } = useCurrentUser();
  const userId = user?.id ?? null;

  // Opening a night's card is a view worth trailing (deduped per session).
  useEffect(() => {
    if (userId) reportPageView("night", date);
  }, [userId, date]);

  const lock = locks?.[date];
  const viewerRsvp: RsvpStatus | undefined = userId ? lock?.rsvps[userId] : undefined;
  // Private night: invitation only, seat-capped, host-curated. The server
  // already redacted the lock for outsiders — the dashboard sends them to the
  // peek instead of here — so inside this modal the viewer is on the list.
  const isPrivate = !!lock?.isPrivate;
  const seat = viewerSeat(lock, userId, isAdmin);
  const canManage = isPrivate && canManageNight(lock, userId, isAdmin);
  const [manageOpen, setManageOpen] = useState(false);
  const { confirm, confirmDialog } = useConfirm();

  const {
    gamesQuery,
    setRsvpMutation,
    togglePicksLockMutation,
    kickMutation,
    definiteCount,
    tentativeCount,
    reactions,
    topSlugs,
    attendees,
    ownedSlugs,
    newSlugs,
    availableGames,
    hypedCount,
    playerWindow,
    viewerCanReact,
  } = useRsvpAvailability({ date, enabled: !!lock && !lock.redacted });

  const isHost = !!lock?.host && lock.host.userId === userId;
  // A private night's guest list is the invitation: the server reports it
  // sealed from lock-in and refuses the padlock, so the toggle is not shown.
  const canTogglePicksLock = !!lock && !isPrivate && (isAdmin || isHost);
  const picksLocked = !!lock?.picksLockedAt;
  const pickMode = gamesQuery.data?.pickMode ?? lock?.pickMode ?? "group";
  const hostPicks = isPrivate && pickMode === "host";

  // Opening the card is the physical interaction we care about (the user
  // has now seen the location, time, and game picks), so we promote the
  // RSVP to a manual yes — both for first-time openers (no row yet) and
  // for users who were lock-batch auto-yes'd (auto=1 row → re-write as
  // auto=0 to clear the "Hasn't RSVP'd yet" pill). Explicit "no" survives
  // — we don't override a deliberate decline.
  //
  // NEVER on a private night: a seat is claimed by a deliberate "I'm in",
  // first come first served, and opening the card must not take one.
  const autoRsvpRef = useRef(false);
  useEffect(() => {
    if (!lock || !userId || isPrivate) return;
    if (viewerRsvp === "no") return;
    if (autoRsvpRef.current) return;
    // If the guest list is sealed and the viewer wasn't on it, never
    // auto-RSVP — server would reject and we'd show a confusing error.
    if (picksLocked && !lock.expectedUserIds.includes(userId) && !isAdmin && !isHost) return;
    autoRsvpRef.current = true;
    setRsvpMutation.mutate({ status: "yes" });
  }, [lock, userId, viewerRsvp, setRsvpMutation.mutate, picksLocked, isAdmin, isHost, isPrivate]);

  const headingDate = formatDayKey(date, "weekday");

  // A sealed night whose vote winner is D&D takes over the modal: one quest on
  // the table, a party roster, no bringing. Gated on picks-locked so the normal
  // pick/vote flow runs right up until the guest list is sealed.
  const isDnd = picksLocked && topSlugs[0] === DND_SLUG;
  // Likewise for EXIT — except the winner is a franchise, so the takeover is a
  // second-stage vote narrowing down which box to play (ExitNightPanel).
  const isExit = picksLocked && topSlugs[0] === EXIT_CATALOG_SLUG;

  // When picks are locked, the modal contents are inaccessible to anyone who
  // wasn't in the expected (RSVP yes / maybe) snapshot at lock-in time. The
  // host and admin can still see everything regardless. Past attendees who
  // RSVPed "no" are still in expectedUserIds and retain access.
  //
  // A viewer holding their own "yes" is a committed guest and is NEVER locked
  // out, even if they've fallen out of the expected snapshot (e.g. a re-lock
  // that re-derived the list) — their RSVP is the authoritative commitment.
  // A private night's guest list is the invitation: everyone in here is on it.
  const lockedOut =
    !isPrivate &&
    picksLocked &&
    !!lock &&
    !!userId &&
    !isAdmin &&
    !isHost &&
    viewerRsvp !== "yes" &&
    !lock.expectedUserIds.includes(userId);

  // Default to "pick games"; the user switches via the toggle below or by
  // navigating past the rightmost card. A guest who can't pick (an invitee on
  // a host-curated night) starts on the lineup, or the seats before there is one.
  const [view, setView] = useState<View>(() =>
    viewerCanReact ? "pick" : hypedCount > 0 ? "results" : "attendees",
  );
  const canShowPick = viewerCanReact;
  const canShowResults = hypedCount > 0;
  const canShowAttendees = attendees.length > 0;
  const showViewToggle = canShowPick ? canShowResults || canShowAttendees : true;
  // Guard against a stale view selection if the underlying availability
  // disappeared (e.g. the only hyped game was un-hyped and we're still on
  // the results tab). Fall back to "pick" silently.
  const effectiveView: View =
    view === "results" && !canShowResults
      ? canShowPick
        ? "pick"
        : "attendees"
      : view === "attendees" && !canShowAttendees
        ? canShowPick
          ? "pick"
          : "results"
        : view === "pick" && !canShowPick
          ? canShowResults
            ? "results"
            : "attendees"
          : view;

  // While the auto-yes mutation is in flight on first open, render "Going"
  // optimistically so the header doesn't flicker through an empty state.
  // A private night has no auto-yes: no answer is exactly that.
  const effectiveRsvp: RsvpStatus | undefined = isPrivate ? viewerRsvp : (viewerRsvp ?? "yes");

  const error = setRsvpMutation.error ? "Couldn't update RSVP. Try again." : null;
  const busy = setRsvpMutation.isPending;

  const picksLockToggle = canTogglePicksLock ? (
    <IconButton
      tone={picksLocked ? "amber" : "neutral"}
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
  const headerExtra =
    canManage || picksLockToggle ? (
      <div className="flex items-center gap-1.5">
        {canManage && (
          <IconButton
            tone="neutral"
            size="sm"
            aria-label="Manage the night"
            title="Seats, guest list, how games get picked"
            onClick={() => setManageOpen(true)}
            icon={<UsersIcon className="h-4 w-4" />}
          />
        )}
        {picksLockToggle}
      </div>
    ) : null;

  // Collapse what used to be its own "X going · Y maybe" row into the
  // eyebrow strip — saves a full line of header height on every device.
  // The numeric counts use `normal-case` + reset tracking so they don't
  // inherit the eyebrow's uppercase / wide-letter-spacing rules.
  const seats = lock?.seats ?? null;
  const slotLabel = nightLabel(date);
  const eyebrow = (
    <span className="inline-flex flex-wrap items-baseline gap-x-2">
      <span>
        {isDnd ? "D&D night" : isExit ? "EXIT night" : isPrivate ? "Private night" : "Game night"}
      </span>
      {slotLabel && (
        <span className="inline-flex items-baseline gap-x-2">
          <span aria-hidden="true" className="text-fg-strong/30">
            ·
          </span>
          <span className="text-warn-gold">{slotLabel}</span>
        </span>
      )}
      {isPrivate && lock?.title && (
        <span className="max-w-56 truncate font-semibold tracking-normal normal-case text-fg-strong">
          {lock.title}
        </span>
      )}
      {isPrivate && seats ? (
        <span className="inline-flex items-baseline gap-1 tracking-normal normal-case">
          <span aria-hidden="true" className="text-fg-strong/30">
            ·
          </span>
          <span
            className={`font-bold tabular-nums ${seats.taken >= seats.total ? "text-emerald-300" : "text-fg-strong"}`}
          >
            {seats.taken}/{seats.total}
          </span>
          <span className="text-fg-secondary">seats</span>
          {seats.waitlisted > 0 && (
            <>
              <span aria-hidden="true" className="text-fg-strong/30">
                +
              </span>
              <span className="font-bold text-amber-300 tabular-nums">{seats.waitlisted}</span>
              <span className="text-fg-secondary">waiting</span>
            </>
          )}
        </span>
      ) : (
        (definiteCount > 0 || tentativeCount > 0) && (
          <span className="inline-flex items-baseline gap-1 tracking-normal normal-case">
            <span aria-hidden="true" className="text-fg-strong/30">
              ·
            </span>
            <span className="font-bold text-emerald-300 tabular-nums">{definiteCount}</span>
            <span className="text-fg-secondary">going</span>
            {tentativeCount > 0 && (
              <>
                <span aria-hidden="true" className="text-fg-strong/30">
                  +
                </span>
                <span className="font-bold text-amber-300 tabular-nums">{tentativeCount}</span>
                <span className="text-fg-secondary">maybe</span>
              </>
            )}
          </span>
        )
      )}
    </span>
  );

  const left = seatsLeft(lock);
  const position = waitlistPosition(lock, userId);
  const subheader =
    lock && (lock.host || lock.eventTime || lock.address || isPrivate) ? (
      <div className="flex max-w-full flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-secondary">
        {lock.host && <HostLine name={lock.host.name} />}
        {lock.eventTime && <TimeLine value={lock.eventTime} />}
        {lock.address && <AddressLink address={lock.address} />}
        {isPrivate && seat === "invited" && (
          <span className="font-semibold text-accent-200">
            You're invited
            {left !== null && (
              <span className="font-normal text-fg-secondary">
                {" "}
                ·{" "}
                {left === 0
                  ? "the table is full — you'd join the waitlist"
                  : `${left} ${left === 1 ? "seat" : "seats"} left`}
              </span>
            )}
          </span>
        )}
        {isPrivate && hostPicks && lock.host && (
          <span className="text-fg-muted">{lock.host.name} picks the games</span>
        )}
      </div>
    ) : null;

  // Leaving a seat frees it for the next in line; coming back queues again.
  async function answer(status: RsvpStatus) {
    if (status === effectiveRsvp) return;
    if (isPrivate && status === "no" && (seat === "seated" || seat === "waitlisted")) {
      const ok = await confirm({
        title: seat === "seated" ? "Give up your seat?" : "Leave the waitlist?",
        description:
          seat === "seated"
            ? "Your seat goes to the next person in line. If you come back later, you join the end of the queue."
            : "You can rejoin later — at the end of the queue.",
        confirmLabel: seat === "seated" ? "Give up seat" : "Leave",
      });
      if (!ok) return;
    }
    setRsvpMutation.mutate({ status });
  }

  const viewOptions = buildViewOptions({
    canShowPick,
    canShowResults,
    canShowAttendees,
    resultsLabel: hostPicks ? "Lineup" : "Results",
    attendeesLabel: isPrivate ? "Seats" : "Attendees",
  });

  return (
    <Modal
      onClose={onClose}
      size="full"
      density="compact"
      eyebrow={eyebrow}
      title={headingDate}
      titleClassName="text-xl font-bold tracking-tight text-fg-strong xs2:text-2xl sm:text-3xl"
      subheader={subheader}
      headerExtra={headerExtra}
    >
      {error && <ErrorAlert message={error} className="text-center" />}

      {lockedOut && (
        <EmptyState
          fillHeight
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
          {showViewToggle && viewerRsvp !== "no" && !isDnd && !isExit ? (
            <SegmentedControl
              shape="pill"
              size="sm"
              aria-label="View mode"
              value={effectiveView}
              onChange={setView}
              options={viewOptions}
              className="min-w-0"
            />
          ) : (
            <span aria-hidden="true" />
          )}
          {isPrivate && seat === "host" ? (
            <Badge tone="amber" shape="pill" size="sm">
              Hosting
            </Badge>
          ) : isPrivate ? (
            <SeatSwitch
              value={effectiveRsvp}
              seat={seat}
              position={position}
              busy={busy}
              onChange={answer}
            />
          ) : (
            <RsvpSwitch value={effectiveRsvp ?? "yes"} busy={busy} onChange={answer} />
          )}
        </div>
      )}

      {!lockedOut && isPrivate && seat === "waitlisted" && (
        <p className="rounded-card-md border border-amber-400/30 bg-amber-400/[0.06] px-3 py-1.5 text-center text-xs text-amber-100">
          You're {position !== null ? `#${position}` : ""} on the waitlist — a freed seat is yours
          automatically.
        </p>
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
              description={
                isPrivate
                  ? "Flip the switch back to I'm in if you change your mind — you'd join the end of the queue."
                  : "Skipping the picks and votes since you're not coming. Flip the switch back to Going if you change your mind."
              }
            />
          ) : gamesQuery.isPending ? (
            <LoadingState label="Finding games…" />
          ) : isDnd ? (
            <DndNightPanel attendees={attendees} partyCount={definiteCount} />
          ) : isExit ? (
            <ExitNightPanel date={date} attendees={attendees} partyCount={definiteCount} />
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
              seats={isPrivate ? seats : null}
              showVotes={!hostPicks}
            />
          ) : availableGames.length === 0 ? (
            <EmptyState
              title="No games match"
              description={
                isPrivate
                  ? "Nobody seated owns a game that fits the table size yet."
                  : "Either nobody owns the same game, or no game fits the group size."
              }
            />
          ) : effectiveView === "results" ? (
            <RankedGameList
              date={date}
              games={availableGames}
              reactions={reactions}
              topSlugs={topSlugs}
              lineup={
                hostPicks
                  ? { hostName: lock?.host?.name ?? null, attendees, viewerCanPick: viewerCanReact }
                  : undefined
              }
              reactionsDisabled={!viewerCanReact}
            />
          ) : (
            <GameCarousel3D
              games={availableGames}
              minPlayers={playerWindow.lo}
              maxPlayers={playerWindow.hi}
              date={date}
              reactions={reactions}
              newSlugs={newSlugs}
              renderThumbOverlay={
                hostPicks
                  ? (game, isCenter, compact) => (
                      <GameReactions
                        date={date}
                        slug={game.slug}
                        accentHex={game.accentHex}
                        aggregate={
                          reactions[game.slug] ?? { hype: 0, teach: 0, learn: 0, viewer: [] }
                        }
                        size={compact ? "sm" : "md"}
                        disabled={!isCenter || !viewerCanReact}
                        mode="pick"
                        hideCount
                      />
                    )
                  : undefined
              }
            />
          )}
        </div>
      )}

      {manageOpen && lock && (
        <PrivateNightManageSheet date={date} lock={lock} onClose={() => setManageOpen(false)} />
      )}
      {confirmDialog}
    </Modal>
  );
}

// A private night's answer: "I'm in" claims a seat (or a place in line),
// "Can't make it" gives it up. Once in, the yes side names the outcome —
// Seated, or Waitlist #n — so the switch doubles as the status.
function SeatSwitch({
  value,
  seat,
  position,
  busy,
  onChange,
}: {
  value: RsvpStatus | undefined;
  seat: ReturnType<typeof viewerSeat>;
  position: number | null;
  busy: boolean;
  onChange: (next: RsvpStatus) => void;
}) {
  const yesLabel =
    seat === "seated"
      ? "Seated"
      : seat === "waitlisted"
        ? `Waitlist${position ? ` #${position}` : ""}`
        : "I'm in";
  const options: SegmentedOption<RsvpStatus>[] = [
    {
      value: "yes",
      label: (
        <>
          <span aria-hidden="true">✓</span>
          <span className="sr-only xs2:not-sr-only xs2:ml-1">{yesLabel}</span>
        </>
      ),
      tone: seat === "waitlisted" ? "amber" : "emerald",
      title: yesLabel,
    },
    {
      value: "no",
      label: (
        <>
          <span aria-hidden="true">✗</span>
          <span className="sr-only xs2:not-sr-only xs2:ml-1">Can't make it</span>
        </>
      ),
      tone: "rose",
      title: "Can't make it",
    },
  ];
  return (
    <SegmentedControl
      shape="pill"
      size="sm"
      selectionMode="toggle"
      emphasizeActive
      aria-label="Your answer"
      value={value ?? null}
      onChange={onChange}
      disabled={busy}
      options={options}
      className="shrink-0"
    />
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
// Exported for the /dev/rsvp-preview page.
export const RSVP_OPTIONS: SegmentedOption<RsvpStatus>[] = [
  {
    value: "yes",
    label: (
      <>
        <span aria-hidden="true">✓</span>
        <span className="sr-only xs2:not-sr-only xs2:ml-1">Going</span>
      </>
    ),
    tone: "emerald",
    title: "Going",
  },
  {
    value: "no",
    label: (
      <>
        <span aria-hidden="true">✗</span>
        <span className="sr-only xs2:not-sr-only xs2:ml-1">Not going</span>
      </>
    ),
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

function buildViewOptions(opts: {
  canShowPick: boolean;
  canShowResults: boolean;
  canShowAttendees: boolean;
  resultsLabel: string;
  attendeesLabel: string;
}): SegmentedOption<View>[] {
  const out: SegmentedOption<View>[] = [];
  if (opts.canShowPick) out.push({ value: "pick", label: "Pick", tone: "accent" });
  if (opts.canShowResults) out.push({ value: "results", label: opts.resultsLabel, tone: "amber" });
  if (opts.canShowAttendees) {
    out.push({ value: "attendees", label: opts.attendeesLabel, tone: "sky" });
  }
  return out;
}

export function HostLine({ name }: { name: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-fg-secondary">
      <HostIcon className="h-3.5 w-3.5 shrink-0" />
      <span>
        <span className="text-fg-muted">Host </span>
        <span className="font-semibold text-fg-strong">{name}</span>
      </span>
    </span>
  );
}

export function TimeLine({ value }: { value: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-fg-secondary">
      <ClockIcon className="h-3.5 w-3.5 shrink-0" />
      <span className="font-semibold tabular-nums text-fg-strong">{value}</span>
    </span>
  );
}

export function AddressLink({ address }: { address: string }) {
  // Maps link keeps the FULL address (postal + country make geocoding exact);
  // the display drops them for phone-width headers. `min-w-0` on both the
  // link and the text span is load-bearing: without it, flex `min-width:auto`
  // propagates the address's full width up through the header and pushes the
  // whole modal panel wider than a phone viewport.
  const mapHref = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
  return (
    <a
      href={mapHref}
      target="_blank"
      rel="noreferrer noopener"
      className="inline-flex min-w-0 max-w-full items-center gap-1.5 text-emerald-300 underline-offset-2 hover:text-emerald-200 hover:underline"
    >
      <PinIcon className="h-3.5 w-3.5 shrink-0" />
      <span className="min-w-0 truncate">{compactAddress(address)}</span>
    </a>
  );
}
