import type { FamilyInfo } from "../../games/families";
import type { GameDefinition } from "../../games/types";
import { fitsLabel, fitsRange } from "../../lib/bgg-format";
import type { ReactionAggregate } from "../../lib/calendar-games";
import {
  BestForHeadcountBadge,
  CarouselBody,
  CarouselCardChrome,
  CarouselThumb,
  FitsBadge,
  VariantsBadge,
} from "../game";
import GameReactions from "./GameReactions";

/**
 * Carousel card that stands in for an entire game family. The center card
 * shows variant chips to swap which member is "active" (drives thumbnail,
 * title, BGG meta, fits-badge, and the reactions slug). Off-center cards
 * just show the active member's thumbnail and a "+N variants" hint,
 * keeping coverflow performance the same as a single-game card.
 *
 * Voting/reactions remain per-slug — switching to UNO Flip and hyping
 * commits the hype to "uno-flip", not to the family.
 */
type Props = {
  family: FamilyInfo;
  visibleMembers: GameDefinition[];
  /**
   * Current active member's slug, owned by the parent so it persists
   * across center changes. The parent also owns the picker that mutates
   * it (the lifted variant chip strip rendered by `GameCarousel3D`).
   */
  activeSlug: string;

  offset: number;
  minPlayers: number;
  maxPlayers: number;
  date: string;
  reactions: Record<string, ReactionAggregate>;
  onClick: () => void;

  cardW: number;
  cardH: number;
  spreadMax: number;
  zMax: number;
  compact: boolean;
  /** Pixel thumb / body heights — caller derived from cardH × ratio. */
  thumbHeight: number;
  bodyHeight: number;
};

export default function FamilyCarouselCard({
  family,
  visibleMembers,
  activeSlug,
  offset,
  minPlayers,
  maxPlayers,
  date,
  reactions,
  onClick,
  cardW,
  cardH,
  spreadMax,
  zMax,
  compact,
  thumbHeight,
  bodyHeight,
}: Props) {
  const absOff = Math.abs(offset);
  const hidden = absOff > 5;
  const isCenter = offset === 0;

  const active =
    visibleMembers.find((m) => m.slug === activeSlug) ?? visibleMembers[0] ?? family.canonical;
  const fits = fitsRange(active, minPlayers, maxPlayers);
  const isBestForHeadcount =
    active.bgg.bestPlayerCount !== null &&
    minPlayers > 0 &&
    active.bgg.bestPlayerCount === minPlayers;
  const aggregate = reactions[active.slug];

  return (
    <CarouselCardChrome
      cardW={cardW}
      cardH={cardH}
      offset={offset}
      hidden={hidden}
      isCenter={isCenter}
      accentHex={active.accentHex}
      isBestForHeadcount={isBestForHeadcount}
      ariaLabel={
        isCenter
          ? `${active.title} (${family.displayName} family), current selection`
          : `Show ${family.displayName}`
      }
      onClick={onClick}
      spreadMax={spreadMax}
      zMax={zMax}
    >
      <CarouselThumb
        src={active.thumbnail}
        thumbHeight={thumbHeight}
        accentHex={active.accentHex}
        isCenter={isCenter}
        badgeTopRight={
          <VariantsBadge
            count={visibleMembers.length}
            accentHex={family.canonical.accentHex}
            tight
          />
        }
        badgeTopLeft={
          isBestForHeadcount ? (
            <BestForHeadcountBadge count={minPlayers} />
          ) : fits && (minPlayers > 0 || maxPlayers > 0) ? (
            <FitsBadge label={fitsLabel(minPlayers, maxPlayers)} />
          ) : undefined
        }
        overlay={
          date ? (
            <GameReactions
              date={date}
              slug={active.slug}
              accentHex={active.accentHex}
              aggregate={aggregate ?? { hype: 0, teach: 0, learn: 0, viewer: [] }}
              size={compact ? "sm" : "md"}
              disabled={!isCenter}
              hideCount
            />
          ) : undefined
        }
      />
      <CarouselBody
        bodyHeight={bodyHeight}
        accentHex={active.accentHex}
        title={active.title}
        bgg={active.bgg}
        bestForHeadcount={isBestForHeadcount ? minPlayers : null}
        description={active.descriptions.default}
        compact={compact}
      />

      {/* Variant chip strips live OUTSIDE this card — `GameCarousel3D`
          renders one shadow motion.div per family unit at the carousel
          root level (outside the fade mask) and mirrors this card's
          transforms so the chips visually attach to the card while
          staying unmasked. Don't render an in-card copy here or the two
          would overdraw on every card. */}
    </CarouselCardChrome>
  );
}
