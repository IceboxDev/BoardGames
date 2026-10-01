import { VOTES_PER_PLAYER } from "@boardgames/core/protocol";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { GameDefinition } from "../../games/types";
import { resolveGame } from "../../lib/games-by-slug";
import { reportPageView } from "../../lib/page-views";
import { fetchPurchaseVote, setPurchaseVotes } from "../../lib/purchase-vote";
import { qk } from "../../lib/query-keys";

// The voting screen's data and words, apart from its markup — so the
// standalone dialog and the two-page purchase takeover run the same session.

export type PurchaseVotePaneProps = {
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
  /** The poll's theme headline, when the admin gave it one. */
  title?: string | null;
  /** A footer button back to whatever introduced the vote (the takeover). */
  onBack?: () => void;
};

/** The voting screen's header — shared with the two-page purchase takeover. */
export function voteHeader({
  view,
  voterCount,
  requiredVoters,
  title,
}: Pick<PurchaseVotePaneProps, "view" | "voterCount" | "requiredVoters" | "title">) {
  const progress = `${voterCount} of ${requiredVoters} players have voted`;
  return {
    eyebrow: "Purchase vote",
    title: title ?? "Vote for the next game purchase",
    subheader:
      view === "saved"
        ? `${progress} — the winner is revealed the moment the vote closes.`
        : `Pick up to ${VOTES_PER_PLAYER} games, then submit. You can change your picks any time until the vote closes — ${progress}.`,
  };
}

// One line on phones — every wrapped header line is carousel height lost,
// and the card's size is the whole game on small screens.
export const VOTE_TITLE_CLASS =
  "text-sm font-bold tracking-tight text-fg-strong xs2:text-lg sm:text-3xl";

/**
 * Data wiring: poll state, local pick state seeded from the server, and the
 * one-shot submit. Null until the poll loads; keeps returning the saved
 * screen even when the player's own submit just closed the poll.
 */
export function usePurchaseVoteSession({
  onClose,
  via,
}: {
  onClose: () => void;
  /** What opened the screen, for the activity trail (a greeting's button). */
  via?: string;
}): (PurchaseVotePaneProps & { title: string | null; blurb: string | null }) | null {
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
  // greeting card or the banner) — mirrors the RsvpModal pattern. Once per
  // opening: `via` is fixed for the session's lifetime.
  // biome-ignore lint/correctness/useExhaustiveDependencies: report the opening, not prop changes
  useEffect(() => {
    reportPageView("purchase-vote", undefined, { via });
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
  // A poll that closed before this session opened the screen has nothing to
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

  return {
    candidates,
    selected,
    savedVotes: poll.myVotes,
    voterCount: poll.voterCount,
    requiredVoters: poll.requiredVoters,
    view,
    pollClosed: poll.closedAt !== null,
    saving: submitMutation.isPending,
    error: submitMutation.error instanceof Error ? submitMutation.error.message : null,
    onToggle: (slug) =>
      setSelected((prev) => {
        const cur = prev ?? [];
        return cur.includes(slug) ? cur.filter((s) => s !== slug) : [...cur, slug];
      }),
    onSubmit: () => submitMutation.mutate(selected),
    onClose,
    title: poll.title,
    blurb: poll.blurb,
  };
}
