// The purchase-vote voting screen — a deliberate, self-paced surface.
//
// Picks are LOCAL until the player hits Submit: browse the carousel as long
// as you like, toggle up to 3 games, then one save replaces your whole vote
// set on the server and flips to a "votes are in" confirmation showing your
// picks and the participation progress. Nothing here auto-saves and nothing
// closes on its own — this modal is opened from the greeting cards or the
// banner and only the player dismisses it. (v1 mounted the voting UI AS the
// greeting, so casting a vote invalidated the greeting and unmounted the
// screen mid-session — the bug this rewrite removes.)
//
// Per-game tallies stay hidden while the vote is open (anti-bandwagon);
// the confirmation shows only how many players have voted.

import { VOTES_PER_PLAYER } from "@boardgames/core/protocol";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { GameDefinition } from "../../games/types";
import { cn } from "../../lib/cn";
import { resolveGame } from "../../lib/games-by-slug";
import { reportPageView } from "../../lib/page-views";
import { fetchPurchaseVote, setPurchaseVotes } from "../../lib/purchase-vote";
import { qk } from "../../lib/query-keys";
import { CheckIcon, PlusIcon } from "../icons";
import GameCarousel3D from "../offline/GameCarousel3D";
import { Button } from "../ui/Button";
import { Chip } from "../ui/Chip";
import { ErrorAlert } from "../ui/ErrorAlert";
import { Modal } from "../ui/Modal";

export function PurchaseVoteModalView({
  candidates,
  selected,
  savedVotes,
  voterCount,
  requiredVoters,
  view,
  pollClosed,
  saving,
  error,
  onToggle,
  onSubmit,
  onClose,
}: {
  candidates: GameDefinition[];
  /** The player's local (unsaved) picks. */
  selected: string[];
  /** What the server currently has — drives the Submit/Update label + dirty check. */
  savedVotes: string[];
  voterCount: number;
  requiredVoters: number;
  view: "picking" | "saved";
  /** True when this player's submit sealed the poll. */
  pollClosed: boolean;
  saving: boolean;
  error: string | null;
  onToggle: (slug: string) => void;
  onSubmit: () => void;
  onClose: () => void;
}) {
  const votesLeft = VOTES_PER_PLAYER - selected.length;
  const dirty =
    selected.length !== savedVotes.length || selected.some((s) => !savedVotes.includes(s));
  const progress = `${voterCount} of ${requiredVoters} players have voted`;

  return (
    <Modal
      onClose={onClose}
      size="full"
      panelClassName="gap-2 p-4 sm:gap-4 sm:p-7"
      eyebrow="Purchase vote"
      eyebrowClassName="text-accent-300"
      title="Vote for the next game purchase"
      // One line on phones — every wrapped header line is carousel height
      // lost, and the card's size is the whole game on small screens.
      titleClassName="text-sm font-bold tracking-tight text-white xs2:text-lg sm:text-3xl"
      subheader={
        // Same reasoning: the explainer adds nothing a phone voter needs
        // (the footer already counts picks), so it's desktop-only.
        <p className="hidden text-xs text-fg-secondary sm:block">
          {view === "saved"
            ? `${progress} — the winner is revealed the moment the vote closes.`
            : `Pick up to ${VOTES_PER_PLAYER} games, then submit. You can change your picks any time until the vote closes — ${progress}.`}
        </p>
      }
    >
      {error && <ErrorAlert message={error} className="shrink-0 text-center" />}

      {view === "saved" ? (
        <SavedScreen
          selected={selected}
          voterCount={voterCount}
          requiredVoters={requiredVoters}
          pollClosed={pollClosed}
          onClose={onClose}
        />
      ) : (
        <>
          <div className="flex min-h-0 flex-1 items-center justify-center">
            <GameCarousel3D
              games={candidates}
              minPlayers={0}
              maxPlayers={0}
              date=""
              reactions={{}}
              highlightNew={false}
              renderThumbOverlay={(game, isCenter, compact) => {
                const picked = selected.includes(game.slug);
                return (
                  <Chip
                    pressed={picked}
                    tone="emerald"
                    shape="pill"
                    size={compact ? "sm" : "md"}
                    icon={
                      picked ? (
                        <CheckIcon className="h-3.5 w-3.5" />
                      ) : (
                        <PlusIcon className="h-3.5 w-3.5" />
                      )
                    }
                    disabled={!isCenter || (!picked && votesLeft === 0)}
                    title={
                      !picked && votesLeft === 0
                        ? `All ${VOTES_PER_PLAYER} picks are placed — remove one first`
                        : undefined
                    }
                    onClick={() => onToggle(game.slug)}
                    className="shadow-lg shadow-black/40"
                  >
                    {picked ? "Picked" : "Pick"}
                  </Chip>
                );
              }}
            />
          </div>

          {/* Single row always — the pick tokens truncate before this wraps,
              and Cancel is redundant with the header X on phones. */}
          <div className="flex shrink-0 items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              {Array.from({ length: VOTES_PER_PLAYER }, (_, i) => (
                <span
                  // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length token row
                  key={i}
                  aria-hidden="true"
                  className={cn(
                    "h-2.5 w-2.5 rounded-full transition",
                    i < selected.length ? "bg-emerald-400" : "border border-white/25",
                  )}
                />
              ))}
              <span className="truncate text-2xs text-fg-muted">
                {selected.length === 0
                  ? `${VOTES_PER_PLAYER} picks to place`
                  : votesLeft === 0
                    ? "All picks placed — submit to save them"
                    : `${votesLeft} pick${votesLeft === 1 ? "" : "s"} left`}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button variant="ghost" size="sm" onClick={onClose} className="hidden sm:inline-flex">
                Cancel
              </Button>
              {/* Gate only on "changed": submitting an EMPTY set is a valid
                  action (withdrawing your votes) — the empty-selection case
                  that must stay disabled is the pristine no-votes-yet one,
                  which `dirty` already covers. */}
              <Button size="sm" disabled={!dirty || saving} onClick={onSubmit}>
                {saving
                  ? "Saving…"
                  : savedVotes.length > 0
                    ? selected.length === 0
                      ? "Withdraw votes"
                      : "Update votes"
                    : "Submit votes"}
              </Button>
            </div>
          </div>
        </>
      )}
    </Modal>
  );
}

