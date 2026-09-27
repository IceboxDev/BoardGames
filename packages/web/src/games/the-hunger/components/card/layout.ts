import type { CardDef } from "@boardgames/core/games/the-hunger/types";
import type { CSSProperties } from "react";

/**
 * The card's geometry, in units of its width (100 = the card's width; the
 * card is 2:3, so 150 tall). Faces place every layer as `%` of the card and
 * size every glyph in `cqw`, so one drawing holds from a 64 px Hunt-Track
 * card to a 420 px preview and every card lines up with every other.
 */
export const CARD_H = 150;

export type Face = "compact" | "showcase";
export type ArtShape = "figure" | "beast" | "object";

/** Humans and Powers are 4:5 figures, Familiars 1:1 beasts, the rest objects. */
export function artShape(def: CardDef): ArtShape {
  if (def.type === "human" || def.type === "power") return "figure";
  if (def.type === "familiar") return "beast";
  return "object";
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Side padding around the art, so the card never looks like it squeezes it. */
const INSET: Record<Face, number> = { compact: 7, showcase: 10 };
const TOP: Record<Face, number> = { compact: 5, showcase: 4 };

/** Where the art sits on each face, per shape. */
export function artBox(face: Face, shape: ArtShape): Box {
  const inset = INSET[face];
  const w = 100 - inset * 2;
  if (shape === "figure") return { x: inset, y: TOP[face], w, h: w * 1.25 };
  // A 1:1 beast or an object is centred in the space above the text zone.
  const room = CARD_H * (1 - TEXT_ZONE[face]);
  const side = shape === "beast" ? w : w * 0.9;
  return { x: (100 - side) / 2, y: Math.max(TOP[face], (room - side) / 2), w: side, h: side };
}

/**
 * The share of the card's height kept for text, measured from the bottom.
 * Compact: exactly the band a 4:5 figure leaves below it, so every name sits
 * on the same line. Showcase: a taller scrim for the rules and keywords.
 */
export const TEXT_ZONE: Record<Face, number> = { compact: 0.26, showcase: 0.44 };

/** A figure dissolves into the scrim over its last part (mask stop, 0–1 of its height). */
export const FIGURE_FADE_FROM = 0.8;

/** A box as `%` of the card, for an absolutely positioned layer. */
export function boxStyle(b: Box): CSSProperties {
  return {
    position: "absolute",
    left: `${b.x}%`,
    top: `${(b.y / CARD_H) * 100}%`,
    width: `${b.w}%`,
    height: `${(b.h / CARD_H) * 100}%`,
  };
}

/** Card-width units → container width units (100 units = the card's width). */
export function cq(units: number): string {
  return `${units}cqw`;
}
