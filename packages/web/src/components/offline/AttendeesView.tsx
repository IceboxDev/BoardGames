import { useEffect, useId, useMemo, useRef, useState } from "react";
import { games as gameRegistry } from "../../games/registry";
import type { GameDefinition } from "../../games/types";
import { useCurrentUser } from "../../hooks/useCurrentUser.ts";
import type { Attendee } from "../../lib/calendar-games";
import { cn } from "../../lib/cn";
import { isTeamCandidate, loadTeams } from "../../lib/teams";
import { AlertIcon, CheckIcon, ClockIcon, MoreIcon, ShuffleIcon, UndoIcon, XIcon } from "../icons";
import {
  Avatar,
  Badge,
  Button,
  EmptyState,
  Eyebrow,
  IconButton,
  Spinner,
  Surface,
  useConfirm,
} from "../ui";
import { REACTION_KINDS } from "./ReactionButtons";
import { TeamsPanel } from "./TeamsPanel";

type Props = {
  /** Night key — the team generator keeps its split per night. */
  date: string;
  attendees: Attendee[];
  topSlugs: string[];
  /**
   * Union of every confirmed attendee's inventory (server's `wire.ownedSlugs`).
   * The coverage footer uses this to tell apart "nobody owns X" from "someone
   * owns X but the 3-game bring cap pushed it out".
   */
  ownedSlugs?: string[];
  /** Viewer is admin or the night's host — gates the row menu's "Remove from night". */
  canKick?: boolean;
  /** Called with the target userId when the host/admin clicks X. */
  onKick?: (userId: string) => void;
  /** While a kick mutation is in flight, the targeted row's menu shows a spinner. */
  kickingUserId?: string | null;
  /**
   * Admins: clear one person's votes for the night (from the row's menu).
   * Absent for everyone else — and the server only reports outdated votes
   * (`staleVotes`) to admins.
   */
  onResetVotes?: (userId: string) => void;
  /** The row whose votes are being cleared shows a spinner. */
  resettingUserId?: string | null;
  /**
   * The headcount the night has to fit now (the player window's low end) —
   * shown in the header and against outdated votes.
   */
  headcount?: number;
  /**
   * Private night: the roster is grouped by seat — seated, waiting, invited
   * without an answer, declined — instead of the confirmed/maybe flat list,
   * and vote chips only mean something when the group is voting.
   */
  seats?: { total: number; taken: number; waitlisted: number } | null;
  showVotes?: boolean;
};

const SEAT_GROUPS: readonly {
  seats: readonly Attendee["seat"][];
  title: (s: NonNullable<Props["seats"]>) => string;
  tone: "emerald" | "amber" | "sky" | "neutral";
}[] = [
  { seats: ["host", "seated"], title: (s) => `Seated ${s.taken}/${s.total}`, tone: "emerald" },
  { seats: ["waitlisted"], title: () => "Waitlist", tone: "amber" },
  { seats: ["invited"], title: () => "Invited — no reply yet", tone: "sky" },
  { seats: ["declined"], title: () => "Can't make it", tone: "neutral" },
];

