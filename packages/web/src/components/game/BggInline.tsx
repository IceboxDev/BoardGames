import type { BggGame } from "../../games/types";
import { formatCount, weightBarWidth, weightColor, weightLabel } from "../../lib/bgg-format";
import { StarIcon } from "../icons";
import { ProgressBar } from "../ui/ProgressBar";

// Compact rating + complexity strip used inside carousel cards. Renders
// tighter than `BggMeta` (no top border, no extra padding) and uses the
// `normalizeWeight` formatter so the narrow bar uses its full visible
// range across the catalog instead of compressing 1..5 into the leftmost
// 20% of the bar.
//
// `compact` further drops the complexity row entirely; carousel cards in
// their `compact` size (tiny phones) keep only the rating row to preserve
// vertical space for the description line-clamp.

export function BggInline({ bgg, compact }: { bgg: BggGame; compact: boolean }) {
  const hasRating = bgg.averageRating !== null;
  const hasWeight = !compact && bgg.averageWeight !== null && bgg.averageWeight > 0;
  if (!hasRating && !hasWeight) return null;

  return (
    <div className="flex shrink-0 flex-col gap-1.5 border-y border-line-soft py-2 text-2xs text-fg-secondary">
      {hasRating && bgg.averageRating !== null && (
        <div className="flex items-center gap-2">
          <StarIcon className="h-3.5 w-3.5 text-amber-400" />
          <span className="font-semibold text-fg-primary tabular-nums">
            {bgg.averageRating.toFixed(1)}
          </span>
          <span className="text-fg-muted">/ 10</span>
          {bgg.numRatings ? (
            <span className="ml-auto text-3xs text-fg-muted">
              {formatCount(bgg.numRatings)} ratings
            </span>
          ) : null}
        </div>
      )}
      {hasWeight && bgg.averageWeight !== null && (
        <div className="flex items-center gap-2">
          <span className="shrink-0 text-3xs uppercase tracking-pill text-fg-muted">Weight</span>
          {/* Color = difficulty (green→red across the catalog's range),
              not the game's accent — the accent made the bar misleading. */}
          <ProgressBar
            className="flex-1"
            label="Weight"
            value={weightBarWidth(bgg.averageWeight) / 100}
            color={weightColor(bgg.averageWeight)}
            animate={false}
          />
          <span className="shrink-0 font-semibold text-fg-primary tabular-nums">
            {bgg.averageWeight.toFixed(1)}
          </span>
          <span className="shrink-0 text-3xs uppercase tracking-label text-fg-muted">
            {weightLabel(bgg.averageWeight)}
          </span>
        </div>
      )}
    </div>
  );
}
