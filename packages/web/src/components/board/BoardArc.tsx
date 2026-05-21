import { type CSSProperties, useId } from "react";
import { arcPathFromCenter } from "./svg-paths";
import type { BoardPoint } from "./types";

export interface ArcLabel {
  /** Position along the arc, 0..1 (start..end). */
  at: number;
  text: string;
  className?: string;
  fontSize?: number;
}

interface Props {
  /** Centre of the arc's circle (viewBox units). */
  center: BoardPoint;
  /** Arc radius (viewBox units). */
  radius: number;
  /** Start angle in degrees (0 = east, clockwise). */
  startDeg: number;
  /** End angle in degrees. */
  endDeg: number;
  /** Stroke width of the band. */
  thickness?: number;
  /** Band stroke colour (default: instrument black). */
  stroke?: string;
  /** Optional fill — usually leave undefined; arcs are bands. */
  fill?: string;
  /** Labels along the arc via SVG <textPath>. */
  labels?: ArcLabel[];
  /** Default label font size if not set per-label. */
  labelFontSize?: number;
  /** Default label class (e.g. `fill-white font-bold`). */
  labelClassName?: string;
  /** Per-element style override (for filters etc.). */
  style?: CSSProperties;
}

/**
 * A circular-arc band with optional curved text labels. The path is rendered
 * twice: once as the visible band, once invisibly with a stable id so
 * <textPath> can reference it.
 */
export default function BoardArc({
  center,
  radius,
  startDeg,
  endDeg,
  thickness = 24,
  stroke = "#15191d",
  fill,
  labels,
  labelFontSize = 18,
  labelClassName,
  style,
}: Props) {
  const pathId = useId();
  const d = arcPathFromCenter(center, radius, startDeg, endDeg);

  return (
    <g style={style}>
      <defs>
        <path id={pathId} d={d} />
      </defs>
      <path
        d={d}
        fill={fill ?? "none"}
        stroke={stroke}
        strokeWidth={thickness}
        strokeLinecap="butt"
      />
      {labels?.map((label, i) => (
        <text
          // biome-ignore lint/suspicious/noArrayIndexKey: labels are static, ordered, never reordered
          key={`${label.text}-${i}`}
          className={label.className ?? labelClassName}
          fontSize={label.fontSize ?? labelFontSize}
          fill="white"
          fontWeight={900}
          paintOrder="stroke"
          stroke="rgb(0 0 0 / 0.55)"
          strokeWidth={3}
        >
          <textPath
            href={`#${pathId}`}
            startOffset={`${Math.max(0, Math.min(1, label.at)) * 100}%`}
            textAnchor="middle"
          >
            {label.text}
          </textPath>
        </text>
      ))}
    </g>
  );
}
