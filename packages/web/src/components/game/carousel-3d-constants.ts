// Shared layout + animation constants for the 3D coverflow carousel. Lives
// here (not inline in `GameCarousel3D.tsx`) so `FamilyCarouselCard` and any
// future carousel consumer use the same numbers without having to receive
// them as props or duplicate them.

// Reference card dimensions — the design was tuned at 380×560. All scaled
// constants below are derived as ratios of these so the visual relationships
// (spread, depth, perspective) stay coherent at any card size.
export const REF_CARD_W = 380;
export const REF_CARD_H = 560;
export const ASPECT = REF_CARD_H / REF_CARD_W;

// Bumped from 240 → 280 so the description's `line-clamp-7` always has
// room to render 5–6 lines after the title + player-range + BggInline
// rows take their share of `bodyH`. At cardW=240 the leftover body slot
// was only ~60–80px, which truncated the description below its char
// budget; cardW=280 buys ~25% more body height for ~17% more card width.
// Still legible on a 320–375px phone — the 0.92 width factor in the cardW
// formula keeps phones comfortable.
export const MIN_CARD_W = 280;

// Sensible cap on 4K — bumped from 520 so the description font has room
// to breathe at 14-15px on a 4K monitor.
export const MAX_CARD_W = 640;

// Vertical breathing room (total px subtracted from the height budget
// before dividing by ASPECT). Without this, height-bound viewports
// (1366×768, 1440×900, 13" laptops with browser chrome, etc.) produce
// cards that exactly fill the masked wrapper — and the wrapper's
// `overflow-hidden` then clips the amber "best at" shadow at the bottom
// AND lets the 20px vertical fade ramp eat into the card's own top/bottom
// edges. The 4K case never hits this because `MAX_CARD_W` caps `cardW`
// first; the laptop case currently fills exactly and is barely affected.
// 32px (16 each side) is enough margin that the fade ramp completely
// clears the card and the shadow has somewhere to extend into, while
// staying small enough that the laptop anchor's visible card size shifts
// by ~4% — imperceptible in practice.
export const VERTICAL_BREATHING = 32;

// All four axes use the same tanh asymptote so cards bunch coherently.
// ROTATE_MAX must stay under 90° or backface-hidden cards vanish. K
// controls softness (higher = more linear); MAX caps the asymptote.
export const SPREAD_K = 2.5;
export const ROTATE_MAX = 65; // dimensionless angle
export const SCALE_MIN = 0.55; // dimensionless ratio
export const OPACITY_MIN = 0.45; // dimensionless ratio

// Defensive floor — only triggers on extremely tight slots. With the 0.92
// width factor a typical phone produces a ≥320px card, so description
// stays visible. Drops description + weight bar below this width.
export const COMPACT_THRESHOLD = 230;

/**
 * Tanh asymptote shared by every animated axis (x offset, z depth,
 * rotateY, scale, opacity). Same input/output relationship across cards
 * so they bunch coherently as the user swipes; `SPREAD_K` softens the
 * curve so the centered card stays at zero offset and side cards bunch
 * exponentially toward the asymptote.
 */
export function asymptote(offset: number, max: number): number {
  return Math.sign(offset) * max * Math.tanh(Math.abs(offset) / SPREAD_K);
}

/**
 * Framer-motion `animate` block for a carousel card at the given offset.
 * Shared by `CarouselCardChrome` (single + family) and the lifted variant
 * chip-strip motion in `GameCarousel3D` so all three nodes follow the
 * exact same transform path during transitions.
 */
export function carouselAnimate({
  offset,
  spreadMax,
  zMax,
  hidden,
  forceHidden = false,
}: {
  offset: number;
  spreadMax: number;
  zMax: number;
  hidden: boolean;
  /**
   * Caller can force opacity to 0 regardless of hidden. Used by the
   * lifted variant chip strip so off-center families' chips vanish even
   * before the absOff > 5 hard-cut kicks in.
   */
  forceHidden?: boolean;
}) {
  return {
    x: asymptote(offset, spreadMax),
    z: -Math.abs(asymptote(offset, zMax)),
    rotateY: -asymptote(offset, ROTATE_MAX),
    scale: Math.max(SCALE_MIN, 1 - Math.abs(asymptote(offset, 1 - SCALE_MIN))),
    opacity:
      hidden || forceHidden
        ? 0
        : Math.max(OPACITY_MIN, 1 - Math.abs(asymptote(offset, 1 - OPACITY_MIN))),
    pointerEvents: (hidden ? "none" : "auto") as "none" | "auto",
  };
}

/** Spring transition used by every carousel card and lifted overlay. */
export const CAROUSEL_TRANSITION = { type: "spring" as const, stiffness: 220, damping: 28 };
