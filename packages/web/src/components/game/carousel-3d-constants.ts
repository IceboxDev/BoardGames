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

// Absolute floor — only guards against degenerate slots (a collapsed
// container mid-layout). Unlike the old MIN_CARD_W floor, this is far below
// any real phone so it can never inflate the card past its container: a
// card forced LARGER than the height budget gets its top and bottom clipped
// by the masked wrapper, which is strictly worse than a smaller card.
export const FLOOR_CARD_W = 200;

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
 * Cards further than this many slots from center are NOT rendered at all.
 * Every mounted card is a composited 3D layer the GPU must hold, so this
 * caps the worst case at 9 cards. It must stay ≥4: the receding cascade of
 * bunched cards at offsets 3-4 IS the carousel's "3D bent" depth look — a
 * tighter window amputates the tail and the coverflow reads flat.
 */
export const CAROUSEL_WINDOW = 4;

/**
 * CSS pose for a carousel card at the given offset — the compositor-driven
 * replacement for the old framer-motion spring block. Transform and opacity
 * both transition via `CAROUSEL_TRANSITION_CSS` (see `.carousel-pose` in
 * carousel-frame.css), so navigation animates entirely off the main thread:
 * no per-frame JS, which is what made the springs chop on phones. Shared by
 * `CarouselCardChrome` and the lifted variant chip strip so both follow the
 * exact same transform path.
 */
export function carouselPose({
  offset,
  spreadMax,
  zMax,
}: {
  offset: number;
  spreadMax: number;
  zMax: number;
}): { transform: string; opacity: number } {
  const x = asymptote(offset, spreadMax);
  const z = -Math.abs(asymptote(offset, zMax));
  const rotateY = -asymptote(offset, ROTATE_MAX);
  const scale = Math.max(SCALE_MIN, 1 - Math.abs(asymptote(offset, 1 - SCALE_MIN)));
  return {
    transform: `translate3d(${x}px, 0px, ${z}px) rotateY(${rotateY}deg) scale(${scale})`,
    opacity: Math.max(OPACITY_MIN, 1 - Math.abs(asymptote(offset, 1 - OPACITY_MIN))),
  };
}

/**
 * Transition timing shared by the cards, the chip strips, and the drag
 * snap-back — an ease-out-quint-style curve tuned to feel like the old
 * stiffness-220/damping-28 spring without its JS driver.
 */
export const CAROUSEL_TRANSITION_CSS =
  "transform 550ms cubic-bezier(0.22, 1, 0.36, 1), opacity 350ms ease";