export default function AttendeesView({
  date,
  attendees,
  topSlugs,
  ownedSlugs = [],
  canKick = false,
  onKick,
  kickingUserId = null,
  onResetVotes,
  resettingUserId = null,
  headcount,
  seats = null,
  showVotes = true,
}: Props) {
  const { user } = useCurrentUser();
  const viewerId = user?.id ?? null;
  const [mode, setMode] = useState<"list" | "teams">("list");
  // Re-read on the way back from the teams panel so the button shows the new split.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `mode` is the refresh trigger
  const savedTeamCount = useMemo(() => loadTeams(date).teams?.length ?? 0, [date, mode]);
  const teamCandidates = attendees.filter(isTeamCandidate).length;

  const slugToGame = useMemo(() => {
    const m = new Map<string, GameDefinition>();
    for (const g of gameRegistry) m.set(g.slug, g);
    return m;
  }, []);

  const bringerCount = useMemo(() => {
    const counts = new Map<string, number>();
    for (const a of attendees) {
      for (const slug of a.bringing) counts.set(slug, (counts.get(slug) ?? 0) + 1);
    }
    return counts;
  }, [attendees]);

  // Split top-5 slugs that nobody is bringing into two buckets:
  //   - unowned:    no attendee has it in inventory at all
  //   - capLimited: someone owns it but the 3-game bring cap shoved it out
  //                 (or the night is external and the host ran out of slots)
  const { unowned, capLimited } = useMemo(() => {
    const ownedSet = new Set(ownedSlugs);
    const unownedOut: string[] = [];
    const capLimitedOut: string[] = [];
    for (const slug of topSlugs) {
      if ((bringerCount.get(slug) ?? 0) > 0) continue;
      if (ownedSet.has(slug)) capLimitedOut.push(slug);
      else unownedOut.push(slug);
    }
    return { unowned: unownedOut, capLimited: capLimitedOut };
  }, [topSlugs, bringerCount, ownedSlugs]);

  if (attendees.length === 0) {
    return (
      <EmptyState
        title="Nobody's confirmed yet"
        description="When people RSVP, they'll show up here with their picks and what they're bringing."
      />
    );
  }

  if (mode === "teams") {
    return (
      <div className="scrollbar-thin flex h-full w-full max-w-3xl flex-col overflow-y-auto px-1 py-2">
        <TeamsPanel
          date={date}
          attendees={attendees}
          lineup={topSlugs}
          onBack={() => setMode("list")}
        />
      </div>
    );
  }

  const row = (a: Attendee) => (
    <li key={a.userId}>
      <AttendeeRow
        attendee={a}
        slugToGame={slugToGame}
        isViewer={a.userId === viewerId}
        // The host holds seat 1: on a private night they are never kicked.
        canKick={canKick && a.userId !== viewerId && !(seats && a.isHost)}
        onKick={onKick}
        isKicking={kickingUserId === a.userId}
        onResetVotes={onResetVotes}
        isResetting={resettingUserId === a.userId}
        showVotes={showVotes}
        headcount={headcount ?? attendees.filter((x) => x.status === "definite").length}
      />
    </li>
  );

  return (
    <div className="scrollbar-thin flex h-full w-full max-w-3xl flex-col gap-2 overflow-y-auto px-1 py-2">
      {/* Fixed-height header: the Teams button is a quiet ghost control, so
          the list starts at the same place with or without it. */}
      <div className="flex h-8 shrink-0 items-center justify-between gap-2 pl-2">
        <Eyebrow tone="sky" className="flex items-baseline gap-2">
          Who's coming
          {!seats && headcount !== undefined && (
            <span className="tabular-nums tracking-normal text-fg-muted">{headcount}</span>
          )}
        </Eyebrow>
        {teamCandidates >= 2 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setMode("teams")}
            title="Split tonight's players into teams"
            className="gap-1.5"
          >
            <ShuffleIcon className="h-3.5 w-3.5" />
            Teams
            {savedTeamCount > 0 && (
              <span className="tabular-nums text-fg-muted">{savedTeamCount}</span>
            )}
          </Button>
        )}
      </div>
      {seats ? (
        SEAT_GROUPS.map((group) => {
          const members = attendees.filter((a) => group.seats.includes(a.seat));
          if (members.length === 0) return null;
          return (
            <div key={group.title(seats)} className="flex flex-col gap-2">
              <Eyebrow tone={group.tone} className="px-2">
                {group.title(seats)}
              </Eyebrow>
              <ul className="flex flex-col gap-2">{members.map(row)}</ul>
            </div>
          );
        })
      ) : (
        <ul className="flex flex-col gap-2">{attendees.map(row)}</ul>
      )}
      {topSlugs.length > 0 && (
        <CoverageFooter
          covered={topSlugs.length - unowned.length - capLimited.length}
          total={topSlugs.length}
          unowned={unowned}
          capLimited={capLimited}
          slugToGame={slugToGame}
        />
      )}
    </div>
  );
}

