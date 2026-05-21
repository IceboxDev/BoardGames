import type { BggGame } from "../../games/types";
import { formatCount, weightLabel } from "../../lib/bgg-format";
import { StarIcon } from "../icons";

// Full catalog-card footer: rating row (star + value) over a complexity
// row (label + bar + numeric + bucket). Sits at the bottom of `GameCard`
// and `OnlineFamilyCard`. The compact `BggInline` variant (smaller, used
// inside carousel cards) lives in `BggInline.tsx` next to this file.
//
// The complexity bar here uses the raw 1..5 weight scale rather than
// `normalizeWeight` because catalog cards have enough width to read the
// real value; the carousel card's `BggInline` uses the normalized form
// because its narrower bar otherwise compresses the visible range.

export function BggMeta({ bgg }: { bgg: BggGame }) {
  const hasRating = bgg.averageRating !== null;
  const hasWeight = bgg.averageWeight !== null && bgg.averageWeight > 0;
  if (!hasRating && !hasWeight) return null;

  return (
    <div className="mt-3 flex flex-col gap-2 border-t border-white/[0.05] pt-3 text-[11px] text-gray-400">
      {hasRating && bgg.averageRating !== null && (
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-1.5">
            <StarIcon className="h-3.5 w-3.5 text-amber-400" />
            <span className="font-semibold text-gray-200">{bgg.averageRating.toFixed(1)}</span>
            <span className="text-gray-500">/ 10</span>
          </span>
          {bgg.numRatings ? (
            <span className="text-[10px] text-gray-500">{formatCount(bgg.numRatings)} ratings</span>
          ) : null}
        </div>
      )}
      {hasWeight && bgg.averageWeight !== null && (
        <div className="flex items-center gap-2">
          <span className="shrink-0 text-[10px] uppercase tracking-[0.18em] text-gray-500">
            Complexity
          </span>
          <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-[var(--accent)] transition-[width] duration-500"
              style={{ width: `${Math.min(100, (bgg.averageWeight / 5) * 100)}%` }}
            />
          </div>
          <span className="shrink-0 font-semibold text-gray-200 tabular-nums">
            {bgg.averageWeight.toFixed(1)}
          </span>
          <span className="shrink-0 text-[10px] uppercase tracking-[0.18em] text-gray-500">
            {weightLabel(bgg.averageWeight)}
          </span>
        </div>
      )}
    </div>
  );
}