function SavedScreen({
  selected,
  voterCount,
  requiredVoters,
  pollClosed,
  onClose,
}: {
  selected: string[];
  voterCount: number;
  requiredVoters: number;
  pollClosed: boolean;
  onClose: () => void;
}) {
  const picks = selected
    .map((slug) => resolveGame(slug))
    .filter((g): g is GameDefinition => g !== undefined);
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 overflow-y-auto text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/20">
        <CheckIcon className="h-7 w-7 text-emerald-300" />
      </span>
      <div className="max-w-md">
        <h3 className="text-lg font-bold text-white">
          {picks.length === 0 ? "Your votes are withdrawn" : "Your votes are in"}
        </h3>
        <p className="mt-1 text-xs text-fg-secondary">
          {pollClosed
            ? "Yours was the last vote needed — the vote is closed and the winner is on the way!"
            : picks.length === 0
              ? `${voterCount} of ${requiredVoters} players have voted. Come back and spend your 3 votes any time before the vote closes.`
              : `${voterCount} of ${requiredVoters} players have voted. You can change your picks any time until the vote closes; the winner is revealed to everyone the moment it does.`}
        </p>
      </div>
      <div className="flex flex-wrap items-start justify-center gap-3">
        {picks.map((g) => (
          <div key={g.slug} className="w-28">
            <img
              src={g.thumbnail}
              alt=""
              className="aspect-video w-full rounded-lg border border-white/10 object-cover"
            />
            <p className="mt-1.5 truncate text-2xs font-semibold text-fg-secondary">{g.title}</p>
          </div>
        ))}
      </div>
      <Button size="sm" onClick={onClose}>
        Done
      </Button>
    </div>
  );
}

/**
 * Data wiring: poll state, local pick state seeded from the server, and the
 * one-shot submit. Renders nothing until the poll loads; keeps rendering the
 * saved screen even when the player's own submit just closed the poll.
 */
export function PurchaseVoteModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const stateQuery = useQuery({
    queryKey: qk.purchaseVote(),
    queryFn: ({ signal }) => fetchPurchaseVote(signal),
  });
  const poll = stateQuery.data?.poll ?? null;

  const [selected, setSelected] = useState<string[] | null>(null);
  const [view, setView] = useState<"picking" | "saved">("picking");
  useEffect(() => {
    if (poll && selected === null) setSelected(poll.myVotes);
  }, [poll, selected]);

  // Activity beacon: the voting screen is a non-route surface (opened from a
  // greeting card or the banner) — mirrors the RsvpModal pattern.
  useEffect(() => {
    reportPageView("purchase-vote");
  }, []);

  const submitMutation = useMutation({
    mutationFn: setPurchaseVotes,
    onSuccess: () => setView("saved"),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: qk.purchaseVote() });
      // The reminder greeting keys off votes spent; the reveal keys off close.
      void queryClient.invalidateQueries({ queryKey: qk.greetings() });
    },
  });

  if (!poll || selected === null) return null;
  // A poll that closed before this session opened the modal has nothing to
  // vote on; but when it closes DURING the session (this player's submit made
  // quorum), keep the saved screen up until they dismiss it.
  if (poll.closedAt !== null && view !== "saved") return null;

  // Alphabetical, not the admin's click order at poll creation — every
  // voter browses the same neutral sequence.
  const candidates = poll.candidates
    .map((slug) => resolveGame(slug))
    .filter((g): g is GameDefinition => g !== undefined)
    .sort((a, b) => a.title.localeCompare(b.title));
  if (candidates.length === 0) return null;

  return (
    <PurchaseVoteModalView
      candidates={candidates}
      selected={selected}
      savedVotes={poll.myVotes}
      voterCount={poll.voterCount}
      requiredVoters={poll.requiredVoters}
      view={view}
      pollClosed={poll.closedAt !== null}
      saving={submitMutation.isPending}
      error={submitMutation.error instanceof Error ? submitMutation.error.message : null}
      onToggle={(slug) =>
        setSelected((prev) => {
          const cur = prev ?? [];
          return cur.includes(slug) ? cur.filter((s) => s !== slug) : [...cur, slug];
        })
      }
      onSubmit={() => submitMutation.mutate(selected)}
      onClose={onClose}
    />
  );
}
