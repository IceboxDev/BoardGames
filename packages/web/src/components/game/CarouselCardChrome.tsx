import "./carousel-frame.css";
import type { ReactNode } from "react";
import { carouselPose } from "./carousel-3d-constants";

// Pixel-positioned card frame for the 3D coverflow carousel. Shared by
// single-game cards (`GameCarousel3D`) and family cards
// (`FamilyCarouselCard`). Owns:
//   - absolute centering inside the parent's 3D stack
//   - cardW × cardH dimensioning + the rounded-2xl frame
//   - `isBestForHeadcount` amber-glow border state
//   - keyboard-clickable role="button" (with Enter / Space handlers)
//   - the CSS-transitioned transform path (x, z, rotateY, scale, opacity)
//   - backface-hidden + per-card z-index stacking
//
// Animation is deliberately plain CSS (`.carousel-pose` transitions
// transform + opacity): both properties are compositor-driven, so swiping
// never runs per-frame JS — the framer-motion springs this replaced were
// re-styling every card from the main thread each frame, which chopped on
// phones. Cards outside `CAROUSEL_WINDOW` are culled by the caller;
// `@starting-style` in carousel-frame.css fades a freshly mounted card in
// at the masked edge instead of popping.
//
// Children should be the thumb + body inner blocks (typically
// `<CarouselThumb>` + `<CarouselBody>`); the chrome owns the outer frame
// and leaves the inner layout to the consumer so per-card variations
// (single vs family badges, year vs variants count) stay configurable.

type Props = {
  cardW: number;
  cardH: number;
  /** Wrapped offset from carousel center; 0 = focused. */
  offset: number;
  /** True when offset === 0 (focused card). */
  isCenter: boolean;
  /** Per-card accent color, exposed as the `--accent` CSS variable to children. */
  accentHex: string;
  /**
   * Bumps the frame to a cyan-fiery-blue glowing border. Takes precedence
   * over `isBestForHeadcount` — a freshly-added game reads as "new" first.
   */
  isNew: boolean;
  /** Bumps the frame to a brighter amber border + shadow. */
  isBestForHeadcount: boolean;
  /** Accessible label for the role=button div. */
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
  isCenter,
  accentHex,
  isNew,
  isBestForHeadcount,
  ariaLabel,
  onClick,
  spreadMax,
  zMax,
  children,
}: Props) {
  const pose = carouselPose({ offset, spreadMax, zMax });
  return (
    // biome-ignore lint/a11y/useSemanticElements: the card hosts nested interactive controls (reaction buttons, variant chips), which a real <button> cannot legally contain
    <div
      role="button"
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      tabIndex={0}
      aria-label={ariaLabel}
      // The chrome itself is just position + dims + pose + accent variable.
      // The visible border / shadow / rounded frame live on the inner
      // `<CarouselCardFrame>` so consumers can put the variant chip strip
      // OUTSIDE the rounded-clip frame while staying inside this
      // positioned/scaled wrapper.
      className="carousel-pose absolute left-1/2 top-1/2 origin-center cursor-pointer text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      style={
        {
          width: cardW,
          height: cardH,
          marginLeft: -cardW / 2,
          marginTop: -cardH / 2,
          backfaceVisibility: "hidden",
          zIndex: 100 - Math.abs(offset),
          transform: pose.transform,
          "--pose-opacity": pose.opacity,
          "--accent": accentHex,
        } as React.CSSProperties
      }
    >
      <CarouselCardFrame isCenter={isCenter} isNew={isNew} isBestForHeadcount={isBestForHeadcount}>
        {children}
      </CarouselCardFrame>
    </div>
  );
}

/**
 * Inner visible card body — the rounded-2xl frame with surface-900
 * background, border, and the amber best-for-headcount glow. Split from
 * the pose wrapper so consumers can render absolutely-positioned widgets
 * (variant chip strip) at the wrapper level without sitting inside the
 * overflow-hidden frame.
 *
 * Exported because `FamilyCarouselCard` opts to render the frame
 * directly while keeping its chip-strip OUTSIDE the frame; that
 * structure is `<div from CarouselCardChrome>` → `<CarouselCardFrame>` →
 * `<thumb + body>`, with the chip-strip rendered by `GameCarousel3D` at a
 * sibling level above the pose wrapper.
 */
export function CarouselCardFrame({
  isCenter,
  isNew,
  isBestForHeadcount,
  children,
}: {
  isCenter: boolean;
  isNew: boolean;
  isBestForHeadcount: boolean;
  children: ReactNode;
}) {
  // The center-card subtle inner-glow lives at the thumb level (where
  // the accent stripe paints the inside of the thumbnail). Here we only
  // pick the border + shadow chrome. Precedence: New (cyan-fiery-blue)
  // beats Best-at-N (amber) beats the neutral default — a fresh arrival
  // is the loudest signal we surface.
  const cls = isNew
    ? "border-2 card-frame-new"
    : isBestForHeadcount
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
