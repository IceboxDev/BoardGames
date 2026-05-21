import { type ReactNode, type SVGProps, useEffect, useId, useMemo, useRef, useState } from "react";
import { BoardCoordsProvider } from "./BoardCoordsContext";
import type { BoardViewBox } from "./types";

interface Props {
  /** SVG viewBox. The board's logical coordinate system; fix this per game. */
  viewBox: BoardViewBox;
  /** Accessibility label for the whole board. */
  "aria-label"?: string;
  /** Wrapper class (sizing belongs here — `w-full max-w-[720px] aspect-[720/1000]`). */
  className?: string;
  /** Children inside the <svg> (purely geometric content). */
  children: ReactNode;
  /**
   * Optional HTML overlay siblings of the <svg>. Rendered inside the coords
   * provider so <BoardOverlay> reads `surfaceSize` / `toScreen` correctly.
   * Use this for text-heavy widgets (HUD readouts, dropdowns, panels).
   */
  overlays?: ReactNode;
  /** Extra SVG-only attributes if needed (e.g. style). */
  svgProps?: Omit<SVGProps<SVGSVGElement>, "viewBox" | "ref" | "children" | "aria-label">;
}

/**
 * Root of the SVG board.
 *
 * Sizing: the *parent* element is responsible for width/height. Pass Tailwind
 * sizing through `className` here so the surface tracks its container.
 *
 * Coordinates: the viewBox is the source of truth. SVG children use viewBox
 * units; `overlays` (HTML siblings of the <svg>) are positioned via the
 * coords context (`<BoardOverlay>` reads it for you).
 *
 * BoardSurface generates per-instance IDs for the shared slot-fill gradients
 * and renders them automatically; <BoardSlot> picks the right one based on
 * its `variant` prop via context.
 */
export default function BoardSurface({
  viewBox,
  "aria-label": ariaLabel,
  className,
  children,
  overlays,
  svgProps,
}: Props) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const pilotId = useId();
  const copilotId = useId();
  const mixedId = useId();

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setSize({ width, height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const slotFillIds = useMemo(
    () => ({ pilot: pilotId, copilot: copilotId, mixed: mixedId }),
    [pilotId, copilotId, mixedId],
  );

  return (
    <div ref={wrapperRef} className={className} style={{ position: "relative" }}>
      <BoardCoordsProvider viewBox={viewBox} surfaceSize={size} slotFillIds={slotFillIds}>
        <svg
          {...svgProps}
          viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
          preserveAspectRatio="xMidYMid meet"
          role="application"
          aria-label={ariaLabel}
          style={{ display: "block", width: "100%", height: "100%", ...(svgProps?.style ?? {}) }}
        >
          <defs>
            <linearGradient id={pilotId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgb(20 38 122 / 0.85)" />
              <stop offset="100%" stopColor="rgb(58 85 216 / 0.85)" />
            </linearGradient>
            <linearGradient id={copilotId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgb(141 48 25 / 0.85)" />
              <stop offset="100%" stopColor="rgb(237 122 35 / 0.85)" />
            </linearGradient>
            <linearGradient id={mixedId} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="rgb(58 85 216 / 0.85)" />
              <stop offset="49%" stopColor="rgb(58 85 216 / 0.85)" />
              <stop offset="50%" stopColor="rgb(237 122 35 / 0.85)" />
              <stop offset="100%" stopColor="rgb(237 122 35 / 0.85)" />
            </linearGradient>
          </defs>
          {children}
        </svg>
        {overlays}
      </BoardCoordsProvider>
    </div>
  );
}
