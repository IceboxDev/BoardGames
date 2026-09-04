import { EXIT_GAMES, type ExitGame, exitGameTitle } from "@boardgames/core/games/exit-games";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useCurrentUser } from "../../hooks/useCurrentUser.ts";
import type { Attendee } from "../../lib/calendar-games";
import { cn } from "../../lib/cn";
import { type ExitNightState, fetchExitNightState, setExitVote } from "../../lib/exit-night.ts";
import { qk } from "../../lib/query-keys";
import { EXIT_DIFFICULTY_LABEL, EXIT_DIFFICULTY_TONE } from "../ExitBoxList";
import { Button, Chip, ErrorAlert, LoadingState } from "../ui";
import { Eyebrow } from "../ui/Label";
import { Surface } from "../ui/Surface";
import { TONE_BUBBLE } from "../ui/tones";

// The RSVP modal's body for a sealed EXIT night. The first-stage vote decided
// *that* we're escaping; this panel narrows down *which box*. Boxes owned by
// tonight's guests lead (you can only play what someone can bring), ranked by
// second-stage votes; the full release list sits behind a toggle for the
// "I'll just buy it" crowd. Voting is a per-user toggle per box, mirroring the
// hype mechanic — most votes wins the table.

type Props = {
  date: string;
  attendees: Attendee[];
  /** Confirmed (definite) headcount. */
  partyCount: number;
  /** Preview-only: skip the query and render this state (dev/exit-preview). */
  previewState?: ExitNightState;
};

type BoxRow = {
  game: ExitGame;
  ownerIds: string[];
  voterIds: string[];
};

