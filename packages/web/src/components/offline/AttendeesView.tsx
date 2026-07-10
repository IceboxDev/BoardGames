import { useMemo } from "react";
import { games as gameRegistry } from "../../games/registry";
import type { GameDefinition } from "../../games/types";
import { useCurrentUser } from "../../hooks/useCurrentUser.ts";
import type { Attendee } from "../../lib/calendar-games";
import { XIcon } from "../icons";
import {
  Avatar,
  Badge,
  EmptyState,
  Eyebrow,
  IconButton,
  Spinner,
  Surface,
  useConfirm,
} from "../ui";

type Props = {
  attendees: Attendee[];
  topSlugs: string[];
  /**
   * Union of every confirmed attendee's inventory (server's `wire.ownedSlugs`).
   * The coverage footer uses this to tell apart "nobody owns X" from "someone
   * owns X but the 3-game bring cap pushed it out".
   */
  ownedSlugs?: string[];
  /** Viewer is admin or the night's host — gates the row-level X (kick) button. */
  canKick?: boolean;
  /** Called with the target userId when the host/admin clicks X. */
  onKick?: (userId: string) => void;
  /** While a kick mutation is in flight, the targeted row shows a spinner instead of the X. */
  kickingUserId?: string | null;
};

export default function AttendeesView({
  attendees,
  topSlugs,
  ownedSlugs = [],
  canKick = false,
  onKick,
  kickingUserId = null,
}: Props) {
  const { user } = useCurrentUser();
  const viewerId = user?.id ?? null;

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

  return (
    <div className="scrollbar-thin flex h-full w-full max-w-3xl flex-col gap-2 overflow-y-auto px-1 py-2">
      <Eyebrow tone="sky" className="px-2">
        Who's coming
      </Eyebrow>
      <ul className="flex flex-col gap-2">
        {attendees.map((a) => (
          <li key={a.userId}>
            <AttendeeRow
              attendee={a}
              slugToGame={slugToGame}
              isViewer={a.userId === viewerId}
              canKick={canKick && a.userId !== viewerId}
              onKick={onKick}
              isKicking={kickingUserId === a.userId}
            />
          </li>
        ))}
      </ul>
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
}: {
  attendee: Attendee;
  slugToGame: Map<string, GameDefinition>;
  isViewer: boolean;
  canKick: boolean;
  onKick?: (userId: string) => void;
  isKicking: boolean;
}) {
  const { confirm, confirmDialog } = useConfirm();

  const handleKick = async () => {
    if (!onKick || isKicking) return;
    const ok = await confirm({
      title: `Remove ${attendee.name} from this game night?`,
      description: 'Their RSVP will be set to "Not going". They can RSVP again themselves.',
      confirmLabel: "Remove",
    });
    if (ok) onKick(attendee.userId);
  };

  return (
    <Surface variant="raised" padding="none" className="flex items-start gap-3 px-3 py-3 sm:px-4">
      <Avatar name={attendee.name} size="sm" />

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-semibold text-white">{attendee.name}</span>
          {attendee.isHost && (
            <Badge tone="amber" shape="pill" size="xs">
              Host
            </Badge>
          )}
          {attendee.status === "tentative" && (
            <Badge tone="neutral" shape="pill" size="xs">
              Maybe
            </Badge>
          )}
          {!attendee.hasRsvped && !isViewer && (
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

        <div className="flex flex-wrap items-center gap-1.5 text-2xs text-fg-secondary">
          <VoteChip kind="hype" count={attendee.votes.hype} />
          <VoteChip kind="teach" count={attendee.votes.teach} />
          <VoteChip kind="learn" count={attendee.votes.learn} />
        </div>

        <BringingList attendee={attendee} slugToGame={slugToGame} />
      </div>

      {canKick && (
        <IconButton
          variant="danger"
          shape="circle"
          size="xs"
          aria-label={`Remove ${attendee.name} from this game night`}
          title={`Remove ${attendee.name} — sets their RSVP to "Not going"`}
          disabled={isKicking}
          onClick={handleKick}
          className="h-7 w-7 bg-white/[0.04]"
          icon={isKicking ? <Spinner size="xs" /> : <XIcon className="h-3.5 w-3.5" />}
        />
      )}

      {confirmDialog}
    </Surface>
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
        <Badge tone="amber" shape="pill" size="xs" className="py-1">
          From their collection
        </Badge>
      )}
      {attendee.bringing.map((slug) => {
        const g = slugToGame.get(slug);
        if (!g) return null;
        return (
          <span
            key={slug}
            className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-surface-800 px-2 py-1 text-2xs text-fg-primary ring-1 ring-[var(--accent)]/40"
            style={{ "--accent": g.accentHex } as React.CSSProperties}
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

function VoteChip({ kind, count }: { kind: "hype" | "teach" | "learn"; count: number }) {
  const dim = count === 0;
  const meta = {
    hype: { label: "Hype", icon: "♥" },
    teach: { label: "Teach", icon: "🎓" },
    learn: { label: "Learn", icon: "📖" },
  }[kind];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 ${
        dim ? "bg-white/[0.03] text-fg-disabled" : "bg-white/[0.06] text-fg-primary"
      }`}
      title={`${meta.label}: ${count}`}
    >
      <span aria-hidden="true">{meta.icon}</span>
      <span className="font-semibold tabular-nums">{count}</span>
      <span className="sr-only">{meta.label}</span>
    </span>
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
  const titles = (slugs: string[]) =>
    slugs.map((slug) => slugToGame.get(slug)?.title ?? slug).join(", ");
  return (
    <div
      className={`mt-1 rounded-2xl border px-3 py-2.5 text-2xs sm:px-4 ${
        allCovered
          ? "border-emerald-400/30 bg-emerald-400/[0.06] text-emerald-100"
          : "border-amber-400/30 bg-amber-400/[0.06] text-amber-100"
      }`}
    >
      <p className="font-semibold">
        Top-5 coverage: {covered}/{total}
      </p>
      {unowned.length > 0 && (
        <p className="mt-1 text-2xs text-amber-200/80">Nobody attending owns: {titles(unowned)}</p>
      )}
      {capLimited.length > 0 && (
        <p className="mt-1 text-2xs text-amber-200/80">
          Owned but won't be brought (per-person 3-game cap): {titles(capLimited)}
        </p>
      )}
    </div>
  );
}
