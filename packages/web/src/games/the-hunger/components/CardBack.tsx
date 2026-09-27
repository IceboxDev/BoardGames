import type { CSSProperties } from "react";
import { cn } from "../../../lib/cn";
import { artUrl, vampireArt } from "../logic/art";
import { vampireColor } from "../logic/labels";

/**
 * A face-down card: the Hunt deck's castle emblem, or — with `vampire` — that
 * seat's crest on their own Starting-deck back. Falls back to the plain dark
 * gradient until the art exists.
 */
export default function CardBack({
  vampire,
  className,
  style,
}: {
  vampire?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const emblem = vampire === undefined ? artUrl("back-hunt-emblem") : vampireArt(vampire, "sigil");
  const tint = vampire === undefined ? "#4c0519" : vampireColor(vampire);
  const pattern = artUrl("back-hunt-pattern");
  return (
    <span
      className={cn(
        "flex items-center justify-center rounded-card-md border border-line-strong shadow-md",
        className,
      )}
      style={{
        background: [
          `radial-gradient(circle at 50% 40%, ${tint}66, #0c0710e6 75%)`,
          pattern ? `url(${pattern}) center / 140% repeat` : "",
          "#0c0710",
        ]
          .filter(Boolean)
          .join(", "),
        ...style,
      }}
      aria-hidden
    >
      {emblem && <img src={emblem} alt="" draggable={false} className="w-4/5 drop-shadow-lg" />}
    </span>
  );
}
