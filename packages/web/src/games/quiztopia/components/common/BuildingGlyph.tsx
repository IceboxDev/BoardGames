import type { SVGProps } from "react";
import { cn } from "../../../../lib/cn";
import type { BuildingName } from "../../bands";

// Twelve buildings drawn on a 100 × 140 portrait grid (ground at y = 140),
// in the same flat-silhouette language: one solid body in `currentColor`,
// windows as a second layer that GLOWS when the building is lit and reads as
// dark cut-outs when it is not, and a few low-contrast lines for texture
// (dome ribs, mullions, a roof seam). Some have a `front` layer drawn last
// in the body colour (the tree inside the greenhouse). The state is never
// colour alone — a dark building has dark windows, a lit one bright ones.

type Props = Omit<SVGProps<SVGSVGElement>, "name"> & {
  name: BuildingName;
  lit?: boolean;
  /** Square box the portrait glyph is fitted into (width and height). */
  size?: number | string;
  /**
   * "centered" (default): the drawing's own bounds are centred in the box,
   * so a low building (greenhouse, observatory) sits in the middle of an
   * icon bubble. "ground": the full 100 × 140 grid, every building standing
   * on the same ground line — for a skyline.
   */
  frame?: "centered" | "ground";
};

interface Shape {
  /** Highest y any part of the drawing reaches (the ground is y = 140). */
  top: number;
  body: string;
  windows: string;
  lines?: string;
  front?: string;
}

const rect = (x: number, y: number, w: number, h: number) => `M${x} ${y}h${w}v${h}h-${w}z`;
const grid = (xs: number[], ys: number[], w: number, h: number) =>
  ys.flatMap((y) => xs.map((x) => rect(x, y, w, h))).join("");
const arch = (x: number, top: number, w: number, bottom: number) =>
  `M${x} ${bottom}V${top}a${w / 2} ${w / 2} 0 0 1 ${w} 0V${bottom}z`;

