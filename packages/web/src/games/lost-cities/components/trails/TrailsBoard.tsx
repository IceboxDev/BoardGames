import type {
  Card as CardData,
  DiscardPiles,
  ExpeditionColor,
  Expeditions,
} from "@boardgames/core/games/lost-cities/types";
import { EXPEDITION_COLORS } from "@boardgames/core/games/lost-cities/types";
import { useRef } from "react";
import { cn } from "../../../../lib/cn";
import ExpeditionTrail from "./ExpeditionTrail";
import { useTrailGeometry } from "./useTrailGeometry";

export interface TrailsBoardProps {
  /** Your lines (drawn as cards) and the opponent's (drawn as the chip log). */
  mine: Expeditions;
  theirs: Expeditions;
  discardPiles: DiscardPiles;
  names: { me: string; them: string };
  /** The selected hand card: lights its trail and ghosts where it would land. */
  selected?: CardData | null;
  /** Whether the selected card may go on your line. */
  canPlaySelected?: boolean;
  takeable?: ReadonlySet<ExpeditionColor>;
  lockedColor?: ExpeditionColor | null;
  onTake?: (color: ExpeditionColor) => void;
  highlightId?: number;
}

/** The five trails side by side, sized from the board's box (never its contents). */
export default function TrailsBoard({
  mine,
  theirs,
  discardPiles,
  names,
  selected,
  canPlaySelected = false,
  takeable,
  lockedColor,
  onTake,
  highlightId,
}: TrailsBoardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const geo = useTrailGeometry(ref);
  return (
    <div ref={ref} className="relative min-h-0 w-full flex-1">
      {geo && (
        <div className={cn("absolute inset-0 grid grid-cols-5", geo.narrow ? "gap-1" : "gap-2")}>
          {EXPEDITION_COLORS.map((color) => {
            const focus = selected?.color === color;
            return (
              <ExpeditionTrail
                key={color}
                color={color}
                geo={geo}
                mine={mine[color]}
                theirs={theirs[color]}
                discard={discardPiles[color]}
                names={names}
                focus={focus}
                ghost={focus && canPlaySelected ? selected : null}
                canTake={takeable?.has(color) ?? false}
                locked={lockedColor === color}
                onTake={onTake ? () => onTake(color) : undefined}
                highlightId={highlightId}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
