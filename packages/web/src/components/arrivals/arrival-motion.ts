import {
  MotionConfigContext,
  type Transition,
  useReducedMotion,
  type Variants,
} from "framer-motion";
import { useContext } from "react";

// The takeover's entrance, as one variant tree propagated from the root
// (`initial="hidden" animate="show"`). The Modal's own backdrop fade and
// panel spring run first; this stage starts as the panel lands. Under
// reduced motion the root passes `initial={false}`, so every "show" value is
// rendered immediately and the orbit does not spin.
//
// Timeline from mount (n = cards): the Modal header rides the panel spring ·
// cards rise at 0.25 + 0.14·i (spring settles ≈0.6s) · inside each card:
// vote disc +0.30, medallion +0.42, orbit +0.54, title +0.66, caption +0.78 ·
// the thanks tile fades up after the last card.

export const stage = {
  rail: {
    hidden: {},
    show: { transition: { delayChildren: 0.25, staggerChildren: 0.14 } },
  },
  card: {
    hidden: { opacity: 0, y: 36, scale: 0.94 },
    show: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: {
        type: "spring",
        stiffness: 180,
        damping: 22,
        delayChildren: 0.3,
        staggerChildren: 0.12,
      },
    },
  },
  pop: {
    hidden: { opacity: 0, scale: 0.6 },
    show: { opacity: 1, scale: 1, transition: { type: "spring", stiffness: 420, damping: 18 } },
  },
  orbit: {
    hidden: { opacity: 0, scale: 0.8 },
    show: { opacity: 1, scale: 1, transition: { duration: 0.5, ease: "easeOut" } },
  },
  fadeUp: {
    hidden: { opacity: 0, y: 8 },
    show: { opacity: 1, y: 0, transition: { duration: 0.35 } },
  },
} satisfies Record<string, Variants>;

/** One full turn of the voter ring. Slow enough to read as a drift. */
export const ORBIT_SPIN: Transition = {
  duration: 48,
  repeat: Number.POSITIVE_INFINITY,
  ease: "linear",
};

/**
 * Whether to render the takeover static. framer's `useReducedMotion` reads
 * only the OS setting; a surrounding `<MotionConfig reducedMotion="always">`
 * (tests, headless screenshots) must win too, and `"never"` must override
 * the OS so the dev preview can show the choreography on demand.
 */
export function useArrivalReducedMotion(): boolean {
  const { reducedMotion } = useContext(MotionConfigContext);
  const os = useReducedMotion() ?? false;
  if (reducedMotion === "always") return true;
  if (reducedMotion === "never") return false;
  return os;
}
