import type { SensoPlayerView } from "@boardgames/core/games/senso-battle-for-japan/types";
import { useMemo, useRef } from "react";
import { BoardSurface } from "../../../../components/board";
import { type HighlightKind, MAP_EDGE_STROKE } from "../../colors";
import { type CubeMap, type CubePosition, reconcileCubeIds } from "../../logic/cube-identity";
import CubeLayer from "./CubeLayer";
import { HIT_INSET, inflate, LAYOUTS, type MapOrientation, squareRect } from "./geometry";
import MapTarget from "./MapTarget";
import { useMapOrientation } from "./orientation";
import RegionNode from "./RegionNode";

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

export default function SensoMap({
  view,
  targets = [],
  onTarget,
  ghost,
  affectedLabel,
  orientation,
  className,
}: Props) {
  const layout = LAYOUTS[useMapOrientation(orientation)];

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
    >
      <g aria-hidden data-layer="edges">
        {layout.edges.map((e) => (
          <line
            key={e.key}
            x1={e.a.x}
            y1={e.a.y}
            x2={e.b.x}
            y2={e.b.y}
            stroke={MAP_EDGE_STROKE}
            strokeWidth={6}
            strokeLinecap="round"
            opacity={0.55}
          />
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
    </BoardSurface>
  );
}