function AttendeeRow({
  attendee,
  slugToGame,
  isViewer,
  canKick,
  onKick,
  isKicking,
  onResetVotes,
  isResetting,
  showVotes,
  headcount,
}: {
  attendee: Attendee;
  slugToGame: Map<string, GameDefinition>;
  isViewer: boolean;
  canKick: boolean;
  onKick?: (userId: string) => void;
  isKicking: boolean;
  onResetVotes?: (userId: string) => void;
  isResetting: boolean;
  showVotes: boolean;
  headcount: number;
}) {
  const { confirm, confirmDialog } = useConfirm();
  // On a private night the seat state replaces the open night's maybe /
  // hasn't-RSVP'd pills — it already says exactly where the person stands.
  const onSeatList = attendee.seat !== null;
  const firstName = attendee.name.split(" ")[0] ?? attendee.name;
  const totalVotes = attendee.votes.hype + attendee.votes.teach + attendee.votes.learn;
  const canReset = !!onResetVotes && showVotes;
  const busy = isKicking || isResetting;

  const handleKick = async () => {
    if (!onKick || busy) return;
    const ok = await confirm({
      title: `Remove ${attendee.name} from this game night?`,
      description: 'Their RSVP will be set to "Not going". They can RSVP again themselves.',
      confirmLabel: "Remove",
    });
    if (ok) onKick(attendee.userId);
  };

  const handleReset = async () => {
    if (!onResetVotes || busy || totalVotes === 0) return;
    const ok = await confirm({
      title: `Clear ${firstName}'s ${totalVotes} ${totalVotes === 1 ? "vote" : "votes"}?`,
      description:
        "Their hype, teach and learn picks for this night are removed, so they can vote again for the table as it is now. Their RSVP stays. This can't be undone.",
      confirmLabel: "Reset votes",
      variant: "danger",
    });
    if (ok) onResetVotes(attendee.userId);
  };

  return (
    <Surface
      variant="raised"
      padding="none"
      className="relative flex items-start gap-3 py-3 pl-3 pr-2 sm:pl-4"
    >
      <Avatar
        name={attendee.name}
        image={attendee.image}
        accentHex={attendee.accentHex}
        size="sm"
      />

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-semibold text-fg-strong">{attendee.name}</span>
          {attendee.isHost && (
            <Badge tone="amber" shape="pill" size="xs">
              Host
            </Badge>
          )}
          {attendee.isGuest && (
            <Badge
              tone="neutral"
              shape="pill"
              size="xs"
              title="Guest player without an account — added by an admin"
            >
              Guest
            </Badge>
          )}
          {attendee.seat === "waitlisted" && (
            <Badge tone="amber" shape="pill" size="xs">
              Waiting
            </Badge>
          )}
          {attendee.seat === "invited" && (
            <Badge tone="sky" shape="pill" size="xs" ring>
              No reply yet
            </Badge>
          )}
          {attendee.seat === "declined" && (
            <Badge tone="neutral" shape="pill" size="xs">
              Can't make it
            </Badge>
          )}
          {!onSeatList && attendee.status === "tentative" && (
            <Badge tone="neutral" shape="pill" size="xs">
              Maybe
            </Badge>
          )}
          {!onSeatList && !attendee.hasRsvped && !isViewer && (
            // Don't pin the badge on the viewer themselves: they're literally
            // looking at the modal right now, so they obviously opened the
            // card. Server data may take a moment to refresh after the
            // modal-open mutation, so we hide it client-side too.
            <Badge
              tone="sky"
              shape="pill"
              size="xs"
              ring
              title="Marked availability but never opened the RSVP modal — ping them in real life."
            >
              Hasn't RSVP'd yet
            </Badge>
          )}
        </div>

        {showVotes && (
          // One fixed-height line: the outdated pill fits inside it, so a
          // row with the pill is exactly as tall as a row without.
          <div className="flex h-5 items-center gap-2.5 whitespace-nowrap text-2xs text-fg-secondary">
            {REACTION_KINDS.map(({ kind, label, Icon }) => (
              <VoteCount
                key={kind}
                label={label}
                count={attendee.votes[kind]}
                Icon={Icon}
                filled={kind === "hype" && attendee.votes[kind] > 0}
              />
            ))}
            {attendee.staleVotes && (
              <StalePill stale={attendee.staleVotes} total={totalVotes} headcount={headcount} />
            )}
          </div>
        )}

        {(attendee.seat === null || attendee.seat === "host" || attendee.seat === "seated") && (
          <BringingList attendee={attendee} slugToGame={slugToGame} />
        )}
      </div>

      {(canKick || canReset) && (
        <RowMenu
          label={`Manage ${attendee.name}`}
          busy={busy}
          items={[
            ...(canReset
              ? [
                  {
                    key: "reset",
                    label: "Reset votes",
                    hint: String(totalVotes),
                    icon: <UndoIcon className="h-3.5 w-3.5" />,
                    disabled: totalVotes === 0,
                    onSelect: handleReset,
                  },
                ]
              : []),
            ...(canKick
              ? [
                  {
                    key: "kick",
                    label: "Remove from night",
                    icon: <XIcon className="h-3.5 w-3.5" />,
                    danger: true,
                    onSelect: handleKick,
                  },
                ]
              : []),
          ]}
        />
      )}

      {confirmDialog}
    </Surface>
  );
}

