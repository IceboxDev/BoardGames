// Persistent entry point while a purchase vote is open — the nag popup stops
// after the first cast vote, so this banner is how players spend remaining
// votes or change their picks. Renders nothing when no poll is open.

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import { fetchPurchaseVote } from "../../lib/purchase-vote";
import { qk } from "../../lib/query-keys";
import { MegaphoneIcon } from "../icons";
import { Button } from "../ui/Button";
import { Surface } from "../ui/Surface";
import { PurchaseVoteModal } from "./PurchaseVoteModal";

export function PurchaseVoteBanner() {
  const { user } = useCurrentUser();
  const [open, setOpen] = useState(false);
  const stateQuery = useQuery({
    queryKey: qk.purchaseVote(),
    queryFn: ({ signal }) => fetchPurchaseVote(signal),
    enabled: user !== null && user.onlineMode !== "online",
  });
  const poll = stateQuery.data?.poll ?? null;
  if (!poll || poll.closedAt !== null) return null;

  const cast = poll.myVotes.length;
  const headline =
    cast === 0
      ? "Purchase vote open — your 3 votes are waiting"
      : poll.votesLeft > 0
        ? `Purchase vote open — ${poll.votesLeft} vote${poll.votesLeft === 1 ? "" : "s"} left`
        : "Purchase vote open — all your votes are in";

  return (
    <>
      <Surface
        variant="tile"
        padding="none"
        className="flex shrink-0 items-center gap-3 border border-accent-400/25 bg-gradient-to-r from-accent-500/15 to-transparent px-3 py-2"
      >
        <MegaphoneIcon className="h-4 w-4 shrink-0 text-accent-300" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold text-white">{headline}</p>
          <p className="truncate text-2xs text-fg-secondary">
            {poll.voterCount} of {poll.requiredVoters} players have voted — the winner is bought
            when everyone weighs in.
          </p>
        </div>
        <Button size="sm" onClick={() => setOpen(true)}>
          {cast === 0 ? "Vote now" : "Change picks"}
        </Button>
      </Surface>
      {open && <PurchaseVoteModal onClose={() => setOpen(false)} />}
    </>
  );
}
