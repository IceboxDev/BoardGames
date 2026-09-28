import type { CardDef } from "@boardgames/core/games/the-hunger/types";
import type { CSSProperties } from "react";
import { TONE_HEX, toneOf } from "../../logic/card-colors";

/** The card's colour: its faction, or its kind. */
export function cardHex(def: CardDef): string {
  return TONE_HEX[toneOf(def)];
}

export function speedText(def: CardDef): string {
  const s = def.speed;
  if (typeof s === "number") return s > 0 ? `+${s}` : String(s);
  return `${s.base}*`;
}

/** A card that adds no Speed carries no Speed chip: "0" is noise. */
export function showsSpeed(def: CardDef): boolean {
  return def.speed !== 0;
}

/**
 * The card's skin: its colour as a 1 px hairline, a faint glow and a thin
 * light along the top edge. No frame, no fill — the art is the card. A usable
 * card trades the hairline for amber; a selected one for a brighter, firmer
 * amber edge. (Drawn here, not as a ring: this shadow is inline and would
 * cover one.)
 */
export function skin(
  hex: string,
  glow: number,
  state: "idle" | "usable" | "selected" = "idle",
): CSSProperties {
  const edge =
    state === "selected"
      ? "inset 0 0 0 2px rgb(253 230 138)"
      : state === "usable"
        ? "inset 0 0 0 1.5px rgb(252 211 77 / 0.85)"
        : `inset 0 0 0 1px ${hex}73`;
  const halo =
    state === "selected"
      ? "0 0 26px 2px rgb(251 191 36 / 0.55)"
      : `0 0 ${glow}px -${glow / 3}px ${hex}`;
  return {
    background: "#0b0710",
    boxShadow: [
      edge,
      "inset 0 1px 0 0 rgb(255 255 255 / 0.14)",
      halo,
      "0 10px 30px -12px rgb(0 0 0 / 0.8)",
    ].join(", "),
  };
}

/** Frosted glass for the stat chips and keyword pills. */
export const GLASS: CSSProperties = {
  background: "rgb(12 8 16 / 0.5)",
  backdropFilter: "blur(6px)",
  WebkitBackdropFilter: "blur(6px)",
  boxShadow: "inset 0 0 0 1px rgb(255 255 255 / 0.16), 0 2px 8px rgb(0 0 0 / 0.45)",
};