type RowMenuItem = {
  key: string;
  label: string;
  /** Muted text at the end of the item (a count). */
  hint?: string;
  icon: React.ReactNode;
  danger?: boolean;
  disabled?: boolean;
  onSelect: () => void;
};

/**
 * The row's admin actions behind one quiet "…" button. Closes on Escape, on
 * a click outside, and once an item is chosen (its confirm dialog takes over).
 */
function RowMenu({ label, busy, items }: { label: string; busy: boolean; items: RowMenuItem[] }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    rootRef.current?.querySelector<HTMLButtonElement>("[role=menuitem]:not(:disabled)")?.focus();
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="shrink-0">
      <IconButton
        ref={triggerRef}
        size="md"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        pressed={open}
        disabled={busy}
        onClick={() => setOpen((o) => !o)}
        icon={busy ? <Spinner size="xs" /> : <MoreIcon className="h-[18px] w-[18px]" />}
      />
      {open && (
        <Surface
          id={menuId}
          role="menu"
          aria-label={label}
          variant="panel"
          padding="none"
          className="absolute right-2 top-12 z-raised flex w-60 flex-col gap-0.5 bg-surface-800 p-1.5 shadow-xl"
        >
          {items.map((item) => (
            <Button
              key={item.key}
              role="menuitem"
              variant="ghost"
              size="sm"
              disabled={item.disabled}
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
              className={cn(
                "h-9 w-full justify-start gap-2.5 px-2.5",
                item.danger ? "text-rose-300 hover:text-rose-200" : "text-fg-primary",
              )}
            >
              {item.icon}
              <span>{item.label}</span>
              {item.hint !== undefined && (
                <span className="ml-auto tabular-nums text-fg-muted">{item.hint}</span>
              )}
            </Button>
          ))}
        </Surface>
      )}
    </div>
  );
}

/** "Voted at 5 · now 7" — admins only: some of these votes predate who's coming now. */
function StalePill({
  stale,
  total,
  headcount,
}: {
  stale: NonNullable<Attendee["staleVotes"]>;
  total: number;
  headcount: number;
}) {
  const at = stale.headcounts.join("/");
  const which = stale.count === total ? "All their votes" : `${stale.count} of ${total} votes`;
  return (
    <span
      className="inline-flex h-5 items-center gap-1 rounded-full border border-amber-400/45 px-2 text-3xs font-semibold leading-none text-amber-200"
      title={`${which} were cast when ${stale.headcounts.join(" or ")} were coming; ${headcount} are coming now.`}
    >
      <ClockIcon className="h-3 w-3" />
      <span>
        Voted at {at}
        <span className="hidden sm:inline"> · now {headcount}</span>
      </span>
    </span>
  );
}

