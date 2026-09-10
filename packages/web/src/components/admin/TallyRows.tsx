import type { AdminPurchaseTallyEntry } from "@boardgames/core/protocol";
import { cn } from "../../lib/cn";
import { resolveGame } from "../../lib/games-by-slug";
import { Avatar } from "../ui/Avatar";

// The admin's view of a purchase-vote tally: one bar per candidate with the
// faces of the members who voted for it. Shared by the purchase-vote card
// (live and sealed polls) and the arrivals card (the closed poll being
// announced), which is why the voter lookup is a plain map rather than the
// poll payload — each card resolves ids from its own side-car.

/** Beyond this many voters on one game, the stack ends in a "+N" disc. */
const TALLY_AVATAR_CAP = 8;

export type VoterRef = { name: string; image?: string | null };

export function VoterStack({
  voterIds,
  voterById,
  cap = TALLY_AVATAR_CAP,
}: {
  voterIds: readonly string[];
  voterById: ReadonlyMap<string, VoterRef>;
  cap?: number;
}) {
  const overflow = voterIds.length - cap;
  return (
    <span className="relative inline-flex shrink-0 -space-x-1.5">
      {voterIds.slice(0, cap).map((id) => {
        const voter = voterById.get(id);
        return (
          <span key={id} title={voter?.name ?? "Unknown member"}>
            <Avatar
              name={voter?.name ?? "?"}
              image={voter?.image}
              size="xs"
              className="h-6 w-6 text-3xs ring-2 ring-surface-900"
            />
          </span>
        );
      })}
      {overflow > 0 && (
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-fill-strong text-3xs font-semibold tabular-nums text-fg-secondary ring-2 ring-surface-900">
          +{overflow}
        </span>
      )}
    </span>
  );
}

export function TallyRows({
  tally,
  winnerSlug,
  voterById,
}: {
  tally: readonly AdminPurchaseTallyEntry[];
  winnerSlug: string | null;
  voterById: ReadonlyMap<string, VoterRef>;
}) {
  const maxVotes = Math.max(1, ...tally.map((t) => t.votes));
  return (
    <ul className="flex flex-col gap-1">
      {tally.map((entry) => {
        const game = resolveGame(entry.slug);
        const isWinner = winnerSlug === entry.slug;
        return (
          <li
            key={entry.slug}
            className="relative flex items-center gap-2 overflow-hidden rounded-card-md bg-surface-900/70 px-2 py-1.5"
          >
            <span
              aria-hidden="true"
              className={cn("absolute inset-y-0 left-0", isWinner ? "bg-accent-500/20" : "bg-fill")}
              style={{ width: `${(entry.votes / maxVotes) * 100}%` }}
            />
            {game && (
              <img
                src={game.thumbnail}
                alt=""
                className="relative h-6 w-10 shrink-0 rounded object-cover"
              />
            )}
            <span
              className={cn(
                "relative min-w-0 flex-1 truncate text-xs",
                isWinner ? "font-semibold text-fg-strong" : "text-fg-secondary",
              )}
            >
              {game?.title ?? entry.slug}
            </span>
            {/* The voters themselves, oldest vote first, instead of a bare
                count — the ring separates overlapping faces from the bar. */}
            <VoterStack voterIds={entry.voterIds} voterById={voterById} />
          </li>
        );
      })}
    </ul>
  );
}

/** The purchase-vote payload's voter list as the lookup the rows want. */
export function voterMapOf(voters: readonly { id: string; name: string; image?: string | null }[]) {
  return new Map<string, VoterRef>(voters.map((v) => [v.id, { name: v.name, image: v.image }]));
}