const SHAPES: Record<BuildingName, Shape> = {
  "opera-house": {
    top: 36,
    body: [
      "M2 140V134H98V140Z",
      "M8 134V84H92V134Z",
      "M18 84C18 48 82 48 82 84Z",
      "M45 52H55V44H45Z",
      "M49 44V36H51V44Z",
    ].join(""),
    windows: [
      arch(22, 112, 16, 134),
      arch(42, 112, 16, 134),
      arch(62, 112, 16, 134),
      grid([14, 25, 36, 47, 58, 69, 80], [90], 6, 8),
    ].join(""),
    lines: "M30 60V84M50 50V84M70 60V84M8 84H92",
  },
  library: {
    top: 30,
    body: [
      "M2 140V134H98V140Z",
      "M6 134V128H94V134Z",
      "M8 70V62H92V70Z",
      "M4 62L50 30L96 62Z",
      ...[9, 23, 37, 57, 71, 85].map((x) => rect(x, 70, 6, 58)),
    ].join(""),
    windows: [
      rect(16, 96, 6, 28),
      rect(30, 96, 6, 28),
      rect(44, 92, 12, 36),
      rect(64, 96, 6, 28),
      rect(78, 96, 6, 28),
    ].join(""),
    lines: "M12 60L50 36L88 60",
  },
  museum: {
    top: 34,
    body: ["M6 140V72H58V140Z", "M30 72V42H94V72Z", "M68 140V92H94V140Z", "M40 42V34H66V42Z"].join(
      "",
    ),
    windows: [
      rect(36, 50, 52, 12),
      grid([12, 26, 40], [82, 100, 118], 10, 10),
      rect(74, 100, 4, 32),
      rect(84, 100, 4, 32),
    ].join(""),
  },
  cinema: {
    top: 12,
    body: [
      "M10 140V64H26V54H40V46H60V54H74V64H90V140Z",
      "M14 60V12H32V60Z",
      "M4 96H96V104H4Z",
      "M8 104V140H12V104Z",
      "M88 104V140H92V104Z",
    ].join(""),
    windows: [
      grid([18], [18, 28, 38, 48], 10, 6),
      grid([10, 18, 26, 34, 42, 50, 58, 66, 74, 82], [98.5], 3, 3),
      rect(40, 110, 8, 28),
      rect(52, 110, 8, 28),
      rect(44, 72, 12, 16),
      rect(66, 76, 14, 12),
      rect(32, 76, 8, 12),
    ].join(""),
  },
  stadium: {
    top: 30,
    body: [
      "M4 140V112C4 94 26 86 50 86C74 86 96 94 96 112V140Z",
      "M0 110C0 90 24 80 50 80C76 80 100 90 100 110L96 112C96 96 74 88 50 88C26 88 4 96 4 112Z",
      "M12 82V36H15V82Z",
      "M85 82V36H88V82Z",
      "M6 30H21V37H6Z",
      "M79 30H94V37H79Z",
    ].join(""),
    windows: [
      rect(8, 32, 11, 3),
      rect(81, 32, 11, 3),
      ...[10, 27, 44, 61, 78].map((x) => arch(x, 124, 12, 140)),
    ].join(""),
    lines: "M4 112H96",
  },
  "town-hall": {
    top: 0,
    body: [
      "M4 140V88H96V140Z",
      "M4 88L12 78H88L96 88Z",
      "M35 88V42H65V88Z",
      "M33 42L50 12L67 42Z",
      "M49 12V0H51V12Z",
      "M51 2H62V8H51Z",
    ].join(""),
    windows: [
      "M50 56m-7 0a7 7 0 1 0 14 0a7 7 0 1 0-14 0",
      rect(46, 72, 8, 12),
      grid([9, 18, 27, 67, 76, 85], [96, 114], 6, 10),
      rect(45, 122, 10, 18),
    ].join(""),
    lines: "M35 88H65",
  },
  exchange: {
    top: 2,
    body: [
      "M10 140V100H26V140Z",
      "M74 140V100H90V140Z",
      "M26 140V22H74V140Z",
      "M32 22V14H68V22Z",
      "M49 14V2H51V14Z",
    ].join(""),
    windows: [
      grid([31, 43, 55], [28, 40, 52, 64, 76, 100, 112, 124], 8, 8),
      rect(26, 88, 48, 6),
      rect(14, 108, 8, 24),
      rect(78, 108, 8, 24),
    ].join(""),
    lines: "M26 22H74",
  },
  temple: {
    top: 26,
    body: [
      "M8 140V90H72V140Z",
      "M12 90C12 58 68 58 68 90Z",
      "M39 62H41V50H39Z",
      "M40 48m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0",
      "M76 140V54H92V140Z",
      "M73 54L84 34L95 54Z",
      "M83 34H85V26H83Z",
    ].join(""),
    windows: [
      arch(32, 112, 16, 140),
      arch(16, 108, 10, 126),
      arch(54, 108, 10, 126),
      grid([81], [62, 86, 110], 6, 14),
    ].join(""),
    lines: "M26 66V90M40 60V90M54 66V90",
  },
  laboratory: {
    top: 26,
    body: [
      "M4 140V82H62V140Z",
      "M12 82V56H20V82Z",
      "M60 140V80H90V140Z",
      "M58 80C58 60 92 60 92 80Z",
      "M70 62V30H80V62Z",
      "M67 30H83V26H67Z",
    ].join(""),
    windows: [
      grid([10, 24, 38], [90, 106, 122], 9, 9),
      "M50 90H56V95H61V101H56V106H50V101H45V95H50Z",
      "M70 74m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0",
      "M80 68m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0",
      rect(70, 96, 4, 32),
      rect(80, 96, 4, 32),
    ].join(""),
  },
  observatory: {
    top: 72,
    body: [
      "M0 140C14 124 34 118 56 116C78 114 92 122 100 140Z",
      "M30 118V96H70V118Z",
      "M28 96C28 64 72 64 72 96Z",
      "M72 118V106H92V118Z",
    ].join(""),
    windows: [rect(46, 68, 8, 28), rect(46, 106, 8, 12), rect(78, 109, 8, 5)].join(""),
    lines: "M32 84C40 78 60 78 68 84",
  },
  greenhouse: {
    top: 50,
    body: "M4 140V86L50 50L96 86V140Z",
    windows: [
      grid([10, 26, 42, 58, 74], [92, 110], 12, 14),
      grid([10, 26, 42, 58, 74], [128], 12, 8),
      "M12 84L48 56V68L22 84Z",
      "M52 56L88 84H78L52 68Z",
    ].join(""),
    lines: "M22 86V140M38 86V140M54 86V140M70 86V140M86 86V140M4 108H96M4 126H96M50 50V86",
    front: "M47 134H53V116H47ZM50 118C36 118 36 96 50 96C64 96 64 118 50 118Z",
  },
  "data-centre": {
    top: 10,
    body: [
      "M8 140V72H92V140Z",
      "M14 72V60H30V72Z",
      "M36 72V60H52V72Z",
      "M74 72V10H77V72Z",
      "M62 46C58 32 72 20 86 26L74 48Z",
    ].join(""),
    windows: [
      grid([14, 22, 30, 38, 46, 54, 62, 70, 78], [82, 92, 102], 4, 4),
      rect(14, 120, 72, 8),
      rect(46, 130, 8, 10),
    ].join(""),
    lines: "M75 12L62 72M75 12L88 72",
  },
};

/** A square viewBox around the drawing's bounds, centred both ways. */
function centeredViewBox(top: number): string {
  const h = 140 - top;
  const side = Math.max(100, h);
  return `${50 - side / 2} ${top + h / 2 - side / 2} ${side} ${side}`;
}

export function BuildingGlyph({
  name,
  lit = false,
  size = 24,
  frame = "centered",
  className,
  ...rest
}: Props) {
  const shape = SHAPES[name];
  return (
    <svg
      viewBox={frame === "ground" ? "0 0 100 140" : centeredViewBox(shape.top)}
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      className={className}
      {...rest}
    >
      <path d={shape.body} fill="currentColor" />
      {shape.lines && (
        <path
          d={shape.lines}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          className="text-surface-950"
          opacity={0.3}
        />
      )}
      <path
        d={shape.windows}
        className={cn(lit ? "fill-amber-100" : "fill-surface-950")}
        opacity={lit ? 0.95 : 0.55}
      />
      {shape.front && <path d={shape.front} fill="currentColor" />}
    </svg>
  );
}
