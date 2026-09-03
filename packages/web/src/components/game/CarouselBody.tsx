import type { BggGame, GameDescriptions } from "../../games/types";
import { playerRange, playTime } from "../../lib/bgg-format";
import { BggInline } from "./BggInline";
import { planDescription } from "./carousel-description";

// Pixel-height body block for carousel cards. Renders the accent line,
// title, meta line (player range + best-at + playtime), BggInline, and a
// description sized by `planDescription` — the font scales with the card
// and the variant (tight/default/loose) is the longest that fits the slot.
// Single source of truth — shared by `GameCarousel3D`'s single-game cards
// and `FamilyCarouselCard`.

type Props = {
  bodyHeight: number;
  /** Card width — drives the description's font scale + variant choice. */
  cardW: number;
  title: string;
  bgg: BggGame;
  /** When set, prefixes the player range with the amber "best at N" hint. */
  bestForHeadcount: number | null;
  /** All three length variants — `planDescription` picks the one that fits. */
  descriptions?: GameDescriptions;
  /** Compact mode for very narrow cards: drop description + complexity bar. */
  compact: boolean;
};

export function CarouselBody({
  bodyHeight,
  cardW,
  title,
  bgg,
  bestForHeadcount,
  descriptions,
  compact,
}: Props) {
  // Type scale + variant + whole-line clamp for the slot below the fixed
  // rows. The clamp is what keeps the flex column from over-filling —
  // critical because an over-full flex column shrinks exactly its
  // overflow-hidden children, which is how phone-width cards used to slice
  // off the title's bottom half and cut the description mid-line. The fixed
  // rows are additionally `shrink-0` so no budget miss can ever squeeze
  // them.
  const plan = planDescription({ cardW, bodyHeight, compact, title, descriptions });
  return (
    // `overflow-hidden` so an over-budget body can never spill past the card's
    // rounded clip edge with a mid-line text cut — the clamps below make that
    // rare, this makes it impossible.
    <div
      className={`flex flex-col overflow-hidden ${compact ? "gap-1.5 px-3 py-3" : "gap-2.5 px-5 py-4"}`}
      style={{ height: bodyHeight }}
    >
      {/* One standard color for every game — the per-game accent here made
          the line compete with the difficulty-colored complexity bar. */}
      <span className="block h-0.5 w-12 shrink-0 rounded-full bg-accent-400" aria-hidden="true" />
      {/* Compact titles are FITTED to one line (the plan shrinks the font to
          the title's length); the 2-line clamp only catches titles too long
          for even the floor size. Full-size cards keep the single-line
          truncate, with the size growing alongside the description on
          larger-than-reference cards. */}
      <h3
        className={`shrink-0 font-bold leading-tight text-white ${
          compact ? "line-clamp-2" : "truncate"
        }`}
        style={{ fontSize: plan.titleFontPx }}
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

      {plan.text != null && (
        // The line-clamp class supplies the -webkit-box scaffolding; count,
        // font and leading come from the plan (inline overrides), so
        // truncation always lands on a whole-line ellipsis and the text
        // grows with the card instead of drowning in it.
        <p
          className="line-clamp-7 text-fg-secondary"
          style={{
            WebkitLineClamp: plan.maxLines,
            fontSize: plan.fontPx,
            lineHeight: `${plan.lineHeightPx}px`,
          }}
        >
          {plan.text}
        </p>
      )}
    </div>
  );
}
