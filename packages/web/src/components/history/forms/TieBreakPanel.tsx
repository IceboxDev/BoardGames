import type { MatchOutcomeFreeForAll } from "@boardgames/core/history/types";
import { ordinal } from "../../../lib/match-result-badge";
import { ChevronDownIcon } from "../../icons";
import { IconButton } from "../../ui/IconButton";
import { PlayerRow } from "../PlayerRow";
import { breakTie, placementOrder } from "./free-for-all-placement";

type Player = MatchOutcomeFreeForAll["players"][number];

/**
 * "Break the tie" block for scored free-for-alls: players sharing a score are
 * ordered by hand with up/down arrows, written back as `rank`. Shared by the
 * plain score form and the score-race form (Take 5, Bandit).
 */
export function TieBreakPanel({
  players,
  lowestWins,
  onChange,
}: {
  players: Player[];
  lowestWins: boolean;
  onChange: (players: Player[]) => void;
}) {
  const ranked = placementOrder(players, lowestWins);
  return (
    <div className="flex flex-col gap-2 rounded-card-xl border border-amber-500/30 bg-amber-500/5 p-3">
      <div className="flex flex-col gap-0.5">
        <span className="text-xs font-medium text-amber-200">Break the tie</span>
        <span className="text-2xs leading-snug text-fg-secondary">
          Players share a score. Use the arrows to order tied players so the placement is
          unambiguous — top is 1st.
        </span>
      </div>
      <div className="flex flex-col gap-1">
        {ranked.map((p, i) => {
          const tiedAbove = i > 0 && ranked[i - 1].score === p.score;
          const tiedBelow = i < ranked.length - 1 && ranked[i + 1].score === p.score;
          return (
            <PlayerRow
              key={p.userId}
              highlight={i === 0}
              name={
                <span className="flex items-center gap-2">
                  <span className="w-7 shrink-0 text-2xs font-medium tabular-nums text-fg-muted">
                    {ordinal(i + 1)}
                  </span>
                  <span className="truncate">{p.displayName}</span>
                </span>
              }
              right={<span className="text-xs tabular-nums text-fg-muted">{p.score}</span>}
              actions={
                tiedAbove || tiedBelow ? (
                  <div className="flex flex-col">
                    <IconButton
                      size="xs"
                      aria-label={`Move ${p.displayName} up`}
                      disabled={!tiedAbove}
                      onClick={() => onChange(breakTie(players, p.userId, "up", lowestWins))}
                      className="h-5 w-6 p-0"
                      icon={<ChevronDownIcon className="h-3 w-3 rotate-180" />}
                    />
                    <IconButton
                      size="xs"
                      aria-label={`Move ${p.displayName} down`}
                      disabled={!tiedBelow}
                      onClick={() => onChange(breakTie(players, p.userId, "down", lowestWins))}
                      className="h-5 w-6 p-0"
                      icon={<ChevronDownIcon className="h-3 w-3" />}
                    />
                  </div>
                ) : null
              }
            />
          );
        })}
      </div>
    </div>
  );
}
