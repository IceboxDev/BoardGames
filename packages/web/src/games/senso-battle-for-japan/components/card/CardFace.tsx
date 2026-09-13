import { isNinja, rankOf, suitOf } from "@boardgames/core/games/senso-battle-for-japan/deck";
import type { CardId, NinjaId } from "@boardgames/core/games/senso-battle-for-japan/types";
import { memo } from "react";
import { cn } from "../../../../lib/cn";
import { CLAN_FILL, CLAN_INDEX_INK, NINJA_FILL, NINJA_WASH } from "../../colors";
import { rankGlyph } from "../../logic/cards";
import { crestArt } from "./card-art";
import { type Box, boxStyle, cardKind, cq, DETAIL, type SensoCardSize } from "./card-layout";
import ArtLayer from "./layers/ArtLayer";
import Body from "./layers/Body";
import CornerIndex from "./layers/CornerIndex";
import { CrestFallback } from "./layers/fallbacks";
import { Frame, Paper } from "./layers/Paper";
import Ribbon from "./layers/Ribbon";
import TrumpSeal from "./layers/TrumpSeal";

interface Props {
  card: CardId;
  size: SensoCardSize;
  /** The advantage row's clan card: crest and ribbon, no rank. */
  clanOnly?: boolean;
  /** This card's clan holds the advantage. */
  trump?: boolean;
}

/**
 * The composed face: paper, the clan's rule, the body (pips, a figure, the
 * Ace, a Ninja or one crest), the hanging ribbon, the corner indices and the
 * advantage seal — all on the 400×600 grid, sized by the card's width via
 * container units, so the same drawing serves the fan, the table and the
 * advantage row. No chrome and no role: `SensoCard` owns those.
 */
function CardFace({ card, size, clanOnly = false, trump = false }: Props) {
  const detail = DETAIL[size];
  const ninja = isNinja(card);
  const clan = suitOf(card);
  const rank = rankOf(card);
  const glyph = rankGlyph(card);
  const kind = cardKind(card, clanOnly, detail.body);
  const ink = ninja ? NINJA_FILL[card as NinjaId] : clan ? CLAN_INDEX_INK[clan] : "#000";
  const rule = ninja ? NINJA_FILL[card as NinjaId] : clan ? CLAN_FILL[clan] : "#000";
  const showIndex = !clanOnly;
  const mark = (box: Box) =>
    ninja ? (
      <span
        className="absolute flex items-center justify-center font-bold leading-none"
        style={{ ...boxStyle(box), fontSize: cq(box.w * 0.62), color: ink }}
      >
        {card === "ninja-jade" ? "玉" : "木"}
      </span>
    ) : clan ? (
      <ArtLayer
        name={crestArt(clan, true)}
        box={box}
        layer="index-crest"
        fallback={<CrestFallback clan={clan} units={box.w} />}
      />
    ) : null;

  return (
    <div
      data-face={card}
      className={cn(
        "senso-kanji pointer-events-none absolute inset-0 @container isolate select-none",
      )}
    >
      <Paper grain={detail.grain} wash={ninja ? NINJA_WASH[card as NinjaId] : undefined} />
      <Frame color={rule} outlined={clan === "mori"} ornaments={detail.ornaments} />
      <Body
        card={card}
        kind={kind}
        clan={clan}
        rank={rank}
        glyph={glyph}
        detail={detail.index}
        bare={!detail.ribbon}
      />
      {detail.ribbon && <Ribbon clan={clan} ninja={ninja ? (card as NinjaId) : undefined} />}
      {showIndex && (
        <CornerIndex
          detail={detail.index}
          glyph={glyph}
          color={ink}
          mark={mark}
          trump={trump}
          backing={ninja}
        />
      )}
      {showIndex && detail.mirroredIndex && (
        <CornerIndex
          detail={detail.index}
          glyph={glyph}
          color={ink}
          mark={mark}
          trump={trump}
          mirrored
          backing={ninja}
        />
      )}
      {trump && !clanOnly && <TrumpSeal />}
    </div>
  );
}

export default memo(CardFace);
