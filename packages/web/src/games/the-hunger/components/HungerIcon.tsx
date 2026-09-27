import type { CSSProperties, ReactNode } from "react";
import { cn } from "../../../lib/cn";
import { type ArtName, artUrl, COLOR_ICONS } from "../logic/art";

/**
 * One of the game's stamp icons. Ink icons take the current text colour (a
 * CSS mask over `bg-current`), so they theme like text; the few coloured ones
 * (VP drop, Spicy pepper, Instant spark) draw as they are. Until an icon's
 * file exists, `fallback` (the old emoji) stands in.
 */
export default function HungerIcon({
  name,
  className,
  title,
  fallback,
  style,
}: {
  name: ArtName;
  /** Inline size or colour, e.g. container units on a card face. */
  style?: CSSProperties;
  /** Size, e.g. `h-4 w-4`, and colour, e.g. `text-amber-300`. */
  className?: string;
  title?: string;
  fallback?: ReactNode;
}) {
  const url = artUrl(name);
  if (!url) {
    return fallback ? (
      <span
        className={cn("inline-flex items-center justify-center", className)}
        style={style}
        title={title}
      >
        {fallback}
      </span>
    ) : null;
  }
  if (COLOR_ICONS.has(name)) {
    return (
      <img
        src={url}
        alt={title ?? ""}
        title={title}
        aria-hidden={title ? undefined : true}
        draggable={false}
        className={cn("inline-block shrink-0 object-contain", className)}
        style={style}
      />
    );
  }
  const mask: CSSProperties = {
    ...style,
    maskImage: `url(${url})`,
    WebkitMaskImage: `url(${url})`,
    maskSize: "contain",
    WebkitMaskSize: "contain",
    maskRepeat: "no-repeat",
    WebkitMaskRepeat: "no-repeat",
    maskPosition: "center",
    WebkitMaskPosition: "center",
  };
  const cls = cn("inline-block shrink-0 bg-current", className);
  return title ? (
    <span role="img" aria-label={title} title={title} className={cls} style={mask} />
  ) : (
    <span aria-hidden className={cls} style={mask} />
  );
}
