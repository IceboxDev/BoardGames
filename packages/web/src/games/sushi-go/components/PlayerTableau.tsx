import type { Card } from "@boardgames/core/games/sushi-go/types";
import { makiCount } from "@boardgames/core/games/sushi-go/types";
import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState } from "react";
import CardFace from "./CardFace";
import StationGrid from "./stations/StationGrid";
import { groupTableau, hasAnyCards } from "./tableau-utils";

interface PlayerTableauProps {
  index: number;
  tableau: Card[];
  wasabiBoostedNigiriIds: number[];
  puddings: number;
  isYou: boolean;
  hasSelected: boolean;
  handCount: number;
  round?: number;
  score?: number;
}

export default function PlayerTableau({
  index,
  tableau,
  wasabiBoostedNigiriIds,
  puddings,
  isYou,
  hasSelected,
  handCount,
  round,
  score,
}: PlayerTableauProps) {
  const groups = useMemo(
    () => groupTableau(tableau, wasabiBoostedNigiriIds, puddings),
    [tableau, wasabiBoostedNigiriIds, puddings],
  );

  if (isYou) {
    return (
      <YourBoard
        groups={groups}
        tableau={tableau}
        hasSelected={hasSelected}
        handCount={handCount}
        round={round}
        score={score}
      />
    );
  }

  return (
    <OpponentBoard
      index={index}
      groups={groups}
      tableau={tableau}
      wasabiBoostedNigiriIds={wasabiBoostedNigiriIds}
      puddings={puddings}
      hasSelected={hasSelected}
      handCount={handCount}
      score={score}
    />
  );
}

// ── Your Board (rich station layout) ──────────────────────────────────────

interface YourBoardProps {
  groups: ReturnType<typeof groupTableau>;
  tableau: Card[];
  hasSelected: boolean;
  handCount: number;
  round?: number;
  score?: number;
}

function YourBoard({ groups, tableau, hasSelected, handCount, round, score }: YourBoardProps) {
  const hasCards = hasAnyCards(groups);

  return (
    <div className="bamboo-mat rounded-2xl border border-orange-500/20 bg-gray-900/80 p-3">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-orange-300">Your Board</span>
          {round && (
            <span className="text-xs text-gray-500">
              Round {round} &middot; {tableau.length} cards
            </span>
          )}
          {score != null && score > 0 && (
            <span className="text-xs font-semibold tabular-nums text-orange-400">{score} pts</span>
          )}
        </div>
        <div className="text-xs text-gray-500">
          {hasSelected ? (
            <span className="text-green-400">Ready</span>
          ) : (
            <span>Picking... ({handCount} cards)</span>
          )}
        </div>
      </div>

      {/* Station grid */}
      {hasCards ? (
        <StationGrid groups={groups} />
      ) : (
        <div className="py-6 text-center text-sm text-gray-600 italic">
          Your sushi bar is empty — pick your first card!
        </div>
      )}
    </div>
  );
}

// ── Opponent Board (compact row + hover expand) ───────────────────────────

interface OpponentBoardProps {
  index: number;
  groups: ReturnType<typeof groupTableau>;
  tableau: Card[];
  wasabiBoostedNigiriIds: number[];
  puddings: number;
  hasSelected: boolean;
  handCount: number;
  score?: number;
}

function OpponentBoard({
  index,
  groups,
  tableau,
  wasabiBoostedNigiriIds,
  puddings,
  hasSelected,
  handCount,
  score,
}: OpponentBoardProps) {
  const [hovered, setHovered] = useState(false);
  const totalMaki = tableau.reduce((s, c) => s + makiCount(c.type), 0);
  const totalPuddings = puddings + tableau.filter((c) => c.type === "pudding").length;
  const hasCards = hasAnyCards(groups);

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: hover-to-preview is decorative
    <div
      className="rounded-lg border border-gray-800 bg-gray-900/50 p-1.5"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Compact header + card strip */}
      <div className="flex items-center gap-2">
        <span className="shrink-0 text-xs text-gray-400">P{index + 1}</span>
        {score != null && score > 0 && (
          <span className="shrink-0 text-[10px] font-semibold tabular-nums text-gray-300">
            {score}
          </span>
        )}
        <div className="flex min-w-0 gap-0.5 overflow-hidden">
          {tableau.map((card) => (
            <CardFace
              key={card.id}
              type={card.type}
              size="sm"
              wasabiBoosted={wasabiBoostedNigiriIds.includes(card.id)}
            />
          ))}
          {tableau.length === 0 && <span className="text-xs text-gray-600 italic">No cards</span>}
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1.5 text-[10px] text-gray-500">
          {totalMaki > 0 && <span>🍣{totalMaki}</span>}
          {totalPuddings > 0 && <span>🍮{totalPuddings}</span>}
          {hasSelected ? <span className="text-green-400">✓</span> : <span>{handCount}</span>}
        </div>
      </div>

      {/* Hover expansion */}
      <AnimatePresence>
        {hovered && hasCards && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="overflow-hidden"
          >
            <div className="bamboo-mat mt-2 rounded-xl border border-gray-700/30 p-2">
              <StationGrid groups={groups} compact />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
