// Admin tab for the purchase vote: build and open a poll (candidate list +
// required voter count), watch the live tally (admins see who voted for what
// while players don't), force-close, or delete an open poll.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { games } from "../../games/registry";
import { cn } from "../../lib/cn";
import { resolveGame } from "../../lib/games-by-slug";
import {
  closePurchasePoll,
  createPurchasePoll,
  deletePurchasePoll,
  fetchAdminPurchaseVote,
} from "../../lib/purchase-vote";
import { qk } from "../../lib/query-keys";
import { CheckIcon } from "../icons";
import { Button } from "../ui/Button";
import { ErrorAlert } from "../ui/ErrorAlert";
import { Input } from "../ui/Input";
import { QueryBoundary } from "../ui/QueryBoundary";
import { SearchInput } from "../ui/SearchInput";
import { useConfirm } from "../ui/useConfirm";
import { AdminSection } from "./AdminSection";
import { TallyRows, voterMapOf } from "./TallyRows";

export function PurchaseVoteCard() {
  const queryClient = useQueryClient();
  const { confirm, confirmDialog } = useConfirm();

  const stateQuery = useQuery({
    queryKey: qk.adminPurchaseVote(),
    queryFn: ({ signal }) => fetchAdminPurchaseVote(signal),
  });
  const poll = stateQuery.data?.poll ?? null;
  const isOpen = poll !== null && poll.closedAt === null;

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: qk.adminPurchaseVote() });
    void queryClient.invalidateQueries({ queryKey: qk.purchaseVote() });
    void queryClient.invalidateQueries({ queryKey: qk.greetings() });
  };
  const createMutation = useMutation({ mutationFn: createPurchasePoll, onSettled: invalidate });
  const closeMutation = useMutation({ mutationFn: closePurchasePoll, onSettled: invalidate });
  const deleteMutation = useMutation({ mutationFn: deletePurchasePoll, onSettled: invalidate });
  const mutationError = createMutation.error ?? closeMutation.error ?? deleteMutation.error ?? null;

  // No hand-rolled async ladder here on purpose: the expanded body renders
  // through <QueryBoundary>; the collapsed summary derives from data
  // presence alone.
  const summary = stateQuery.isError
    ? "Couldn't load the vote"
    : stateQuery.data === undefined
      ? "Loading…"
      : isOpen
        ? `Open — ${poll.voterCount} of ${poll.requiredVoters} players have voted`
        : poll
          ? `Closed — winner: ${(poll.winnerSlug && resolveGame(poll.winnerSlug)?.title) ?? poll.winnerSlug ?? "nobody voted"}`
          : "No vote yet — pick the candidates and open one";

  return (
    <>
      <AdminSection tone="accent" eyebrow="Purchase vote" summary={summary}>
        {mutationError instanceof Error && <ErrorAlert message={mutationError.message} />}
        <QueryBoundary query={stateQuery} loadingLabel="Loading the vote…">
          {({ poll: current }) =>
            current !== null && current.closedAt === null ? (
              <OpenPollPanel
                poll={current}
                closing={closeMutation.isPending}
                deleting={deleteMutation.isPending}
                onClose={async () => {
                  const ok = await confirm({
                    title: "Close the vote now?",
                    description:
                      "The winner is computed from the current tally and players can no longer vote. Members aren't told — announce it from the Arrivals card when the games are here.",
                    confirmLabel: "Close the vote",
                    variant: "primary",
                  });
                  if (ok) closeMutation.mutate();
                }}
                onDelete={async () => {
                  const ok = await confirm({
                    title: "Delete this vote?",
                    description: "All cast votes are discarded. This cannot be undone.",
                    confirmLabel: "Delete vote",
                  });
                  if (ok) deleteMutation.mutate();
                }}
              />
            ) : (
              <>
                {current && <LastResult poll={current} />}
                <PollBuilder
                  creating={createMutation.isPending}
                  onCreate={(candidates, requiredVoters) =>
                    createMutation.mutate({ candidates, requiredVoters })
                  }
                />
              </>
            )
          }
        </QueryBoundary>
      </AdminSection>
      {confirmDialog}
    </>
  );
}

type AdminPoll = NonNullable<Awaited<ReturnType<typeof fetchAdminPurchaseVote>>["poll"]>;

