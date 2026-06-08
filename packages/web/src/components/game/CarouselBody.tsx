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

export function CarouselBody({
  bodyHeight,
  accentHex,
  title,
  bgg,
  bestForHeadcount,
  description,
  compact,
}: Props) {
  return (
    <div
      className={`flex flex-col ${compact ? "gap-1.5 px-3 py-3" : "gap-2.5 px-5 py-4"}`}
      style={{ height: bodyHeight }}
    >
      <span
        className="block h-0.5 w-12 rounded-full"
        style={{ backgroundColor: accentHex }}
        aria-hidden="true"
      />
      <h3
        className={`truncate font-bold leading-tight text-white ${compact ? "text-lg" : "text-xl"}`}
      >
        {title}
      </h3>
      <p className="text-3xs uppercase tracking-[0.18em] text-fg-secondary sm:text-2xs xl:text-xs">
        <span className={bestForHeadcount !== null ? "text-amber-300" : undefined}>
          {playerRange(bgg)}
          {bestForHeadcount !== null && ` · best at ${bestForHeadcount}`}
        </span>
        {" · "}
        {playTime(bgg)}
      </p>

      <BggInline bgg={bgg} compact={compact} />

      {!compact && description && (
        // Pinned layout: line-clamp-7 is the deterministic truncation
        // boundary across every viewport. Font sizes still scale with
        // breakpoint for readability on big screens, but `leading-snug` is
        // pinned so line-height stays predictable, and `flex-1` /
        // `overflow-hidden` are dropped — `line-clamp-7` handles both
        // height-capping and overflow itself. The generated `default`
        // variant is char-budgeted (~240 chars) to fit within 7 lines
        // even at the smallest cardW + biggest text combination.
        <p className="line-clamp-7 text-3xs leading-snug text-fg-secondary sm:text-2xs xl:text-xs 3xl:text-sm">
          {stripBggHtml(description)}
        </p>
      )}
    </div>
  );
}
