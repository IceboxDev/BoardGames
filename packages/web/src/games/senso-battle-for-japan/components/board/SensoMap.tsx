import type { SensoPlayerView } from "@boardgames/core/games/senso-battle-for-japan/types";
import { lazy, Suspense, useMemo, useRef } from "react";
import { BoardSurface } from "../../../../components/board";
import mapUrl from "../../assets/map.webp";
import mapPortraitUrl from "../../assets/map-portrait.webp";
import { type HighlightKind, MAP_ROUTE_HALO, MAP_ROUTE_INK } from "../../colors";
import { type CubeMap, type CubePosition, reconcileCubeIds } from "../../logic/cube-identity";
import { useMapPlacements } from "./adjust/use-map-placements";
import CubeLayer from "./CubeLayer";
import { buildLayout, HIT_INSET, inflate, type MapOrientation, squareRect } from "./geometry";
import MapTarget from "./MapTarget";
import { useMapOrientation } from "./orientation";
import RegionNode from "./RegionNode";

// Dev-only: the drag/resize tooling that fixes the region placements. The
// import is dead code in production, so the chunk never ships.
const MapAdjustTools = import.meta.env.DEV ? lazy(() => import("./adjust/MapAdjustTools")) : null;

// Warm the painting as soon as this module loads — while the setup screen or
// the lobby is up — so the board never paints before its map. Without this
// the request only started when the first board mounted (3.5 s into a
// preview load, and only after the WebSocket session in a real game).
const MAP_URLS: Record<MapOrientation, string> = { landscape: mapUrl, portrait: mapPortraitUrl };
if (typeof Image !== "undefined") {
  for (const url of Object.values(MAP_URLS)) {
    const warm = new Image();
    warm.decoding = "async";
    warm.src = url;
  }
}

/** A legal target to draw: a whole region (`square` undefined) or one square. */
export interface MapTargetSpec {
  id: string;
  kind: HighlightKind;
  region: number;
  square?: number;
  label: string;
  selected?: boolean;
}

interface Props {
  view: Pick<SensoPlayerView, "board" | "affected" | "players">;
  targets?: readonly MapTargetSpec[];
  onTarget?: (id: string) => void;
  ghost?: CubePosition | null;
  /** Who locked each region, for the Affected marker tooltip. */
  affectedLabel?: (seat: number) => string;
  /** Force a layout (the dev preview); defaults to the viewport. */
  orientation?: MapOrientation;
  className?: string;
}

/**
 * The painting of Japan with the region cards on it. Layers, bottom to top:
 * the map image (an HTML <img> under the SVG — portrait gets a pre-rotated
 * file), the adjacency routes, the region cards, the legal-target rings, the
 * cubes — and, in dev with `?adjust` in the URL, the placement tooling.
 */
export default function SensoMap({
  view,
  targets = [],
  onTarget,
  ghost,
  affectedLabel,
  orientation,
  className,
}: Props) {
  const resolved = useMapOrientation(orientation);
  const adjust = useMapPlacements(resolved);
  const layout = useMemo(
    () => buildLayout(resolved, adjust?.placements),
    [resolved, adjust?.placements],
  );

  const prevCubes = useRef<CubeMap | null>(null);
  const cubes = useMemo(() => {
    const next = reconcileCubeIds(prevCubes.current, view.board);
    prevCubes.current = next;
    return next;
  }, [view.board]);

  const affectedBy = useMemo(() => {
    const map = new Map<number, string>();
    for (const a of view.affected) {
      map.set(a.region, affectedLabel ? affectedLabel(a.by) : `seat ${a.by + 1}`);
    }
    return map;
  }, [view.affected, affectedLabel]);

  return (
    <BoardSurface
      viewBox={layout.viewBox}
      aria-label="Sensō map of Japan"
      className={className ?? "h-full w-full"}
      underlay={
        // `object-contain` centres the painting exactly where the `meet`
        // viewBox sits, whatever box the surface is given.
        <img
          data-layer="map"
          src={MAP_URLS[resolved]}
          alt=""
          aria-hidden="true"
          decoding="async"
          draggable={false}
          className="pointer-events-none absolute inset-0 h-full w-full select-none object-contain"
        />
      }
    >
      <g aria-hidden data-layer="edges">
        {layout.edges.map((e) => (
          <g key={e.key}>
            <line
              x1={e.a.x}
              y1={e.a.y}
              x2={e.b.x}
              y2={e.b.y}
              stroke={MAP_ROUTE_HALO}
              strokeWidth={7}
              strokeLinecap="round"
            />
            <line
              x1={e.a.x}
              y1={e.a.y}
              x2={e.b.x}
              y2={e.b.y}
              stroke={MAP_ROUTE_INK}
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeDasharray="7 6"
              opacity={0.8}
            />
          </g>
        ))}
      </g>
      <g data-layer="regions">
        {layout.nodes.map((node) => (
          <RegionNode
            key={node.region}
            node={node}
            affectedBy={affectedBy.get(node.region) ?? null}
            empty={view.board[node.region].map((c) => c === null)}
          />
        ))}
      </g>
      <g data-layer="targets">
        {targets.map((t) => (
          <MapTarget
            key={t.id}
            id={t.id}
            bounds={
              t.square === undefined
                ? layout.nodes[t.region].bounds
                : inflate(squareRect(layout, t.region, t.square), -HIT_INSET)
            }
            label={t.label}
            kind={t.kind}
            selected={t.selected}
            onSelect={() => onTarget?.(t.id)}
          />
        ))}
      </g>
      <CubeLayer cubes={cubes} layout={layout} ghost={ghost} />
      {MapAdjustTools && adjust && (
        <Suspense fallback={null}>
          <MapAdjustTools layout={layout} adjust={adjust} />
        </Suspense>
      )}
    </BoardSurface>
  );
}
