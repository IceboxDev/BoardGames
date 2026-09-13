import { type CSSProperties, type ReactNode, useState } from "react";
import { cn } from "../../../../../lib/cn";
import { type ArtName, cardArtUrl } from "../card-art";
import { type Box, boxStyle } from "../card-layout";

interface Props {
  name: ArtName;
  box: Box;
  /** Drawn while the block's art does not exist, or if its file fails to load. */
  fallback: ReactNode;
  /** `bottom` anchors the art to the box's bottom edge (court figures stand on it). */
  anchor?: "centre" | "bottom";
  /** Upside down — the lower-half pips. */
  flip?: boolean;
  layer: string;
  pip?: boolean;
  className?: string;
  style?: CSSProperties;
}

/**
 * One art block in its grid box. The only place a card writes an `<img>`:
 * decoded once and composited (an SVG `<image>` would be re-rasterised on
 * every repaint of the face), and falling back on error so an LFS pointer
 * file on a checkout without LFS still yields a readable card.
 */
export default function ArtLayer({
  name,
  box,
  fallback,
  anchor = "centre",
  flip = false,
  layer,
  pip = false,
  className,
  style,
}: Props) {
  const url = cardArtUrl(name);
  const [failed, setFailed] = useState(false);
  const geometry: CSSProperties = {
    ...boxStyle(box),
    ...(flip ? { transform: "rotate(180deg)" } : null),
    ...style,
  };
  const data = { "data-layer": layer, "data-pip": pip ? "" : undefined };
  if (!url || failed) {
    return (
      <div
        {...data}
        data-fallback={name}
        className={cn("absolute flex items-center justify-center", className)}
        style={geometry}
      >
        {fallback}
      </div>
    );
  }
  return (
    <img
      {...data}
      src={url}
      alt=""
      draggable={false}
      decoding="async"
      className={cn(
        "absolute object-contain",
        anchor === "bottom" ? "object-bottom" : "object-center",
        className,
      )}
      style={geometry}
      onError={() => setFailed(true)}
    />
  );
}

/** A texture (paper grain, seigaiha) covering the whole card; nothing when missing. */
export function TileLayer({
  name,
  opacity,
  blend,
  className,
}: {
  name: ArtName;
  opacity: number;
  blend?: CSSProperties["mixBlendMode"];
  className?: string;
}) {
  const url = cardArtUrl(name);
  if (!url) return null;
  return (
    <div
      aria-hidden="true"
      data-layer={name}
      className={cn("pointer-events-none absolute inset-0 bg-center bg-cover", className)}
      style={{ backgroundImage: `url(${url})`, opacity, mixBlendMode: blend }}
    />
  );
}
