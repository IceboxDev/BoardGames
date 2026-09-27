import { bonusDef } from "@boardgames/core/games/the-hunger/content/bonus-tokens";
import type { CSSProperties } from "react";
import { cn } from "../../../lib/cn";
import { type ArtName, artUrl } from "../logic/art";
import { bonusShort } from "../logic/labels";

/**
 * The physical pieces around the cards: Bonus tokens, Castle tiles and the
 * brass or thorn corners that dress a panel. Each draws a plain stand-in
 * until its art exists.
 */

const CORNERS: readonly { pos: string; flip: string }[] = [
  { pos: "left-0 top-0", flip: "none" },
  { pos: "right-0 top-0", flip: "scaleX(-1)" },
  { pos: "bottom-0 left-0", flip: "scaleY(-1)" },
  { pos: "bottom-0 right-0", flip: "scale(-1, -1)" },
];

/** An ornament in each corner of its (relative) parent, mirrored to fit. */
export function PanelCorners({
  art,
  className = "h-10 w-10",
  corners = 4,
  style,
}: {
  art: ArtName;
  className?: string;
  /** 2 draws only the top pair. */
  corners?: 2 | 4;
  style?: CSSProperties;
}) {
  const url = artUrl(art);
  if (!url) return null;
  return (
    <>
      {CORNERS.slice(0, corners).map((c) => (
        <img
          key={c.pos}
          src={url}
          alt=""
          aria-hidden
          draggable={false}
          className={cn("pointer-events-none absolute select-none", c.pos, className)}
          style={{ transform: c.flip, ...style }}
        />
      ))}
    </>
  );
}

/** A Bonus token: the brass disc with its effect stamped on it. */
export function BonusToken({
  id,
  used = false,
  className,
}: {
  id: string;
  used?: boolean;
  className?: string;
}) {
  const disc = artUrl("bonus-token-disc");
  return (
    <span
      className={cn(
        "relative flex aspect-square items-center justify-center rounded-full",
        !disc && "border border-amber-400/40 bg-amber-900/40",
        used && "opacity-45 grayscale",
        className,
      )}
      title={`${bonusDef(id).name}: ${bonusDef(id).text}`}
    >
      {disc && (
        <img
          src={disc}
          alt=""
          aria-hidden
          draggable={false}
          className="absolute inset-0 h-full w-full drop-shadow-md"
        />
      )}
      <span
        className="relative px-[15%] text-center text-3xs font-bold leading-tight"
        style={{ color: "#2a1a08", textShadow: "0 1px 0 rgb(255 236 180 / 0.45)" }}
      >
        {bonusShort(id)}
      </span>
    </span>
  );
}

/** A Castle tile: the stone plaque with the VP it is worth. */
export function CastleTile({ vp, className }: { vp: number; className?: string }) {
  const plaque = artUrl("castle-tile");
  return (
    <span
      className={cn("relative flex items-end justify-center", className)}
      title={`Castle tile: ${vp} VP`}
    >
      {plaque ? (
        <img
          src={plaque}
          alt=""
          aria-hidden
          draggable={false}
          className="absolute inset-0 h-full w-full object-contain drop-shadow-md"
        />
      ) : (
        <span className="absolute inset-0 rounded-ui-md border border-line-strong bg-fill-strong" />
      )}
      <span
        className="relative mb-[18%] text-lg font-bold tabular-nums"
        style={{ color: "#2b2730", textShadow: "0 1px 0 rgb(255 255 255 / 0.5)" }}
      >
        {vp}
      </span>
    </span>
  );
}
