import type { AdminArrival, AdminArrivalPoll, SkillPlayerRef } from "@boardgames/core/protocol";
import { useMemo, useState } from "react";
import { useAdminArrivals, useRetractArrival } from "../../hooks/useAdminArrivals";
import { useAdminUsers } from "../../hooks/useAdminUsers";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import { apiUrl } from "../../lib/api-base";
import { formatRelativeTime, formatShortDate, parseUtcStamp } from "../../lib/date-format";
import { errorMessageOf } from "../../lib/error-message";
import { resolveGame } from "../../lib/games-by-slug";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import { ErrorAlert } from "../ui/ErrorAlert";
import { MicroLabel } from "../ui/Label";
import { QueryBoundary } from "../ui/QueryBoundary";
import { Surface } from "../ui/Surface";
import { useConfirm } from "../ui/useConfirm";
import { AdminSection } from "./AdminSection";
import { ArrivalComposerModal } from "./ArrivalComposerModal";
import { TallyRows } from "./TallyRows";

// Admin card for arrivals: the latest closed purchase vote to announce from,
// the "Announce arrival" entry point to the composer, and the announcements
// already published (with a Retract). Sits under the purchase-vote card on
// the vote tab — a poll closing is silent for members, so this is where the
// news actually gets made.

function titleOf(slug: string | null): string {
  if (!slug) return "nobody voted";
  return resolveGame(slug)?.title ?? slug;
}

function shortDate(stamp: string): string {
  return formatShortDate(parseUtcStamp(stamp)?.toISOString() ?? stamp);
}

