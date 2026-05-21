import type { Transition } from "framer-motion";

/**
 * Standard spring for "object moves to a new logical position" — die slides
 * into a slot, marker advances along a track. Matches the spring used by
 * components/ui/Modal.tsx so motion stays consistent across surfaces.
 */
export const boardSpring: Transition = {
  type: "spring",
  stiffness: 220,
  damping: 26,
};

/**
 * Fast ease for opacity-only transitions (highlight fades, hover tints).
 */
export const boardEase: Transition = {
  duration: 0.18,
  ease: "easeOut",
};

/**
 * Slow pulse for "ring on a legal slot" indicators. Pair with framer-motion's
 * `useReducedMotion()` to short-circuit on user preference.
 */
export const pulseRingAnimation = {
  scale: [1, 1.06, 1],
  opacity: [0.6, 1, 0.6],
};

export const pulseRingTransition: Transition = {
  duration: 1.4,
  repeat: Number.POSITIVE_INFINITY,
  ease: "easeInOut",
};
