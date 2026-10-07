// Persistent entry point while a purchase vote is open — the nag popup stops
// after the first cast vote, so this banner is how players spend remaining
// votes or change their picks. Renders nothing when no poll is open.

import { VOTES_PER_PLAYER } from "@boardgames/core/protocol";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import { fetchPurchaseVote } from "../../lib/purchase-vote";
import { qk } from "../../lib/query-keys";
import { MegaphoneIcon } from "../icons";
import { Button } from "../ui/Button";
import { Surface } from "../ui/Surface";
import { PurchaseVoteModal } from "./PurchaseVoteModal";
import { voteShortTitle } from "./vote-copy";

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
  // Short enough to sit whole on a 320px phone: the vote's name, then what
  // the viewer still owes it. Wraps rather than truncating.
  const headline =
    cast === 0
      ? `${VOTES_PER_PLAYER} votes to spend`
      : poll.votesLeft > 0
        ? `${poll.votesLeft} vote${poll.votesLeft === 1 ? "" : "s"} left`
        : "All your votes are in";

  return (
    <>
      <Surface
        variant="tile"
        padding="none"
        className="flex shrink-0 items-center gap-2.5 border border-accent-400/25 bg-gradient-to-r from-accent-500/15 to-transparent px-3 py-2"
      >
        <MegaphoneIcon className="h-4 w-4 shrink-0 text-accent-300" />
        <div className="min-w-0 flex-1">
          {/* Two lines on any phone: the vote, then what the viewer still
              owes it and where it stands. */}
          <p className="text-3xs font-semibold uppercase tracking-label text-accent-300">
            {voteShortTitle(poll.title)}
          </p>
          <p className="text-xs font-semibold leading-snug text-fg-strong">
            {headline}
            <span className="font-normal text-fg-secondary">
              {" "}
              · {poll.voterCount}/{poll.requiredVoters} voted
            </span>
          </p>
        </div>
        <Button size="sm" className="shrink-0" onClick={() => setOpen(true)}>
          {cast === 0 ? "Vote" : "Change"}
        </Button>
      </Surface>
      {open && <PurchaseVoteModal onClose={() => setOpen(false)} />}
    </>
  );
}
