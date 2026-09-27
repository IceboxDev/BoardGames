import { cardDef } from "@boardgames/core/games/the-hunger/content/cards";
import type { CardDef } from "@boardgames/core/games/the-hunger/types";
import outfit from "../../../../lib/theme/fonts/outfit";
import { cardArtUrl, cardBackdropUrl } from "../../logic/art";
import HungerIcon from "../HungerIcon";
import { artBox, artShape, boxStyle, cq, type Face, FIGURE_FADE_FROM } from "./layout";
import { cardHex, GLASS, speedText } from "./style";

// The card faces set their names and numbers in Outfit; load it with the game.
if (!import.meta.env.TEST) void outfit.load();

/**
 * The full-bleed art: the kind's backdrop over the whole card, the figure
 * centred with room around it, dissolving into the scrim at its foot, and the
 * scrim itself rising from the bottom edge.
 */
export function CardArt({
  card,
  face,
  scrimFrom,
  dim = false,
}: {
  card: string;
  face: Face;
  /** Where the scrim starts, as a share of the card's height from the top. */
  scrimFrom: number;
  dim?: boolean;
}) {
  const def = cardDef(card);
  const art = cardArtUrl(card);
  const backdrop = cardBackdropUrl(card);
  const hex = cardHex(def);
  const shape = artShape(def);
  const fade = `linear-gradient(to bottom, black ${FIGURE_FADE_FROM * 100}%, transparent 100%)`;
  return (
    <>
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background: backdrop
            ? `url(${backdrop}) center / cover`
            : `radial-gradient(ellipse at 50% 35%, ${hex}55, #0b0710 75%)`,
          opacity: dim ? 0.5 : 0.9,
        }}
      />
      {/* A soft pool of the card's colour behind the figure. */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background: `radial-gradient(ellipse 60% 45% at 50% 38%, ${hex}33, transparent 70%)`,
        }}
      />
      {art && (
        <img
          src={art}
          alt=""
          aria-hidden
          draggable={false}
          loading="lazy"
          className="select-none object-contain object-bottom"
          style={{
            ...boxStyle(artBox(face, shape)),
            maskImage: shape === "figure" ? fade : undefined,
            WebkitMaskImage: shape === "figure" ? fade : undefined,
            filter: `drop-shadow(0 ${cq(1.2)} ${cq(2.5)} rgb(0 0 0 / 0.55))${dim ? " grayscale(0.6) brightness(0.7)" : ""}`,
          }}
        />
      )}
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0"
        style={{
          top: `${scrimFrom * 100}%`,
          background:
            "linear-gradient(to bottom, rgb(11 7 16 / 0) 0%, rgb(11 7 16 / 0.78) 38%, rgb(11 7 16 / 0.96) 100%)",
        }}
      />
    </>
  );
}

/** Speed: a frosted pill with the bat wing and the value. */
export function SpeedChip({
  def,
  scale,
  caption = false,
}: {
  def: CardDef;
  scale: number;
  caption?: boolean;
}) {
  return (
    <span
      className="absolute flex flex-col items-center font-card leading-none"
      style={{ left: cq(4 * scale), top: cq(4 * scale), gap: cq(0.6 * scale) }}
      title={`Speed ${speedText(def)}`}
    >
      <span
        className="flex items-center rounded-full"
        style={{ ...GLASS, gap: cq(1.2 * scale), padding: `${cq(1.4 * scale)} ${cq(2.6 * scale)}` }}
      >
        <HungerIcon
          name="icon-speed"
          style={{
            width: cq(5.5 * scale),
            height: cq(5.5 * scale),
            color: "rgb(255 255 255 / 0.8)",
          }}
        />
        <span
          className="font-semibold tabular-nums text-white"
          style={{ fontSize: cq(6.4 * scale) }}
        >
          {speedText(def)}
        </span>
      </span>
      {caption && (
        <span
          className="font-semibold uppercase text-white/60"
          style={{ fontSize: cq(2.4 * scale), letterSpacing: "0.18em" }}
        >
          Speed
        </span>
      )}
    </span>
  );
}

/** VP: the blood drop with its value inside. */
export function VpDrop({
  def,
  scale,
  caption = false,
}: {
  def: CardDef;
  scale: number;
  caption?: boolean;
}) {
  if (def.vp <= 0) return null;
  return (
    <span
      className="absolute flex flex-col items-center font-card leading-none"
      style={{ right: cq(4 * scale), top: cq(3 * scale), gap: cq(0.4 * scale) }}
      title={`${def.vp} VP`}
    >
      <span
        className="relative flex items-end justify-center"
        style={{ width: cq(10 * scale), height: cq(13.5 * scale) }}
      >
        <HungerIcon
          name="icon-vp"
          className="absolute inset-0"
          style={{
            width: "100%",
            height: "100%",
            filter: "drop-shadow(0 2px 4px rgb(0 0 0 / 0.6))",
          }}
        />
        <span
          className="relative font-semibold tabular-nums text-white"
          style={{
            fontSize: cq(6.2 * scale),
            marginBottom: cq(2.2 * scale),
            textShadow: "0 1px 2px rgb(0 0 0 / 0.6)",
          }}
        >
          {def.vp}
        </span>
      </span>
      {caption && (
        <span
          className="font-semibold uppercase text-white/60"
          style={{ fontSize: cq(2.4 * scale), letterSpacing: "0.18em" }}
        >
          VP
        </span>
      )}
    </span>
  );
}
