import { CARD_HAIRLINE, CARD_INK } from "../../../colors";
import { boxStyle, cq, FRAME, ORNAMENT } from "../card-layout";
import ArtLayer, { TileLayer } from "./ArtLayer";

/** The washi grain over the paper fill, and a tint for cards without a clan. */
export function Paper({ grain, wash }: { grain: boolean; wash?: string }) {
  return (
    <>
      {wash && (
        <div
          aria-hidden="true"
          data-layer="wash"
          className="absolute inset-0"
          style={{ background: wash }}
        />
      )}
      {grain && <TileLayer name="paper-grain" opacity={0.35} blend="multiply" />}
    </>
  );
}

/**
 * The clan-coloured rule and the ink hairline inside it. Mōri prints in
 * white, so its rule gets an ink edge of its own to stay visible on paper.
 */
export function Frame({
  color,
  outlined = false,
  ornaments = false,
}: {
  color: string;
  outlined?: boolean;
  /** The ink cloud-scroll in the four corners, under everything else. */
  ornaments?: boolean;
}) {
  return (
    <>
      {ornaments &&
        ORNAMENT.corners.map(({ key, box, transform }) => (
          <ArtLayer
            key={key}
            name="corner-ornament"
            box={box}
            layer="ornament"
            fallback={null}
            style={{ transform, opacity: ORNAMENT.opacity }}
          />
        ))}
      <div
        aria-hidden="true"
        data-layer="frame"
        className="absolute rounded-card-lg"
        style={{
          ...boxStyle(FRAME.rule.box),
          boxSizing: "border-box",
          border: `${cq(FRAME.rule.width)} solid ${color}`,
          boxShadow: outlined
            ? `0 0 0 ${cq(1.5)} ${CARD_INK}, inset 0 0 0 ${cq(1.5)} ${CARD_INK}`
            : undefined,
        }}
      />
      <div
        aria-hidden="true"
        className="absolute rounded-card-md"
        style={{
          ...boxStyle(FRAME.hairline.box),
          boxSizing: "border-box",
          border: `${cq(FRAME.hairline.width)} solid ${CARD_HAIRLINE}`,
        }}
      />
    </>
  );
}