export default function ExitNightPanel({ date, attendees, partyCount, previewState }: Props) {
  const { user } = useCurrentUser();
  const viewerId = user?.id ?? null;
  const queryClient = useQueryClient();
  const [showAll, setShowAll] = useState(false);

  const stateQuery = useQuery({
    queryKey: qk.exitNight(date),
    queryFn: ({ signal }) => fetchExitNightState(date, signal),
    enabled: !previewState,
  });
  const state = previewState ?? stateQuery.data;

  const voteMutation = useMutation({
    mutationFn: ({ slug, on }: { slug: string; on: boolean }) => setExitVote(date, slug, on),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: qk.exitNight(date) });
    },
  });

  const nameOf = useMemo(() => {
    const map = new Map(attendees.map((a) => [a.userId, a.name]));
    return (id: string) => map.get(id) ?? "someone";
  }, [attendees]);

  const { ownedRows, otherRows } = useMemo(() => {
    const owners = state?.owners ?? {};
    const votes = state?.votes ?? {};
    const rows: BoxRow[] = EXIT_GAMES.map((game) => ({
      game,
      ownerIds: owners[game.slug] ?? [],
      voterIds: votes[game.slug] ?? [],
    }));
    // Votes first, then owned, then newest release. Stable enough that rows
    // don't jump around mid-vote: ties keep release order.
    const rank = (a: BoxRow, b: BoxRow) =>
      b.voterIds.length - a.voterIds.length ||
      b.ownerIds.length - a.ownerIds.length ||
      b.game.year - a.game.year;
    return {
      ownedRows: rows.filter((r) => r.ownerIds.length > 0).sort(rank),
      otherRows: rows.filter((r) => r.ownerIds.length === 0).sort(rank),
    };
  }, [state]);

  if (!state) {
    return stateQuery.isError ? (
      <ErrorAlert message="Couldn't load tonight's EXIT boxes." className="text-center" />
    ) : (
      <LoadingState label="Opening the escape rooms…" />
    );
  }

  return (
    <div className="scrollbar-thin flex h-full w-full max-w-3xl flex-col gap-4 overflow-y-auto px-1 py-2">
      {/* Hero */}
      <div className="relative shrink-0 overflow-hidden rounded-3xl border border-cyan-400/30 bg-gradient-to-br from-cyan-950 via-surface-950 to-black p-6 text-center">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_55%_60%_at_50%_28%,color-mix(in_srgb,var(--color-neon-cyan,#22d3ee)_28%,transparent),transparent_72%)]"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 bg-gradient-to-r from-transparent via-cyan-200/20 to-transparent motion-safe:animate-seal-shimmer"
        />
        <div className="relative flex flex-col items-center gap-2">
          <Eyebrow inheritColor className="text-cyan-300/80">
            Tonight's escape
          </Eyebrow>
          <h2 className="text-2xl font-bold tracking-tight text-cyan-50">EXIT: The Game</h2>
          <p className="text-sm text-cyan-200/75">
            <span className="font-bold text-cyan-100">{partyCount}</span>{" "}
            {partyCount === 1 ? "escapee is" : "escapees are"} locked in — now vote for the room to
            break out of.
          </p>
        </div>
      </div>

      {/* Boxes the group can actually put on the table. */}
      <div className="shrink-0">
        <Eyebrow inheritColor className="px-2 text-cyan-300/80">
          On the shelf tonight
        </Eyebrow>
        {/* Defensive fallback only: "exit" can't be owned directly (ownership
            is derived from owning boxes), so a night EXIT won always has at
            least one attendee-owned box. This renders only if data drifts. */}
        {ownedRows.length === 0 ? (
          <p className="mt-2 px-2 text-2xs text-fg-muted">
            Couldn't find tonight's owned EXIT boxes — browse the full list below and vote there.
          </p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2">
            {ownedRows.map((row) => (
              <BoxVoteRow
                key={row.game.slug}
                row={row}
                viewerId={viewerId}
                nameOf={nameOf}
                busy={voteMutation.isPending}
                onVote={(on) => voteMutation.mutate({ slug: row.game.slug, on })}
              />
            ))}
          </ul>
        )}
      </div>

      {/* Everything else in the franchise. */}
      <div className="shrink-0 pb-2">
        <div className="flex items-baseline justify-between px-2">
          <Eyebrow tone="neutral">All EXIT boxes</Eyebrow>
          <Button variant="link" size="sm" onClick={() => setShowAll((v) => !v)}>
            {showAll ? "Hide" : `Show ${otherRows.length}`}
          </Button>
        </div>
        {showAll && (
          <ul className="mt-2 flex flex-col gap-2">
            {otherRows.map((row) => (
              <BoxVoteRow
                key={row.game.slug}
                row={row}
                viewerId={viewerId}
                nameOf={nameOf}
                busy={voteMutation.isPending}
                onVote={(on) => voteMutation.mutate({ slug: row.game.slug, on })}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function BoxVoteRow({
  row,
  viewerId,
  nameOf,
  busy,
  onVote,
}: {
  row: BoxRow;
  viewerId: string | null;
  nameOf: (id: string) => string;
  busy: boolean;
  onVote: (on: boolean) => void;
}) {
  const { game, ownerIds, voterIds } = row;
  const voted = viewerId !== null && voterIds.includes(viewerId);
  const voteCount = voterIds.length;

  return (
    <Surface
      as="li"
      variant="raised"
      padding="none"
      className={cn(
        "flex items-center gap-3 px-3 py-2.5",
        voteCount > 0 && "ring-1 ring-cyan-400/25",
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-baseline gap-2">
          <h3 className="truncate text-sm font-semibold text-white">{exitGameTitle(game)}</h3>
          <span className="shrink-0 text-3xs text-fg-muted">{game.year}</span>
          {game.difficulty && (
            <span
              className={cn(
                "shrink-0 rounded-full px-1.5 py-0.5 text-3xs font-semibold",
                TONE_BUBBLE[EXIT_DIFFICULTY_TONE[game.difficulty]],
              )}
            >
              {EXIT_DIFFICULTY_LABEL[game.difficulty]}
            </span>
          )}
        </div>
        <p className="mt-0.5 truncate text-3xs text-fg-muted">
          {ownerIds.length > 0
            ? `Owned by ${ownerIds.map(nameOf).join(", ")}`
            : "Nobody's shelf — yet"}
        </p>
      </div>
      {voteCount > 0 && (
        <span
          className={cn("shrink-0 rounded-full px-2 py-0.5 text-2xs font-bold", TONE_BUBBLE.cyan)}
          title={voterIds.map(nameOf).join(", ")}
        >
          {voteCount} {voteCount === 1 ? "vote" : "votes"}
        </span>
      )}
      <Chip
        pressed={voted}
        tone="emerald"
        size="xs"
        shape="pill"
        disabled={busy || viewerId === null}
        onClick={() => onVote(!voted)}
      >
        {voted ? "Voted" : "Vote"}
      </Chip>
    </Surface>
  );
}
