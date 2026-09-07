import type { SensoPlayerView } from "@boardgames/core/games/senso-battle-for-japan/types";
import { Badge, MicroLabel } from "../../../components/ui";
import { cn } from "../../../lib/cn";
import { seatShortLabel } from "../logic/seat-labels";
import SensoCard from "./SensoCard";

interface Props {
  view: SensoPlayerView;
  names: readonly (string | null)[];
  className?: string;
}

/** The cards played to the middle of the table this conflict, in play order from the leader. */
export default function TrickTable({ view, names, className }: Props) {
  const n = view.players.length;
  const settling = view.phase === "trick-settle" && view.completedTrick !== null;
  const plays = view.completedTrick?.plays ?? view.table;
  const winner = settling ? view.completedTrick?.winner : undefined;
  const seats = Array.from({ length: n }, (_, i) => (view.leader + i) % n);
  const winnerLabel = winner === undefined ? null : seatShortLabel(view, winner, names);

  return (
    <div className={cn("flex flex-col items-center gap-2", className)}>
      <div className="flex flex-wrap items-start justify-center gap-3">
        {seats.map((seat) => {
          const play = plays.find((p) => p.seat === seat);
          const isWinner = winner === seat;
          return (
            <div key={seat} className="flex flex-col items-center gap-1">
              <MicroLabel className="max-w-16 truncate">
                {seatShortLabel(view, seat, names)}
              </MicroLabel>
              {play ? (
                <div
                  className={cn(
                    "relative rounded-card-xl transition-transform",
                    isWinner && "-translate-y-1 ring-2 ring-emerald-400",
                  )}
                >
                  <SensoCard card={play.card} size="table" trump={view.trumpSuit} />
                  {seat === view.leader && (
                    <Badge size="xs" className="absolute -bottom-2 left-1/2 -translate-x-1/2">
                      lead
                    </Badge>
                  )}
                </div>
              ) : (
                <div className="aspect-card w-14 rounded-card-xl border border-dashed border-line sm:w-16" />
              )}
            </div>
          );
        })}
      </div>
      <p className="min-h-4 text-center text-2xs text-fg-secondary" aria-live="polite">
        {winnerLabel ? `${winnerLabel} wins the conflict` : ""}
      </p>
    </div>
  );
}
