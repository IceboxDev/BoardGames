import type { Card } from "@boardgames/core/games/sushi-go/types";
import { nigiriValue } from "@boardgames/core/games/sushi-go/types";
import CardFace from "../CardFace";
import type { CardSize } from "../card-utils";
import StationShell from "./StationShell";

interface NigiriStationProps {
  boosted: { nigiri: Card; wasabi: Card }[];
  unboosted: Card[];
  unusedWasabi: Card[];
  points: number;
  compact?: boolean;
}

export default function NigiriStation({
  boosted,
  unboosted,
  unusedWasabi,
  points,
  compact,
}: NigiriStationProps) {
  const size: CardSize = compact ? "sm" : "tableau";
  return (
    <StationShell
      theme="nigiri"
      emoji="🍣"
      label="Nigiri"
      badge={`${points} pts`}
      badgeDimmed={points === 0}
      compact={compact}
    >
      <div className="flex flex-wrap items-end gap-3">
        {/* Boosted: nigiri stacked on wasabi */}
        {boosted.map(({ nigiri, wasabi }) => {
          const val = nigiriValue(nigiri.type);
          return (
            <div key={nigiri.id} className="flex flex-col items-center">
              <div className="relative">
                <div className="-rotate-3 opacity-80">
                  <CardFace type={wasabi.type} size={size} />
                </div>
                <div className="absolute -top-1.5 left-1.5 shadow-[0_0_8px_rgba(74,222,128,0.3)]">
                  <CardFace type={nigiri.type} size={size} wasabiBoosted />
                </div>
              </div>
              <span className="mt-1 text-[10px] font-semibold text-green-400">x3 = {val * 3}</span>
            </div>
          );
        })}

        {/* Unboosted nigiri */}
        {unboosted.map((card) => {
          const val = nigiriValue(card.type);
          return (
            <div key={card.id} className="flex flex-col items-center">
              <CardFace type={card.type} size={size} />
              <span className="mt-1 text-[10px] text-rose-400/70">{val} pts</span>
            </div>
          );
        })}

        {/* Unused wasabi — waiting */}
        {unusedWasabi.map((card) => (
          <div key={card.id} className="flex flex-col items-center">
            <div className="animate-pulse rounded-lg ring-2 ring-dashed ring-green-500/30">
              <CardFace type={card.type} size={size} />
            </div>
            <span className="mt-1 text-[10px] text-green-400/50 italic">Waiting...</span>
          </div>
        ))}
      </div>
    </StationShell>
  );
}
