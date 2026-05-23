import { useId } from "react";
import planeUrl from "../../assets/plane.svg";

interface PlaneProps {
  /** SVG positioning x — used when embedding the Plane in an outer SVG. */
  x?: number;
  /** SVG positioning y. */
  y?: number;
  /** SVG width attribute. */
  width?: number | string;
  /** SVG height attribute. */
  height?: number | string;
  /**
   * Rotation in degrees, applied around the plane's centre via an internal
   * `<g transform>` — NOT a CSS transform — so that any CSS transforms on
   * the outer `<svg>` (e.g. the tile's centering `translate(-50%, -50%)`)
   * still apply cleanly.
   */
  rotate?: number;
  /** Fill colour for the plane silhouette. Default white. */
  color?: string;
  className?: string;
}

// Square viewBox centred on the plane's VISUAL CENTROID, not its bbox centre.
// The silhouette's bbox is centred at (243.2, 365.4), but its mass centroid
// (measured from the source mask) sits lower, at (243.3, 397.2) — the plane
// is heavier toward the body/wings. Centring + rotating on the centroid keeps
// the plane visually put when rotated (otherwise ±45° swings the mass down
// and sideways). 540×540 still fits the plane at any rotation.
const PLANE_VIEWBOX = "-26.7 127.2 540 540";
const ROTATE_CENTER_X = 243.3;
const ROTATE_CENTER_Y = 397.2;

function parseHexRgb(hex: string): [number, number, number] {
  const s = hex.startsWith("#") ? hex.slice(1) : hex;
  const expanded =
    s.length === 3
      ? s
          .split("")
          .map((c) => c + c)
          .join("")
      : s;
  return [
    Number.parseInt(expanded.slice(0, 2), 16) / 255,
    Number.parseInt(expanded.slice(2, 4), 16) / 255,
    Number.parseInt(expanded.slice(4, 6), 16) / 255,
  ];
}

/**
 * Renders the cockpit aircraft silhouette. Recolours the source PNG via an
 * SVG `feColorMatrix` filter (every opaque pixel becomes uniform `color`),
 * and rotates internally so that callers can keep their own CSS transforms.
 */
export default function Plane({
  x,
  y,
  width,
  height,
  rotate = 0,
  color = "#ffffff",
  className,
}: PlaneProps) {
  const filterId = useId();
  const [r, g, b] = parseHexRgb(color);

  return (
    <svg
      x={x}
      y={y}
      width={width}
      height={height}
      viewBox={PLANE_VIEWBOX}
      preserveAspectRatio="xMidYMid meet"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <filter id={filterId} colorInterpolationFilters="sRGB">
          <feColorMatrix
            type="matrix"
            values={`0 0 0 0 ${r} 0 0 0 0 ${g} 0 0 0 0 ${b} 0 0 0 1 0`}
          />
        </filter>
      </defs>
      <g transform={`rotate(${rotate} ${ROTATE_CENTER_X} ${ROTATE_CENTER_Y})`}>
        <image
          href={planeUrl}
          x={0}
          y={0}
          width={487.5}
          height={731.25}
          filter={`url(#${filterId})`}
        />
      </g>
    </svg>
  );
}
