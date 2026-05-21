import type { ReactNode } from "react";

// Thumbnail block for catalog-style game cards. Owns the 16:9 frame, the
// `<img>` with the hover-scale treatment, the gradient overlay that lifts
// the text below, and four configurable slots:
//   - `backdrop`: rendered behind the main thumbnail (ghost cards for
//     family stacks). When present, the main `<img>` keeps `relative` so it
//     sits above the backdrop.
//   - `badgeTopLeft` / `badgeTopRight`: absolutely-positioned pills,
//     typically status chips ("Coming soon", "+N variants", year, etc.).
//   - `overlay`: bottom-center / inside-thumbnail overlay for game-night
//     reactions or any other floating widget that needs to live on the
//     thumbnail rather than the body.
//
// `noHoverScale` disables the group-hover scale on the main image — used by
// FamilyCard where the ghost backdrop has its own subtle transform and an
// extra scale would feel jittery.

type Props = {
  src: string;
  /** Slot rendered BEHIND the main thumbnail. */
  backdrop?: ReactNode;
  badgeTopLeft?: ReactNode;
  badgeTopRight?: ReactNode;
  overlay?: ReactNode;
  /** Drop the default `group-hover:scale-105` on the main image. */
  noHoverScale?: boolean;
};

const IMG_BASE = "h-full w-full object-cover transition-transform duration-500";

export function GameCardThumb({
  src,
  backdrop,
  badgeTopLeft,
  badgeTopRight,
  overlay,
  noHoverScale = false,
}: Props) {
  const imgCls = noHoverScale ? IMG_BASE : `${IMG_BASE} group-hover:scale-105`;
  return (
    <div className="relative aspect-[16/9] overflow-hidden">
      {backdrop}
      <img
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        className={backdrop ? `relative ${imgCls}` : imgCls}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-surface-900 via-surface-900/20 to-transparent" />
      {badgeTopLeft && <span className="absolute left-2 top-2">{badgeTopLeft}</span>}
      {badgeTopRight && <span className="absolute right-2 top-2">{badgeTopRight}</span>}
      {overlay}
    </div>
  );
}
