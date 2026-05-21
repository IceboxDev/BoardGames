import { CITY_DATA, getConnections } from "@boardgames/core/games/pandemic/city-graph";
import type { GameState } from "@boardgames/core/games/pandemic/types";
import { useMemo } from "react";
import { BoardSurface } from "../../../../components/board";
import { bgMapUrl } from "../../board-assets";
import CityNode from "./CityNode";
import Connection from "./Connection";
import {
  BOARD_VIEWBOX,
  CONNECTION_OPACITY,
  CONNECTION_STROKE,
  CONNECTION_STROKE_WIDTH,
  cityOrigin,
  REFERENCE_HEIGHT,
  REFERENCE_WIDTH,
} from "./geometry";

interface Props {
  state: GameState;
  hoveredCityId: string | null;
  selectedCityId: string | null;
  legalDestinations: ReadonlySet<string>;
  onCityClick: (cityId: string) => void;
  onCityHover: (cityId: string | null) => void;
}

/**
 * The whole Pandemic map as SVG. Layers from bottom to top:
 *   1. Map background image (geography, ocean shading).
 *   2. Connection lines (with wrap-around handling).
 *   3. One <CityNode> per city — owns dot, label, cubes, station, pawns,
 *      and all hit-testing for that city.
 *
 * Pawns and players-at-this-city are grouped per city at this level so
 * each CityNode receives a small `pawns` array rather than scanning the
 * whole player list.
 */
export default function PandemicMap({
  state,
  hoveredCityId,
  selectedCityId,
  legalDestinations,
  onCityClick,
  onCityHover,
}: Props) {
  const connections = useMemo(() => getConnections(), []);

  // Group players by city once per render. Iterating `CITY_DATA` and
  // referencing this map keeps the per-city slot O(1) instead of scanning
  // every player for every city.
  const playersByCity = useMemo(() => {
    const map = new Map<string, typeof state.players>();
    for (const player of state.players) {
      const list = map.get(player.location) ?? [];
      list.push(player);
      map.set(player.location, list);
    }
    return map;
  }, [state.players]);

  const stationSet = useMemo(() => new Set(state.researchStations), [state.researchStations]);

  return (
    <BoardSurface
      viewBox={BOARD_VIEWBOX}
      aria-label="Pandemic world map"
      className="relative h-full w-full"
    >
      {/* Background map artwork — rendered inside the SVG so it zooms /
          pans with the cities. The image element renders at the natural
          1920×1080 frame; CITY_DATA positions are already in that frame. */}
      <image
        href={bgMapUrl}
        x={0}
        y={0}
        width={REFERENCE_WIDTH}
        height={REFERENCE_HEIGHT}
        preserveAspectRatio="none"
      />

      {/* Connections under cities so dots / pawns / cubes draw above. */}
      <g>
        {connections.map((conn) => {
          const cityA = CITY_DATA.get(conn.cityA);
          const cityB = CITY_DATA.get(conn.cityB);
          if (!cityA || !cityB) return null;
          const a = cityOrigin(cityA.position);
          const b = cityOrigin(cityB.position);
          return (
            <Connection
              key={`${conn.cityA}-${conn.cityB}`}
              ax={a.x}
              ay={a.y}
              bx={b.x}
              by={b.y}
              loop={conn.loop}
              stroke={CONNECTION_STROKE}
              strokeWidth={CONNECTION_STROKE_WIDTH}
              opacity={CONNECTION_OPACITY}
            />
          );
        })}
      </g>

      {/* Cities on top — one focusable, clickable group per city. */}
      <g>
        {Array.from(CITY_DATA.values()).map((city) => (
          <CityNode
            key={city.id}
            city={city}
            cubes={state.cityCubes[city.id]}
            hasStation={stationSet.has(city.id)}
            pawns={playersByCity.get(city.id) ?? []}
            currentPlayerIndex={state.currentPlayerIndex}
            isLegalDestination={legalDestinations.has(city.id)}
            isHovered={hoveredCityId === city.id}
            isSelected={selectedCityId === city.id}
            onClick={onCityClick}
            onHoverChange={onCityHover}
          />
        ))}
      </g>
    </BoardSurface>
  );
}
