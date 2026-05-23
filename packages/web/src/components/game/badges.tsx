import { CheckIcon, FlameIcon, StackIcon, StarIcon } from "../icons";

// Pill-style badges placed inside the `badgeTopLeft` / `badgeTopRight`
// slots of `GameCardThumb` or `CarouselCardChrome`. All share the same
// rounded-full + backdrop-blur + uppercase + tracking-wider treatment so
// the surface chrome reads identically across catalog and carousel cards.

const BADGE_BASE =
  "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] backdrop-blur-sm";

const BADGE_BASE_TIGHT =
  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] backdrop-blur-sm";

/**
 * "+N variants" / "{N} variants" stack pill. Used by every family card
 * (catalog grid, online catalog, offline carousel). The accent color
 * paints only the text (icon + label) — the pill itself stays neutral so
 * it reads consistently against any thumbnail.
 *
 * `mode="plus"` renders "+(N-1) variants" (FamilyCard's stacked look —
 * implies the canonical is the visible card on top, N-1 are behind).
 * `mode="count"` renders "N variants" (OnlineFamilyCard / carousel —
 * implies the total membership of the family).
 */
export function VariantsBadge({
  count,
  accentHex,
  mode = "count",
  tight = false,
}: {
  count: number;
  accentHex: string;
  mode?: "plus" | "count";
  tight?: boolean;
}) {
  const label = mode === "plus" ? `+${count - 1} variants` : `${count} variants`;
  return (
    <span
      className={`${tight ? BADGE_BASE_TIGHT : BADGE_BASE} bg-black/65`}
      style={{ color: accentHex }}
    >
      <StackIcon />
      {label}
    </span>
  );
}

/**
 * "Coming soon" pill placed top-left of the thumbnail for catalog-only
 * games (no playable component yet). Visually identical to the family
 * badge but with reduced contrast since it's a passive indicator.
 */
export function ComingSoonBadge() {
  return (
    <span
      className={`${BADGE_BASE_TIGHT} bg-black/65 text-white/75`}
      style={{ letterSpacing: "0.2em" }}
    >
      Coming soon
    </span>
  );
}

/** "2008" year pill, top-right of carousel cards. */
export function YearBadge({ year }: { year: number | string }) {
  return (
    <span className="inline-flex items-center rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-semibold text-white/85 backdrop-blur-sm">
      {year}
    </span>
  );
}

/**
 * "Fits N" / "Fits 3–5" emerald pill — surfaced by carousel cards when the
 * game's player count overlaps with the planned game night.
 */
export function FitsBadge({ label }: { label: string }) {
  return (
    <span
      className={`${BADGE_BASE_TIGHT} bg-emerald-500/30 text-emerald-100`}
      style={{ letterSpacing: "0.15em" }}
    >
      <CheckIcon className="h-3 w-3" />
      Fits {label}
    </span>
  );
}

/**
 * "New" cyan→blue gradient pill — surfaced by carousel cards for
 * freshly-added games (catalog `isNew`). Takes precedence over the
 * "Best at N" badge, matching the card's cyan-fiery-blue border.
 */
export function NewBadge() {
  return (
    <span
      className={`${BADGE_BASE_TIGHT} bg-gradient-to-r from-cyan-400 to-blue-600 text-white shadow-md shadow-cyan-500/50`}
      style={{ letterSpacing: "0.18em" }}
    >
      <StarIcon className="h-3 w-3" />
      New
    </span>
  );
}

/**
 * "Best at N" amber/orange gradient pill — surfaced by carousel cards
 * when the game's BGG community-best player count exactly matches the
 * confirmed headcount of the planned game night.
 */
export function BestForHeadcountBadge({ count }: { count: number }) {
  return (
    <span
      className={`${BADGE_BASE_TIGHT} bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-md shadow-amber-500/40`}
      style={{ letterSpacing: "0.15em" }}
    >
      <FlameIcon className="h-3 w-3" />
      Best at {count}
    </span>
  );
}
