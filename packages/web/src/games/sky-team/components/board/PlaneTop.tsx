interface PlaneTopProps {
  /** SVG positioning x — used when embedding in an outer SVG. */
  x?: number;
  /** SVG positioning y. */
  y?: number;
  /** SVG width attribute. */
  width?: number | string;
  /** SVG height attribute. */
  height?: number | string;
  /** Rotation in degrees around the silhouette centre (0 = nose up). */
  rotate?: number;
  /** Fill colour. Default white. */
  color?: string;
  className?: string;
}

// Source: transport-airplane-top-view-silhouette.svg (potrace output,
// 512×512 with the usual translate/scale flip). Inlined as a single path so
// it recolours via `fill` — no raster, no filter tricks.
const PLANE_TOP_PATH =
  "M2495 4811 c-40 -24 -80 -72 -112 -134 -60 -120 -57 -93 -63 -606 l-5 " +
  "-474 -265 -183 -265 -183 -5 89 c-5 96 -14 114 -62 125 -22 6 -33 1 -58 " +
  "-23 l-30 -30 0 -134 0 -134 -217 -151 -218 -150 -5 122 c-4 102 -8 127 -24 " +
  "144 -26 28 -79 28 -106 -1 -19 -20 -20 -35 -20 -197 l0 -176 -413 -285 " +
  "-412 -285 -3 -129 -3 -128 23 4 c13 3 353 123 757 267 l734 261 165 -2 " +
  "166 -3 13 -69 c34 -185 112 -327 215 -393 l38 -23 0 -435 0 -435 -330 " +
  "-292 -329 -293 -1 -93 0 -92 28 6 c15 4 217 60 450 124 l422 117 426 -118 " +
  "c234 -64 437 -120 450 -123 l24 -6 0 92 -1 93 -329 293 -330 292 0 435 0 " +
  "435 38 23 c103 66 181 208 215 393 l13 69 166 3 166 2 745 -265 c409 -146 " +
  "750 -265 756 -265 8 0 11 35 9 128 l-3 127 -412 285 -413 285 0 176 c0 162 " +
  "-1 177 -20 197 -27 29 -80 29 -106 1 -16 -17 -20 -42 -24 -144 l-5 -122 " +
  "-217 150 -218 151 0 134 0 134 -30 30 c-25 24 -36 29 -58 23 -48 -11 -57 " +
  "-29 -62 -125 l-5 -89 -267 185 -268 185 0 453 c0 495 0 498 -61 618 -70 " +
  "138 -161 190 -244 139z";

// The silhouette fills the full 512 box (wingspan edge to edge), so any
// rotation would clip at the corners. Pad the viewBox to the rotated extent
// (512·√2 ≈ 724) centred on the box middle — callers size against this
// padded square, where the plane occupies ~70% of the side.
const PAD = 106;
const VIEWBOX = `${-PAD} ${-PAD} ${512 + 2 * PAD} ${512 + 2 * PAD}`;

/**
 * Top-view airliner silhouette (nose up at rotate=0). Counterpart to the
 * front-view `Plane` used on the axis dial — this one is for map-like
 * surfaces (approach track, traffic indicators) where aircraft are seen
 * from above.
 */
export default function PlaneTop({
  x,
  y,
  width,
  height,
  rotate = 0,
  color = "#ffffff",
  className,
}: PlaneTopProps) {
  return (
    <svg
      x={x}
      y={y}
      width={width}
      height={height}
      viewBox={VIEWBOX}
      preserveAspectRatio="xMidYMid meet"
      className={className}
      aria-hidden="true"
    >
      <g transform={`rotate(${rotate} 256 256)`}>
        <g transform="translate(0,512) scale(0.1,-0.1)" fill={color} stroke="none">
          <path d={PLANE_TOP_PATH} />
        </g>
      </g>
    </svg>
  );
}
