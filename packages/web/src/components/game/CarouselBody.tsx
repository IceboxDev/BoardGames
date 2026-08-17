import type { BggGame } from "../../games/types";
import { playerRange, playTime, stripBggHtml } from "../../lib/bgg-format";
import { BggInline } from "./BggInline";

// Pixel-height body block for carousel cards. Renders the accent line,
// title, meta line (player range + best-at + playtime), BggInline, and an
// optional description with line-clamp-7. Single source of truth — shared
// by `GameCarousel3D`'s single-game cards and `FamilyCarouselCard`.

type Props = {
  bodyHeight: number;
  accentHex: string;
  title: string;
  bgg: BggGame;
  /** When set, prefixes the player range with the amber "best at N" hint. */
  bestForHeadcount: number | null;
  /** Pre-cleaned description text (caller picks the variant). */
  description?: string;
  /** Compact mode for very narrow cards: drop description + complexity bar. */
  compact: boolean;
};

// Px budget of everything above the description (paddings, gaps, accent
// line, title, meta, BggInline), measured at the largest pre-3xl font tier
// so the derived line count is safe at every breakpoint. 3xl's taller
// description lines are covered by slack: 3xl only renders on MAX-width
// cards whose body has ~200px to spare.
const FIXED_STACK_PX = { full: 175, compact: 135 };
const DESC_LINE_PX = 16;

export function CarouselBody({
  bodyHeight,
  accentHex,
  title,
  bgg,
  bestForHeadcount,
  description,
  compact,
}: Props) {
  // Clamp the description to the whole lines that actually fit the body's
  // fixed height. This is what keeps the flex column from over-filling —
  // critical because an over-full flex column shrinks exactly its
  // overflow-hidden children (the truncated title, the clamped
  // description), which is how phone-width cards used to slice off the
  // title's bottom half and cut the description mid-line. The fixed rows
  // below are additionally `shrink-0` so no future budget miss can ever
  // squeeze them again.
  const descLines = Math.min(
    compact ? 3 : 7,
    Math.floor((bodyHeight - FIXED_STACK_PX[compact ? "compact" : "full"]) / DESC_LINE_PX),
  );
  return (
    // `overflow-hidden` so an over-budget body can never spill past the card's
    // rounded clip edge with a mid-line text cut — the clamps below make that
    // rare, this makes it impossible.
    <div
      className={`flex flex-col overflow-hidden ${compact ? "gap-1.5 px-3 py-3" : "gap-2.5 px-5 py-4"}`}
      style={{ height: bodyHeight }}
    >
      <span
        className="block h-0.5 w-12 shrink-0 rounded-full"
        style={{ backgroundColor: accentHex }}
        aria-hidden="true"
      />
      <h3
        className={`shrink-0 truncate font-bold leading-tight text-white ${compact ? "text-lg" : "text-xl"}`}
      >
        {title}
      </h3>
      <p className="shrink-0 text-3xs uppercase tracking-pill text-fg-secondary sm:text-2xs xl:text-xs">
        <span className={bestForHeadcount !== null ? "text-amber-300" : undefined}>
          {playerRange(bgg)}
          {bestForHeadcount !== null && ` · best at ${bestForHeadcount}`}
        </span>
        {" · "}
        {playTime(bgg)}
      </p>

      <BggInline bgg={bgg} compact={compact} />

      {description && descLines >= 2 && (
        // The line-clamp class supplies the -webkit-box scaffolding; the
        // actual line count is the height-derived `descLines` (inline
        // override), so truncation always lands on a whole-line ellipsis.
        // Font sizes still scale with breakpoint for readability on big
        // screens, but `leading-snug` is pinned so line-height stays
        // predictable. On a full-size (380px+) card this resolves to the
        // original 7-line budget; phone-width cards get the 3–5 lines
        // they truly have room for.
        <p
          className="line-clamp-7 text-3xs leading-snug text-fg-secondary sm:text-2xs xl:text-xs 3xl:text-sm"
          style={{ WebkitLineClamp: descLines }}
        >
          {stripBggHtml(description)}
        </p>
      )}
    </div>
  );
}
