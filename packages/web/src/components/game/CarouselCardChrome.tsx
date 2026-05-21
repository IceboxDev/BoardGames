import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { CAROUSEL_TRANSITION, carouselAnimate } from "./carousel-3d-constants";

// Pixel-positioned + framer-motion card frame for the 3D coverflow
// carousel. Shared by single-game cards (`GameCarousel3D`) and family
// cards (`FamilyCarouselCard`). Owns:
//   - absolute centering inside the parent's motion stack
//   - cardW × cardH dimensioning + the rounded-2xl frame
//   - `isBestForHeadcount` amber-glow border state
//   - keyboard-clickable role="button" (with Enter / Space handlers)
//   - the spring-animated transform path (x, z, rotateY, scale, opacity)
//   - backface-hidden + per-card z-index stacking
//
// Children should be the thumb + body inner blocks (typically
// `<CarouselThumb>` + `<CarouselBody>`); the chrome owns the outer frame
// and leaves the inner layout to the consumer so per-card variations
// (single vs family badges, year vs variants count) stay configurable.

type Props = {
  cardW: number;
  cardH: number;
  /** Offset from carousel center; 0 = focused. */
  offset: number;
  /** True when |offset| > 5 — card is far off-screen, hide entirely. */
  hidden: boolean;
  /** True when offset === 0 (focused card). */
  isCenter: boolean;
  /** Per-card accent color, exposed as the `--accent` CSS variable to children. */
  accentHex: string;
  /** Bumps the frame to a brighter amber border + shadow. */
  isBestForHeadcount: boolean;
  /** Accessible label for the role=button motion.div. */
  ariaLabel: string;
  /** Centering this card (consumer logic typically: clicking off-center cards focuses them). */
  onClick: () => void;
  /** Asymptote scale for x position. */
  spreadMax: number;
  /** Asymptote scale for z depth. */
  zMax: number;
  /** Thumb + body slots — typically `<CarouselThumb>` + `<CarouselBody>`. */
  children: ReactNode;
};

export function CarouselCardChrome({
  cardW,
  cardH,
  offset,
  hidden,
  isCenter,
  accentHex,
  isBestForHeadcount,
  ariaLabel,
  onClick,
  spreadMax,
  zMax,
  children,
}: Props) {
  const absOff = Math.abs(offset);
  return (
    <motion.div
      role="button"
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      tabIndex={hidden ? -1 : 0}
      aria-hidden={hidden}
      aria-label={ariaLabel}
      // The chrome itself is just position + dims + accent variable. The
      // visible border / shadow / rounded frame live on the inner
      // `<div className="rounded-2xl …">` rendered by the consumer (see
      // CarouselCardFrame below). Splitting the two lets consumers put
      // the variant chip strip OUTSIDE the rounded-clip frame while
      // staying inside this positioned/scaled wrapper.
      className="absolute left-1/2 top-1/2 origin-center cursor-pointer text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      style={
        {
          width: cardW,
          height: cardH,
          marginLeft: -cardW / 2,
          marginTop: -cardH / 2,
          backfaceVisibility: "hidden",
          zIndex: 100 - absOff,
          "--accent": accentHex,
        } as React.CSSProperties
      }
      animate={carouselAnimate({ offset, spreadMax, zMax, hidden })}
      transition={CAROUSEL_TRANSITION}
    >
      <CarouselCardFrame isCenter={isCenter} isBestForHeadcount={isBestForHeadcount}>
        {children}
      </CarouselCardFrame>
    </motion.div>
  );
}

/**
 * Inner visible card body — the rounded-2xl frame with surface-900
 * background, border, and the amber best-for-headcount glow. Split from
 * the motion wrapper so consumers can render absolutely-positioned
 * widgets (variant chip strip) at the motion-wrapper level without
 * sitting inside the overflow-hidden frame.
 *
 * Exported because `FamilyCarouselCard` opts to render the frame
 * directly while keeping its chip-strip OUTSIDE the frame; that
 * structure is `<motion.div from CarouselCardChrome>` →
 * `<CarouselCardFrame>` → `<thumb + body>`, with the chip-strip rendered
 * by `GameCarousel3D` at a sibling level above the motion.div.
 */
export function CarouselCardFrame({
  isCenter,
  isBestForHeadcount,
  children,
}: {
  isCenter: boolean;
  isBestForHeadcount: boolean;
  children: ReactNode;
}) {
  // The center-card subtle inner-glow lives at the thumb level (where
  // the accent stripe paints the inside of the thumbnail). Here we only
  // pick the border + shadow chrome.
  const cls = isBestForHeadcount
    ? "border-2 border-amber-400/80 shadow-2xl shadow-amber-500/40"
    : "border border-white/10 shadow-2xl shadow-black/40";
  // `isCenter` reserved for future per-state chrome — currently unused
  // because the accent inner-glow lives on the thumb, not the frame.
  void isCenter;
  return (
    <div
      className={`relative h-full w-full overflow-hidden rounded-2xl bg-surface-900 transition-shadow ${cls}`}
    >
      {children}
    </div>
  );
}
