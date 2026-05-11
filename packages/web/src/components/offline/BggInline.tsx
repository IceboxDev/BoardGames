import { weightStats } from "../../games/registry";
import type { BggGame } from "../../games/types";
import { StarIcon } from "../icons";
import { formatCount, weightLabel } from "./bgg-helpers";

/**
 * Compact rating + complexity strip rendered inside a game card. Shared by
 * `GameCarousel3D` (single-game cards) and `FamilyCarouselCard` (family
 * cards) so both surface the same BGG signal block.
 */
export function BggInline({ bgg, compact }: { bgg: BggGame; compact: boolean }) {
  const hasRating = bgg.averageRating !== null;
  const hasWeight = !compact && bgg.averageWeight !== null && bgg.averageWeight > 0;
  if (!hasRating && !hasWeight) return null;

  return (
    <div className="flex flex-col gap-1.5 border-y border-white/[0.05] py-2 text-[11px] text-gray-400">
      {hasRating && bgg.averageRating !== null && (
        <div className="flex items-center gap-2">
          <StarIcon className="h-3.5 w-3.5 text-amber-400" />
          <span className="font-semibold text-gray-200 tabular-nums">
            {bgg.averageRating.toFixed(1)}
          </span>
          <span className="text-gray-500">/ 10</span>
          {bgg.numRatings ? (
            <span className="ml-auto text-[10px] text-gray-500">
              {formatCount(bgg.numRatings)} ratings
            </span>
          ) : null}
        </div>
      )}
      {hasWeight && bgg.averageWeight !== null && (
        <div className="flex items-center gap-2">
          <span className="shrink-0 text-[10px] uppercase tracking-[0.18em] text-gray-500">
            Weight
          </span>
          <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
            <div
              className="absolute inset-y-0 left-0 rounded-full"
              style={{
                // Normalize against the registry's lightest/heaviest game so
                // the bar uses its full range across the catalog.
                width: `${normalizeWeight(bgg.averageWeight)}%`,
                backgroundColor: "var(--accent)",
              }}
            />
          </div>
          <span className="shrink-0 font-semibold text-gray-200 tabular-nums">
            {bgg.averageWeight.toFixed(1)}
          </span>
          <span className="shrink-0 text-[10px] uppercase tracking-[0.14em] text-gray-500">
            {weightLabel(bgg.averageWeight)}
          </span>
        </div>
      )}
    </div>
  );
}

function normalizeWeight(w: number): number {
  const { min, max } = weightStats;
  if (max <= min) return 50; // degenerate single-weight catalog
  const ratio = (w - min) / (max - min);
  return Math.max(0, Math.min(100, ratio * 100));
}