export function ArrivalsCard() {
  const arrivalsQuery = useAdminArrivals();
  const usersQuery = useAdminUsers();
  const { user } = useCurrentUser();
  const retractMutation = useRetractArrival();
  const { confirm, confirmDialog } = useConfirm();
  const [composerOpen, setComposerOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const members = useMemo(
    () =>
      (usersQuery.data ?? [])
        .filter((u) => !u.internal && !u.guest)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [usersQuery.data],
  );

  const state = arrivalsQuery.data;
  const latest = state?.polls[0];
  const summary = arrivalsQuery.isError
    ? "Couldn't load arrivals"
    : state === undefined
      ? "Loading…"
      : !latest
        ? "No closed vote yet — arrivals are announced from a finished purchase vote."
        : `${state.arrivals.length === 0 ? "Nothing announced yet" : `${state.arrivals.length} announced`} · latest vote closed ${formatRelativeTime(latest.closedAt)} — winner ${titleOf(latest.winnerSlug)}`;

  const retractError = errorMessageOf(retractMutation.error, "Couldn't retract that arrival");

  return (
    <>
      <AdminSection tone="accent" eyebrow="Arrivals" summary={summary}>
        {notice && <p className="text-xs text-emerald-300">{notice}</p>}
        {retractError && <ErrorAlert message={retractError} />}
        <QueryBoundary query={arrivalsQuery} loadingLabel="Loading arrivals…">
          {(data) => {
            const poll = data.polls[0];
            if (!poll) {
              return (
                <EmptyState
                  title="No closed vote yet"
                  description="Close a purchase vote above first — the announcement is built from its candidates and voters."
                />
              );
            }
            return (
              <>
                <LatestPoll
                  poll={poll}
                  players={data.players}
                  onAnnounce={() => {
                    setNotice(null);
                    setComposerOpen(true);
                  }}
                />
                {data.arrivals.length > 0 && (
                  <PublishedList
                    arrivals={data.arrivals}
                    players={data.players}
                    retracting={retractMutation.isPending}
                    retractingId={retractMutation.variables ?? null}
                    onRetract={async (arrival) => {
                      const ok = await confirm({
                        title: "Retract this arrival?",
                        description:
                          "It stops appearing for members who haven't seen it yet. The games stay in their owners' collections.",
                        confirmLabel: "Retract",
                        variant: "danger",
                      });
                      if (!ok) return;
                      setNotice(null);
                      retractMutation.mutate(arrival.id, {
                        onSuccess: () =>
                          setNotice("Arrival pulled. Members who already saw it are unaffected."),
                      });
                    }}
                  />
                )}
              </>
            );
          }}
        </QueryBoundary>
      </AdminSection>

      {composerOpen && state && (
        <ArrivalComposerModal
          polls={state.polls}
          players={state.players}
          members={members}
          viewerId={user?.id ?? null}
          onClose={() => setComposerOpen(false)}
          onPublished={() => {
            setComposerOpen(false);
            setNotice("Announced — every member sees it on their next visit.");
          }}
        />
      )}
      {confirmDialog}
    </>
  );
}

function LatestPoll({
  poll,
  players,
  onAnnounce,
}: {
  poll: AdminArrivalPoll;
  players: Record<string, SkillPlayerRef>;
  onAnnounce: () => void;
}) {
  const voterById = useMemo(
    () => new Map(Object.entries(players).map(([id, p]) => [id, { name: p.name, image: p.image }])),
    [players],
  );
  return (
    <Surface variant="tile" padding="none" className="space-y-2 p-3">
      <MicroLabel className="font-semibold">Latest closed vote</MicroLabel>
      <p className="text-2xs text-fg-muted">
        Closed {shortDate(poll.closedAt)} · {poll.voterCount} voter
        {poll.voterCount === 1 ? "" : "s"}
      </p>
      <TallyRows tally={poll.tally} winnerSlug={poll.winnerSlug} voterById={voterById} />
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <span className="text-2xs text-fg-muted">
          Pick 1–3 games from this vote, who bought them, and a photo of each. Every member gets it
          once.{poll.winnerSlug === null && " Nobody voted, so no game is preselected."}
        </span>
        <Button size="sm" onClick={onAnnounce}>
          Announce arrival
        </Button>
      </div>
    </Surface>
  );
}

function PublishedList({
  arrivals,
  players,
  retracting,
  retractingId,
  onRetract,
}: {
  arrivals: AdminArrival[];
  players: Record<string, SkillPlayerRef>;
  /** Only the row whose retract is in flight spins. */
  retracting: boolean;
  retractingId: string | null;
  onRetract: (arrival: AdminArrival) => void;
}) {
  return (
    <div className="space-y-2">
      <MicroLabel>Announced</MicroLabel>
      <ul className="space-y-2">
        {arrivals.map((arrival) => {
          const titles = arrival.games.map((g) => titleOf(g.slug)).join(" · ");
          const owners = [
            ...new Set(arrival.games.map((g) => players[g.purchaserUserId]?.name ?? "a member")),
          ].join(", ");
          const publisher = arrival.publishedBy
            ? (players[arrival.publishedBy]?.name ?? "an admin")
            : "an admin";
          return (
            <Surface
              as="li"
              key={arrival.id}
              variant="tile"
              padding="none"
              className="flex flex-wrap items-center gap-3 px-3 py-2"
            >
              <span className="flex shrink-0 gap-1.5">
                {arrival.games.map((g) => (
                  <img
                    key={g.slug}
                    src={apiUrl(g.photoUrl)}
                    alt=""
                    className="aspect-photo h-12 rounded-card-md object-cover ring-1 ring-line"
                  />
                ))}
              </span>
              <span className="min-w-0 flex-1 text-sm">
                <span className="block truncate font-semibold text-fg-primary">{titles}</span>
                <span className="block text-2xs text-fg-secondary">Bought by {owners}</span>
                <span className="block text-3xs text-fg-muted">
                  Published {formatRelativeTime(arrival.publishedAt)} by {publisher} · seen by{" "}
                  {arrival.seenBy}
                </span>
              </span>
              <Button
                variant="danger"
                size="xs"
                loading={retracting && retractingId === arrival.id}
                onClick={() => onRetract(arrival)}
              >
                Retract
              </Button>
            </Surface>
          );
        })}
      </ul>
    </div>
  );
}
