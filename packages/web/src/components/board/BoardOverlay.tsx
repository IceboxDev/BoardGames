import type { CSSProperties, ReactNode } from "react";
import type { BoardPoint } from "./types";
import { useBoardCoords } from "./use-board-coords";

export type BoardOverlayAnchor =
  | "top-left"
  | "top-center"
  | "top-right"
  | "center-left"
  | "center"
  | "center-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

const ANCHOR_TRANSFORM: Record<BoardOverlayAnchor, string> = {
  "top-left": "translate(0%, 0%)",
  "top-center": "translate(-50%, 0%)",
  "top-right": "translate(-100%, 0%)",
  "center-left": "translate(0%, -50%)",
  center: "translate(-50%, -50%)",
  "center-right": "translate(-100%, -50%)",
  "bottom-left": "translate(0%, -100%)",
  "bottom-center": "translate(-50%, -100%)",
  "bottom-right": "translate(-100%, -100%)",
};

interface Props {
  /** Viewbox coordinate to anchor at. */
  at: BoardPoint;
  /** Which corner/edge of the overlay sits on `at`. Default: center. */
  anchor?: BoardOverlayAnchor;
  /** Optional fixed width in viewBox units. The overlay scales with the board. */
  width?: number;
  /** Optional fixed height in viewBox units. */
  height?: number;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}

/**
 * Renders an absolute-positioned HTML island whose top-left is anchored to
 * a viewBox coordinate. Width/height accept viewBox units; the HTML scales
 * with the board surface.
 *
 * Use this for text-heavy widgets (HUD readouts, coffee mug rows, dropdowns).
 * Keep purely-geometric stuff inside the SVG.
 */
export default function BoardOverlay({
  at,
  anchor = "center",
  width,
  height,
  className,
  style,
  children,
}: Props) {
  const { toScreen, surfaceSize, viewBox } = useBoardCoords();
  if (!surfaceSize) return null;

  const { x, y } = toScreen(at);
  const scale = surfaceSize.width / viewBox.width;
  const pxWidth = width != null ? width * scale : undefined;
  const pxHeight = height != null ? height * scale : undefined;

  return (
    <div
      className={className}
      style={{
        position: "absolute",
        left: `${x}px`,
        top: `${y}px`,
        transform: ANCHOR_TRANSFORM[anchor],
        width: pxWidth ? `${pxWidth}px` : undefined,
        height: pxHeight ? `${pxHeight}px` : undefined,
        pointerEvents: "auto",
        ...style,
      }}
    >
      {children}
    </div>
  );
}