function OpenPollPanel({
  poll,
  closing,
  deleting,
  onClose,
  onDelete,
}: {
  poll: AdminPoll;
  closing: boolean;
  deleting: boolean;
  onClose: () => void;
  onDelete: () => void;
}) {
  return (
    <>
      <p className="text-xs text-fg-secondary">
        Auto-closes when <span className="font-semibold text-fg-strong">{poll.requiredVoters}</span>{" "}
        players have voted.{" "}
        {poll.voters.length > 0 ? (
          <>
            Voted so far:{" "}
            <span className="text-fg-primary">{poll.voters.map((v) => v.name).join(", ")}</span>.
          </>
        ) : (
          "Nobody has voted yet."
        )}
      </p>
      <TallyRows
        tally={poll.tally}
        winnerSlug={poll.winnerSlug}
        voterById={voterMapOf(poll.voters)}
      />
      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" size="sm" disabled={deleting || closing} onClick={onDelete}>
          Delete vote
        </Button>
        <Button size="sm" disabled={closing || deleting} onClick={onClose}>
          Close now
        </Button>
      </div>
    </>
  );
}

function LastResult({ poll }: { poll: AdminPoll }) {
  return (
    <div className="space-y-2">
      <p className="text-xs text-fg-secondary">
        Last vote closed with{" "}
        <span className="font-semibold text-fg-strong">
          {(poll.winnerSlug && resolveGame(poll.winnerSlug)?.title) ??
            poll.winnerSlug ??
            "no votes cast"}
        </span>{" "}
        as the winner ({poll.voterCount} voters). Opening a new vote replaces it on every surface.
      </p>
      <TallyRows
        tally={poll.tally}
        winnerSlug={poll.winnerSlug}
        voterById={voterMapOf(poll.voters)}
      />
    </div>
  );
}

function PollBuilder({
  creating,
  onCreate,
}: {
  creating: boolean;
  onCreate: (candidates: string[], requiredVoters: number) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [required, setRequired] = useState("6");
  const [search, setSearch] = useState("");
  const requiredId = useId();

  const query = search.trim().toLowerCase();
  const options = games.filter((g) => query === "" || g.title.toLowerCase().includes(query));
  const requiredVoters = Number.parseInt(required, 10);
  const valid = selected.length >= 2 && Number.isInteger(requiredVoters) && requiredVoters >= 1;

  const toggle = (slug: string) =>
    setSelected((prev) => (prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]));

  return (
    <>
      <p className="text-xs text-fg-secondary">
        Pick at least two candidate games. Every player spends up to 3 votes on distinct games; the
        vote closes itself when the required number of players have voted.
      </p>
      <SearchInput
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search the catalog…"
        aria-label="Search the catalog"
      />
      <ul className="max-h-64 overflow-y-auto rounded-card-md border border-line">
        {options.map((g) => {
          const picked = selected.includes(g.slug);
          return (
            <li key={g.slug}>
              {/* biome-ignore lint/correctness/noRestrictedElements: bespoke picker row — a full-width thumbnail+title toggle, not a Button/Chip shape */}
              <button
                type="button"
                onClick={() => toggle(g.slug)}
                className={cn(
                  "flex w-full items-center gap-2 px-2 py-1.5 text-left transition",
                  picked ? "bg-accent-500/15" : "hover:bg-surface-800",
                )}
              >
                <img src={g.thumbnail} alt="" className="h-6 w-10 shrink-0 rounded object-cover" />
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate text-xs",
                    picked ? "font-semibold text-fg-strong" : "text-fg-secondary",
                  )}
                >
                  {g.title}
                </span>
                {picked && <CheckIcon className="h-3.5 w-3.5 shrink-0 text-accent-300" />}
              </button>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-2xs text-fg-muted">
          {selected.length} candidate{selected.length === 1 ? "" : "s"} selected
        </span>
        <div className="flex items-center gap-2">
          <label
            htmlFor={requiredId}
            className="flex items-center gap-2 text-2xs text-fg-secondary"
          >
            Players needed
            <Input
              id={requiredId}
              type="number"
              min={1}
              max={99}
              width="auto"
              value={required}
              onChange={(e) => setRequired(e.target.value)}
              className="w-16 text-center"
            />
          </label>
          <Button
            size="sm"
            disabled={!valid || creating}
            onClick={() => onCreate(selected, requiredVoters)}
          >
            Open the vote
          </Button>
        </div>
      </div>
    </>
  );
}
