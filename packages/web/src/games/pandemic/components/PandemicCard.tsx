import { CITY_DATA } from "@boardgames/core/games/pandemic/city-graph";
import { getEventName } from "@boardgames/core/games/pandemic/events";
import type { DiseaseColor, PlayerCard } from "@boardgames/core/games/pandemic/types";

const DISEASE_CSS: Record<DiseaseColor, string> = {
  blue: "#4488ff",
  yellow: "#ffcc00",
  black: "#444",
  red: "#ff3333",
};

interface PandemicCardProps {
  card: PlayerCard;
  selected?: boolean;
}

export default function PandemicCard({ card, selected }: PandemicCardProps) {
  if (card.kind === "city") {
    const name = CITY_DATA.get(card.cityId)?.name ?? card.cityId;
    return (
      <div
        className="flex h-full w-full overflow-hidden rounded-lg"
        style={{
          backgroundColor: selected ? "#444" : "#2a2a2a",
          border: selected ? "2px solid #ffcc00" : "2px solid #666",
        }}
      >
        <div className="shrink-0" style={{ width: 16, backgroundColor: DISEASE_CSS[card.color] }} />
        <div className="flex flex-1 items-center p-2">
          <span className="text-xs leading-tight font-medium text-white">{name}</span>
        </div>
      </div>
    );
  }

  if (card.kind === "event") {
    return (
      <div
        className="flex h-full w-full flex-col items-center justify-center overflow-hidden rounded-lg p-2"
        style={{
          backgroundColor: selected ? "#444" : "#2a2a2a",
          border: selected ? "2px solid #ffcc00" : "2px solid #daa520",
        }}
      >
        <span className="text-xs font-bold" style={{ color: "#daa520" }}>
          EVENT
        </span>
        <span className="mt-1 text-center text-xs leading-tight text-white">
          {getEventName(card.event)}
        </span>
      </div>
    );
  }

  return null;
}
