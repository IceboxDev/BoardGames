import type { CardId, Clan, NinjaId } from "@boardgames/core/games/senso-battle-for-japan/types";
import { type ArtName, COURT_NAMES, crestArt } from "../card-art";
import { BODY, type CardKind, type IndexDetail, NINJA_FIGURE, pipRects } from "../card-layout";
import ArtLayer from "./ArtLayer";
import { CourtFallback, CrestFallback, HaloFallback, NinjaFallback } from "./fallbacks";

interface Props {
  card: CardId;
  kind: CardKind;
  clan: Clan | null;
  rank: number;
  glyph: string;
  detail: IndexDetail;
  /** No ribbon on the card, so the lone crest may use the whole width. */
  bare: boolean;
}

/** What fills the middle of the card: pips, a figure, the Ace, a Ninja, or one crest. */
export default function Body({ card, kind, clan, rank, glyph, detail, bare }: Props) {
  const spec = BODY[detail];
  if (kind === "ninja") {
    return (
      <ArtLayer
        name={card as NinjaId}
        box={NINJA_FIGURE}
        layer="ninja"
        anchor="bottom"
        fallback={<NinjaFallback card={card as NinjaId} />}
      />
    );
  }
  if (!clan) return null;
  switch (kind) {
    case "pips":
      return (
        <>
          {pipRects(rank, detail).map((r, i) => (
            <ArtLayer
              // biome-ignore lint/suspicious/noArrayIndexKey: the layout is static per rank
              key={i}
              name={crestArt(clan, true)}
              box={r}
              flip={r.flip}
              layer="pip"
              pip
              fallback={<CrestFallback clan={clan} units={r.w} />}
            />
          ))}
        </>
      );
    case "court":
      return (
        <ArtLayer
          name={`court-${clan}-${COURT_NAMES[rank as 11 | 12 | 13]}` as ArtName}
          box={spec.court}
          layer="court"
          anchor="bottom"
          fallback={<CourtFallback clan={clan} glyph={glyph} />}
        />
      );
    case "ace":
      return (
        <>
          <ArtLayer name="ace-halo" box={spec.aceHalo} layer="halo" fallback={<HaloFallback />} />
          <ArtLayer
            name={crestArt(clan)}
            box={spec.aceCrest}
            layer="ace-crest"
            fallback={<CrestFallback clan={clan} units={spec.aceCrest.w} />}
          />
        </>
      );
    case "crest": {
      const box = bare ? spec.crestBare : spec.crest;
      return (
        <ArtLayer
          name={crestArt(clan)}
          box={box}
          layer="crest"
          fallback={<CrestFallback clan={clan} units={box.w} />}
        />
      );
    }
  }
}
