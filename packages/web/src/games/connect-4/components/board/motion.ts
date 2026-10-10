import type { Transition } from "framer-motion";
import { CELL } from "./geometry";

/** How far a landed disc rebounds (viewBox units) — upwards only. */
export const REBOUND = CELL * 0.07;

/** Seconds a disc takes to fall `cells` cells (and land — when its clack should sound). */
export function fallSeconds(cells: number): number {
  return cells <= 0 ? 0 : 0.1 * Math.sqrt(cells);
}

/**
 * A disc falling `cells` cells under gravity: ease-in to the slot (time grows
 * with the square root of the drop, as a real fall does), then a short
 * rebound off the disc below and back. Matches the four `y` keyframes
 * `[current, slot, slot - REBOUND, slot]`.
 */
export function fallTransition(cells: number): Transition {
  if (cells <= 0) return { duration: 0 };
  const fall = fallSeconds(cells);
  const rebound = 0.11;
  const total = fall + rebound;
  return {
    y: {
      duration: total,
      times: [0, fall / total, (fall + rebound / 2) / total, 1],
      ease: ["easeIn", "easeOut", "easeIn"],
    },
    duration: fall,
    ease: "easeIn",
  };
}

/**
 * How the board moves its discs: `live` play drops each disc in and, between
 * games, lets the old ones fall out of the board; the `analysis` board drops
 * a disc in when stepping forward and fades discs out when stepping back,
 * quickly, since the viewer scrubs.
 */
export type BoardMotion = "live" | "analysis";

export interface DiscPlace {
  x: number;
  /** The disc's slot. */
  y: number;
  /** Where a new disc starts (over its column). */
  startY: number;
  /** Below the board, where a live disc falls out to. */
  outY: number;
  /** How many cells this disc falls now (0: it stays put). */
  fallCells: number;
  /** The board's rows: a falling-out disc falls them all. */
  rows: number;
}

/**
 * A disc's framer-motion props. Every property `exit` changes, `animate` sets
 * back: a disc that returns while still leaving (step back, then forward,
 * before the exit ends) is revived mid-exit, and anything left out would stay
 * where the exit left it — invisible.
 */
export function discMotion(place: DiscPlace, mode: BoardMotion, reduced: boolean) {
  const { x, y, startY, outY, fallCells, rows } = place;
  const exit =
    mode === "live"
      ? { y: outY, opacity: 0, transition: reduced ? { duration: 0 } : fallTransition(rows + 1) }
      : { opacity: 0, transition: { duration: reduced ? 0 : 0.12 } };
  return {
    initial: { x, y: startY, opacity: 1 },
    // Falls onto its slot, then rebounds a touch *upwards* — it never passes
    // the slot (a spring's overshoot sank it through the board).
    animate: { x, y: [null, y, y - REBOUND, y], opacity: 1 },
    exit,
    transition: reduced ? { duration: 0 } : fallTransition(fallCells),
  };
}
