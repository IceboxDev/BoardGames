import type { Card } from "@boardgames/core/games/sushi-go/types";
import CardFace from "../CardFace";
import type { TableauGroups } from "../tableau-utils";
import DumplingStation from "./DumplingStation";
import MakiStation from "./MakiStation";
import NigiriStation from "./NigiriStation";
import PuddingStation from "./PuddingStation";
import SashimiStation from "./SashimiStation";
import TempuraStation from "./TempuraStation";

interface StationGridProps {
  groups: TableauGroups;
  compact?: boolean;
}

function hasNigiri(g: TableauGroups["nigiri"]): boolean {
  return g.boosted.length > 0 || g.unboosted.length > 0 || g.unusedWasabi.length > 0;
}

function hasTempura(g: TableauGroups["tempura"]): boolean {
  return g.completePairs.length > 0 || g.remainder.length > 0;
}

function hasSashimi(g: TableauGroups["sashimi"]): boolean {
  return g.completeTriples.length > 0 || g.remainder.length > 0;
}

export default function StationGrid({ groups, compact }: StationGridProps) {
  return (
    <div className={`flex flex-wrap ${compact ? "gap-1.5" : "gap-2"}`}>
      {groups.maki.cards.length > 0 && (
        <MakiStation
          cards={groups.maki.cards}
          totalPips={groups.maki.totalPips}
          compact={compact}
        />
      )}
      {hasNigiri(groups.nigiri) && (
        <NigiriStation
          boosted={groups.nigiri.boosted}
          unboosted={groups.nigiri.unboosted}
          unusedWasabi={groups.nigiri.unusedWasabi}
          points={groups.nigiri.points}
          compact={compact}
        />
      )}
      {hasTempura(groups.tempura) && (
        <TempuraStation
          completePairs={groups.tempura.completePairs}
          remainder={groups.tempura.remainder}
          points={groups.tempura.points}
          compact={compact}
        />
      )}
      {hasSashimi(groups.sashimi) && (
        <SashimiStation
          completeTriples={groups.sashimi.completeTriples}
          remainder={groups.sashimi.remainder}
          points={groups.sashimi.points}
          compact={compact}
        />
      )}
      {groups.dumpling.cards.length > 0 && (
        <DumplingStation
          cards={groups.dumpling.cards}
          points={groups.dumpling.points}
          compact={compact}
        />
      )}
      {groups.pudding.count > 0 && (
        <PuddingStation
          count={groups.pudding.count}
          currentRoundCards={groups.pudding.currentRoundCards}
          compact={compact}
        />
      )}
      {/* Chopsticks — minimal inline indicator */}
      {groups.chopsticks.cards.length > 0 && (
        <div className="flex items-center gap-1.5 self-start rounded-xl border border-gray-500/15 bg-gray-500/[0.03] p-2">
          {groups.chopsticks.cards.map((c: Card) => (
            <CardFace key={c.id} type="chopsticks" size="sm" />
          ))}
          <span className="text-[10px] text-gray-500 italic">Ready</span>
        </div>
      )}
    </div>
  );
}
