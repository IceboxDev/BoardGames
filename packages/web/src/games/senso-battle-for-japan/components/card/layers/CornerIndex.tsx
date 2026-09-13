import type { ReactNode } from "react";
import { cn } from "../../../../../lib/cn";
import { GOLD_LEAF, INDEX_BACKING } from "../../../colors";
import {
  type Box,
  boxStyle,
  cq,
  INDEX,
  type IndexDetail,
  indexBounds,
  indexGeometry,
} from "../card-layout";

interface Props {
  detail: IndexDetail;
  /** "7", "K", "忍". */
  glyph: string;
  color: string;
  /** The small crest, or the ninja's 木/玉 mark, drawn into the crest box. */
  mark: (box: Box) => ReactNode;
  trump: boolean;
  /** Drawn at the bottom-right instead, rotated with the card. */
  mirrored?: boolean;
  /** A paper tab under the index when the body is full-bleed art. */
  backing?: boolean;
}

/**
 * The rank and clan mark in the top-left corner: the one thing guaranteed
 * visible in a squeezed fan (13 cards on a phone leave ~20 px per card), so
 * the glyph is the leftmost element and carries the clan's ink. Mirroring
 * rotates the whole group about the card's centre.
 */
export default function CornerIndex({
  detail,
  glyph,
  color,
  mark,
  trump,
  mirrored = false,
  backing = false,
}: Props) {
  const spec = INDEX[detail];
  const g = indexGeometry(glyph, detail);
  return (
    <div
      data-index=""
      data-mirrored={mirrored ? "" : undefined}
      className={cn("pointer-events-none absolute inset-0", mirrored && "rotate-180")}
    >
      {backing && (
        <div
          aria-hidden="true"
          className="absolute rounded-card-md"
          style={{ ...boxStyle(indexBounds(detail)), background: INDEX_BACKING }}
        />
      )}
      <span
        data-rank=""
        className="absolute whitespace-nowrap font-black leading-none tabular-nums"
        style={{
          ...boxStyle(g.glyph),
          fontSize: cq(spec.rankFont),
          color,
          letterSpacing: g.letterSpacing,
        }}
      >
        {glyph}
      </span>
      {trump && (
        <span
          data-layer="trump-bar"
          className="absolute rounded-full"
          style={{ ...boxStyle(g.bar), background: GOLD_LEAF }}
        />
      )}
      {mark(g.crest)}
    </div>
  );
}
