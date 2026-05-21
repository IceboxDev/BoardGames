import type { CityData, CubeCounts, PlayerState } from "@boardgames/core/games/pandemic/types";
import type { KeyboardEvent } from "react";
import { DISEASE_ACCENT, DISEASE_STROKE } from "../../colors";
import DiseaseCubes from "./DiseaseCubes";
import {
  CITY_DOT_RADIUS,
  CITY_DOT_STROKE,
  CUBE_STACK_OFFSET_Y,
  cityOrigin,
  HIGHLIGHT_RING_FILL,
  HIGHLIGHT_RING_RADIUS,
  HIGHLIGHT_RING_STROKE,
  HOVER_RING_STROKE,
  STATION_OFFSET_Y,
} from "./geometry";
import PlayerPawns from "./PlayerPawns";
import ResearchStation from "./ResearchStation";

interface Props {
  city: CityData;
  cubes: CubeCounts;
  hasStation: boolean;
  pawns: PlayerState[];
  currentPlayerIndex: number;
  /** Glow as a legal-destination target (filled green ring). */
  isLegalDestination: boolean;
  /** Brighter ring under the hover tooltip. */
  isHovered: boolean;
  /** Dashed ring marking a selected city (e.g. during a destination pick). */
  isSelected: boolean;
  onClick: (cityId: string) => void;
  onHoverChange: (cityId: string | null) => void;
}

/**
 * One city on the map. Owns:
 *   - The colored dot.
 *   - A label below the dot (HTML overlays could be more legible, but
 *     keeping it inside the SVG lets the map zoom respond identically to
 *     the dot).
 *   - The cube stack, the station, and the pawn(s) standing here.
 *   - Click + hover handlers — every interaction with the map starts
 *     here. Replaces the canvas-era hit-test math entirely.
 */
export default function CityNode({
  city,
  cubes,
  hasStation,
  pawns,
  currentPlayerIndex,
  isLegalDestination,
  isHovered,
  isSelected,
  onClick,
  onHoverChange,
}: Props) {
  const { x, y } = cityOrigin(city.position);

  function handleKey(e: KeyboardEvent<SVGGElement>) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick(city.id);
    }
  }

  return (
    // biome-ignore lint/a11y/useSemanticElements: <g role="button"> is the standard ARIA pattern for an interactive SVG region — an HTML <button> can't host SVG children
    <g
      transform={`translate(${x}, ${y})`}
      onClick={() => onClick(city.id)}
      onMouseEnter={() => onHoverChange(city.id)}
      onMouseLeave={() => onHoverChange(null)}
      onFocus={() => onHoverChange(city.id)}
      onBlur={() => onHoverChange(null)}
      onKeyDown={handleKey}
      role="button"
      tabIndex={0}
      aria-label={city.name}
      style={{ cursor: "pointer", outline: "none" }}
    >
      {/* Legal-destination glow renders behind the dot so it reads as a halo. */}
      {isLegalDestination && (
        <circle
          r={HIGHLIGHT_RING_RADIUS}
          fill={HIGHLIGHT_RING_FILL}
          stroke={HIGHLIGHT_RING_STROKE}
          strokeWidth={2}
          // Reduced motion-safe pulse via stroke-opacity animation handled in CSS
          // would be ideal; for now a static halo keeps the SVG fully declarative.
        />
      )}
      {isHovered && !isSelected && (
        <circle r={CITY_DOT_RADIUS + 4} fill="none" stroke={HOVER_RING_STROKE} strokeWidth={2.5} />
      )}
      {isSelected && (
        <circle
          r={CITY_DOT_RADIUS + 6}
          fill="none"
          stroke="rgba(250, 204, 21, 0.95)"
          strokeWidth={2.5}
          strokeDasharray="6 4"
        />
      )}
      <circle
        r={CITY_DOT_RADIUS}
        fill={DISEASE_ACCENT[city.color]}
        stroke={DISEASE_STROKE[city.color]}
        strokeWidth={CITY_DOT_STROKE}
      />
      <text
        x={0}
        y={CITY_DOT_RADIUS + 14}
        fill="#f8fafc"
        fontSize={13}
        fontWeight={600}
        textAnchor="middle"
        dominantBaseline="hanging"
        style={{
          pointerEvents: "none",
          userSelect: "none",
          paintOrder: "stroke fill",
          stroke: "rgba(0,0,0,0.9)",
          strokeWidth: 3,
          strokeLinejoin: "round",
        }}
      >
        {city.name}
      </text>
      {hasStation && (
        <g transform={`translate(0, ${-STATION_OFFSET_Y})`}>
          <ResearchStation />
        </g>
      )}
      <g transform={`translate(0, ${CUBE_STACK_OFFSET_Y})`}>
        <DiseaseCubes cubes={cubes} />
      </g>
      <g transform={`translate(0, ${-CITY_DOT_RADIUS - 18})`}>
        <PlayerPawns players={pawns} currentPlayerIndex={currentPlayerIndex} />
      </g>
    </g>
  );
}