function VoteCount({
  label,
  count,
  Icon,
  filled,
}: {
  label: string;
  count: number;
  Icon: (p: { filled: boolean }) => React.ReactElement;
  filled: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 font-semibold tabular-nums",
        count === 0 ? "text-fg-disabled" : "text-fg-primary",
      )}
      title={`${label}: ${count}`}
    >
      <span className="h-3.5 w-3.5">
        <Icon filled={filled} />
      </span>
      {count}
      <span className="sr-only">{label}</span>
    </span>
  );
}

function BringingList({
  attendee,
  slugToGame,
}: {
  attendee: Attendee;
  slugToGame: Map<string, GameDefinition>;
}) {
  if (attendee.status === "tentative") {
    return (
      <span className="text-2xs text-fg-muted">No bringing assignment until they confirm.</span>
    );
  }
  if (attendee.bringing.length === 0) {
    return (
      <span className="text-2xs text-fg-muted">
        {attendee.isHost
          ? "Doesn't own any of tonight's top picks."
          : "Not bringing top-5 games this time."}
      </span>
    );
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {attendee.isHost && (
        <Badge tone="amber" shape="pill" size="xs" className="h-6">
          From their collection
        </Badge>
      )}
      {attendee.bringing.map((slug) => {
        const g = slugToGame.get(slug);
        if (!g) return null;
        return (
          <span
            key={slug}
            className="inline-flex h-6 max-w-full items-center gap-1.5 rounded-full bg-surface-800 pl-1 pr-2.5 text-2xs text-fg-primary"
          >
            <img
              src={g.thumbnail}
              alt=""
              loading="lazy"
              decoding="async"
              className="h-4 w-4 shrink-0 rounded-sm object-cover"
            />
            <span className="truncate">{g.title}</span>
          </span>
        );
      })}
    </div>
  );
}

function CoverageFooter({
  covered,
  total,
  unowned,
  capLimited,
  slugToGame,
}: {
  covered: number;
  total: number;
  /** Top-5 slugs that no confirmed attendee owns. Genuine coverage gap. */
  unowned: string[];
  /** Top-5 slugs an attendee owns, but the 3-game bring cap kept them off the list. */
  capLimited: string[];
  slugToGame: Map<string, GameDefinition>;
}) {
  if (total === 0) return null;
  const allCovered = unowned.length === 0 && capLimited.length === 0;
  const titles = (slugs: string[]) => {
    const names = slugs.map((slug) => slugToGame.get(slug)?.title ?? slug);
    return names.length > 1
      ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`
      : (names[0] ?? "");
  };
  const are = (slugs: string[]) => (slugs.length === 1 ? "is" : "are");
  return (
    <div className="mt-1 flex items-start gap-2.5 border-t border-line px-2 pt-3 text-2xs leading-relaxed text-fg-secondary">
      {allCovered ? (
        <CheckIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-300" />
      ) : (
        <AlertIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" />
      )}
      <p>
        {allCovered ? (
          <>
            <span className="font-semibold text-emerald-200">
              {total === 1 ? "The top pick is" : `All ${total} top picks are`}
            </span>{" "}
            coming.
          </>
        ) : (
          <>
            <span className="font-semibold text-amber-200">
              {covered} of {total}
            </span>{" "}
            top picks are coming.
            {unowned.length > 0 && <> Nobody coming owns {titles(unowned)}.</>}
            {capLimited.length > 0 && (
              <>
                {" "}
                {titles(capLimited)} {are(capLimited)} owned but over the 3-game bring cap.
              </>
            )}
          </>
        )}
      </p>
    </div>
  );
}
