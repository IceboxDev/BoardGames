import { GOLD_LEAF } from "../../colors";
import { BACK, boxStyle, cq, type SensoCardSize } from "./card-layout";
import ArtLayer, { TileLayer } from "./layers/ArtLayer";
import { EmblemFallback } from "./layers/fallbacks";

/**
 * The lacquer back: the seigaiha in gold, a gold hairline, the 戦 roundel.
 * The pattern is dropped at `mini` — at 10 px it only moirés.
 */
export default function CardBack({ size }: { size: SensoCardSize }) {
  return (
    <div data-back="" className="pointer-events-none absolute inset-0 @container select-none">
      {size !== "mini" && <TileLayer name="back-pattern" opacity={0.35} />}
      <div
        aria-hidden="true"
        className="absolute rounded-card-lg"
        style={{
          ...boxStyle(BACK.frame.box),
          boxSizing: "border-box",
          border: `${cq(BACK.frame.width)} solid ${GOLD_LEAF}`,
          opacity: 0.7,
        }}
      />
      <ArtLayer name="back-emblem" box={BACK.emblem} layer="emblem" fallback={<EmblemFallback />} />
    </div>
  );
}
