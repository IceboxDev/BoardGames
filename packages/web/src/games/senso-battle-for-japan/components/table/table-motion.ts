import {
  MotionConfigContext,
  type Transition,
  useReducedMotion,
  type Variants,
} from "framer-motion";
import { useContext, useEffect, useState } from "react";
import type { Point } from "./table-geometry";

// The conflict table's choreography, as data.
//
// A played card is born at its seat's plate and springs to its slot (the
// same spot every trick for that seat). At settle the winner's card rings;
// 700 ms in, every card sweeps into the winner's plate and fades; when the
// server clears the table 500 ms later the cards unmount along the same
// path, so a flip that beats the timer still reads as "collected". Under
// reduced motion nothing moves: cards appear, ring, and vanish.

export const FLIGHT: Transition = { type: "spring", stiffness: 260, damping: 26, mass: 0.9 };
export const SWEEP: Transition = { type: "tween", duration: 0.45, ease: [0.4, 0, 0.2, 1] };
export const POP: Transition = { type: "spring", stiffness: 420, damping: 18 };
export const RING_IN: Transition = { duration: 0.18, ease: "easeOut" };
export const INSTANT: Transition = { duration: 0 };

/** How long the winner's ring shows before the cards sweep into the pile. */
export const SWEEP_DELAY_MS = 700;

/**
 * Variants for one played card. Built per card so `enter` knows its own
 * plate and `sweep`/`exit` its own slot: one shared `custom` (the winner's
 * plate) then yields a per-card delta.
 */
export function playedCardVariants(from: Point, slot: Point, reduce: boolean): Variants {
  const flight = reduce ? INSTANT : FLIGHT;
  const sweep = reduce ? INSTANT : SWEEP;
  return {
    enter: reduce
      ? { x: 0, y: 0, scale: 1, opacity: 1, rotate: 0 }
      : { x: from.x - slot.x, y: from.y - slot.y, scale: 0.55, opacity: 0, rotate: -6 },
    land: { x: 0, y: 0, scale: 1, opacity: 1, rotate: 0, transition: flight },
    sweep: (winnerPlate: Point | null) => ({
      x: winnerPlate ? winnerPlate.x - slot.x : 0,
      y: winnerPlate ? winnerPlate.y - slot.y : 0,
      scale: 0.6,
      opacity: 0,
      rotate: 8,
      transition: sweep,
    }),
    exit: (winnerPlate: Point | null) => ({
      x: winnerPlate ? winnerPlate.x - slot.x : 0,
      y: winnerPlate ? winnerPlate.y - slot.y : 0,
      scale: 0.6,
      opacity: 0,
      transition: reduce ? INSTANT : { duration: 0.2 },
    }),
  };
}

export function chipVariants(reduce: boolean): Variants {
  return {
    hidden: { scale: 0, opacity: 0 },
    shown: { scale: 1, opacity: 1, transition: reduce ? INSTANT : { ...POP, delay: 0.3 } },
  };
}

export function ringVariants(reduce: boolean): Variants {
  return {
    hidden: { opacity: 0, scale: 1.08 },
    shown: { opacity: 1, scale: 1, transition: reduce ? INSTANT : RING_IN },
  };
}

/**
 * Whether to draw the table static. framer's `useReducedMotion` reads only
 * the OS setting; a surrounding `<MotionConfig reducedMotion="always">`
 * (tests, headless screenshots) must win too.
 */
export function useTableReducedMotion(): boolean {
  // `MotionConfigContext` DEFAULTS to "never", so "never" cannot mean "ignore
  // the OS": only an explicit "always" overrides the user's preference.
  const { reducedMotion } = useContext(MotionConfigContext);
  const os = useReducedMotion() ?? false;
  return reducedMotion === "always" || os;
}

/**
 * True `SWEEP_DELAY_MS` after `settleKey` becomes non-null, false again the
 * moment it changes or clears. Not armed under reduced motion — the cards
 * simply vanish when the server clears the table.
 */
export function useSettleSweep(settleKey: string | null, reduce: boolean): boolean {
  const [sweeping, setSweeping] = useState(false);
  useEffect(() => {
    setSweeping(false);
    if (settleKey === null || reduce) return;
    const timer = window.setTimeout(() => setSweeping(true), SWEEP_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [settleKey, reduce]);
  return sweeping;
}
