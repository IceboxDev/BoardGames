import type { ReactNode } from "react";

// Pixel-height thumbnail block for carousel cards. Same `<img>` + gradient
// overlay treatment as the catalog `<GameCardThumb>` but driven by a fixed
// pixel height (derived from the carousel's cardW/cardH math) instead of
// the 16:9 aspect ratio. Adds an accent-colored inner-glow ring on the
// centered card to draw the eye.

type Props = {
  src: string;
  /** Pixel height of the thumb region (derived from `cardH * 270/REF_CARD_H`). */
  thumbHeight: number;
  /** Per-card accent — paints the inner-glow ring on center cards. */
  accentHex: string;
  /** True when this card is the focused one. */
  isCenter: boolean;
  badgeTopLeft?: ReactNode;
  badgeTopRight?: ReactNode;
  /** Bottom-center overlay (typically `<GameReactions>`). */
  overlay?: ReactNode;
};

export function CarouselThumb({
  src,
  thumbHeight,
  accentHex,
  isCenter,
  badgeTopLeft,
  badgeTopRight,
  overlay,
}: Props) {
  return (
    <div className="relative w-full overflow-hidden" style={{ height: thumbHeight }}>
      <img
        src={src}
        alt=""
        className="h-full w-full object-cover"
        loading="lazy"
        decoding="async"
        fetchPriority={isCenter ? "high" : "low"}
        draggable={false}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-surface-900 via-surface-900/30 to-transparent" />
      {isCenter && (
        <span
          aria-hidden="true"
          className="absolute inset-0"
          style={{ boxShadow: `inset 0 0 36px ${accentHex}55` }}
        />
      )}
      {badgeTopRight && <span className="absolute right-2 top-2">{badgeTopRight}</span>}
      {badgeTopLeft && <span className="absolute left-2 top-2">{badgeTopLeft}</span>}
      {overlay && <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2">{overlay}</div>}
    </div>
  );
}
