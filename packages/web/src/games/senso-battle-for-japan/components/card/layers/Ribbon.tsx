import type { Clan } from "@boardgames/core/games/senso-battle-for-japan/types";
import { CLAN_KANJI } from "@boardgames/core/games/senso-battle-for-japan/types";
import { CARD_INK, CARD_PAPER_DARK, CLAN_FILL, NINJA_FILL } from "../../../colors";
import type { ArtName } from "../card-art";
import { boxStyle, cq, RIBBON } from "../card-layout";
import ArtLayer from "./ArtLayer";
import { KanjiFallback } from "./fallbacks";

/**
 * The tanzaku — a strip of darker paper hung over the top edge with the
 * clan's name brushed down it, capped in the clan colour (a Ninja's in its
 * own pigment).
 */
export default function Ribbon({
  clan,
  ninja,
}: {
  clan: Clan | null;
  ninja?: "ninja-wood" | "ninja-jade";
}) {
  const cap = clan ? CLAN_FILL[clan] : ninja ? NINJA_FILL[ninja] : CARD_INK;
  const kanji: ArtName = clan ? (`kanji-${clan}` as ArtName) : "kanji-ninja";
  return (
    <div data-layer="ribbon" className="pointer-events-none absolute inset-0">
      <div
        className="absolute rounded-b-card-md"
        style={{
          ...boxStyle(RIBBON.box),
          boxSizing: "border-box",
          background: CARD_PAPER_DARK,
          borderLeft: `${cq(RIBBON.border)} solid ${CARD_INK}`,
          borderRight: `${cq(RIBBON.border)} solid ${CARD_INK}`,
          borderBottom: `${cq(RIBBON.border)} solid ${CARD_INK}`,
        }}
      />
      <div className="absolute" style={{ ...boxStyle(RIBBON.cap), background: cap }} />
      <ArtLayer
        name={kanji}
        box={RIBBON.kanji}
        layer="ribbon-kanji"
        fallback={<KanjiFallback text={clan ? CLAN_KANJI[clan] : "忍"} units={34} />}
      />
    </div>
  );
}
