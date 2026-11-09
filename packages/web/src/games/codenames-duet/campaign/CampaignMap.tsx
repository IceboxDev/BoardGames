import {
  CITY_IDS,
  type CityId,
  missionConfig,
  ROUTES,
} from "@boardgames/core/games/codenames-duet/campaign/map";
import type {
  CampaignProgress,
  CityStatus,
} from "@boardgames/core/games/codenames-duet/campaign/progress";
import { cityStatus } from "@boardgames/core/games/codenames-duet/campaign/progress";
import { useEffect, useRef, useState } from "react";
import { cn } from "../../../lib/cn";
import { cityName, missionNumbers } from "./mission-copy";
import { CITY_POINTS, LAND_PATH, MAP_HEIGHT, MAP_WIDTH } from "./world-map.gen";

// The mission map as declarative SVG (docs/intricate-board-rendering.md):
// land, the printed routes and the 26 cities, each labelled the way the sheet
// is ("Paris 11–0"). Green = cleared, a gold ring = open now, grey = locked.
// Labels keep one on-screen size whatever the map's width (the geometry is in
// a 1000-wide viewBox), and a narrow map labels only the cities in play.

/** Room around the 1000×520 drawing for the outermost labels. */
const VIEW_BOX = `-8 -34 ${MAP_WIDTH + 16} ${MAP_HEIGHT + 48}`;

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setWidth(el.getBoundingClientRect().width);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

function arc(a: CityId, b: CityId): string {
  const A = CITY_POINTS[a];
  const B = CITY_POINTS[b];
  const dx = B.x - A.x;
  const dy = B.y - A.y;
  const d = Math.hypot(dx, dy);
  const bend = (d > 300 ? 0.14 : 0.1) * (dx < 0 ? -1 : 1);
  const cx = (A.x + B.x) / 2 - dy * bend;
  const cy = (A.y + B.y) / 2 + dx * bend - d * 0.02;
  return `M${A.x},${A.y} Q${cx.toFixed(1)},${cy.toFixed(1)} ${B.x},${B.y}`;
}

const ROUTE_CLASS: Record<"done" | "open" | "locked", string> = {
  done: "stroke-cn-green [stroke-width:2.2]",
  open: "stroke-accent-400/70 [stroke-dasharray:5_5] [stroke-width:1.4]",
  locked: "stroke-line-strong [stroke-dasharray:2_4] [stroke-width:1.2]",
};

const DOT_CLASS: Record<CityStatus, string> = {
  cleared: "fill-cn-green stroke-cn-green",
  open: "fill-surface-950 stroke-accent-400 [stroke-width:2.2]",
  locked: "fill-surface-950 stroke-line-strong",
};

const NAME_CLASS: Record<CityStatus, string> = {
  cleared: "fill-fg-primary",
  open: "fill-fg-strong",
  locked: "fill-fg-muted",
};

const NUMS_CLASS: Record<CityStatus, string> = {
  cleared: "fill-emerald-300",
  open: "fill-accent-300",
  locked: "fill-fg-disabled",
};

export function CampaignMap({
  progress,
  selected,
  onSelect,
  className,
}: {
  progress: CampaignProgress;
  selected: CityId | null;
  /** Open and cleared cities are pickable; omit for a map you only look at. */
  onSelect?: (city: CityId) => void;
  className?: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  // viewBox units per CSS pixel, so text and dots keep their on-screen size.
  const unit = (MAP_WIDTH + 16) / Math.max(width || MAP_WIDTH, 280);
  const font = Math.min(12.5 * unit, 34);
  const r = Math.min(5.5 * unit, 14);
  const gap = r + 3 * unit;
  const narrow = width > 0 && width < 640;

  const status = (id: CityId) => cityStatus(id, progress);
  const routeStatus = (a: CityId, b: CityId) => {
    const sa = progress.cleared.has(a);
    const sb = progress.cleared.has(b);
    return sa && sb ? "done" : sa || sb ? "open" : "locked";
  };
  const order = { locked: 0, open: 1, done: 2 } as const;
  const routes = [...ROUTES].sort(
    ([a, b], [c, d]) => order[routeStatus(a, b)] - order[routeStatus(c, d)],
  );

  return (
    <div ref={ref} className={cn("w-full", className)}>
      <svg
        viewBox={VIEW_BOX}
        role="img"
        aria-label={`Mission map: ${progress.cleared.size} of 26 cities cleared`}
        className="block h-auto w-full select-none"
      >
        <path d={LAND_PATH} className="fill-fill-strong stroke-line-soft [stroke-width:0.6]" />
        {routes.map(([a, b]) => (
          <path
            key={`${a}-${b}`}
            d={arc(a, b)}
            vectorEffect="non-scaling-stroke"
            className={cn("fill-none [stroke-linecap:round]", ROUTE_CLASS[routeStatus(a, b)])}
          />
        ))}
        {CITY_IDS.map((id) => {
          const p = CITY_POINTS[id];
          const st = status(id);
          const isSelected = selected === id;
          const pickable = onSelect !== undefined && st !== "locked";
          const showLabel = !narrow || st !== "locked" || isSelected;
          let lx = p.x;
          let ly = p.y - font * 0.15;
          let anchor: "start" | "end" | "middle" = "middle";
          if (p.label === "r") {
            lx = p.x + gap;
            anchor = "start";
          } else if (p.label === "l") {
            lx = p.x - gap;
            anchor = "end";
          } else if (p.label === "t") {
            ly = p.y - gap - font * 1.05;
          } else {
            ly = p.y + gap + font * 0.85;
          }
          const { timerTokens, mistakes } = missionConfig(id);
          return (
            // biome-ignore lint/a11y/noStaticElementInteractions: an SVG group; keyboard handled below with role=button when pickable
            <g
              key={id}
              role={pickable ? "button" : undefined}
              tabIndex={pickable ? 0 : undefined}
              aria-label={`${cityName(id)}, ${timerTokens} turns, ${mistakes} free mistakes, ${st}${isSelected ? ", chosen" : ""}`}
              onClick={pickable ? () => onSelect(id) : undefined}
              onKeyDown={
                pickable
                  ? (e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onSelect(id);
                      }
                    }
                  : undefined
              }
              className={cn("group outline-none", pickable && "cursor-pointer")}
            >
              <circle cx={p.x} cy={p.y} r={r * 2.6} className="fill-transparent" />
              <circle
                cx={p.x}
                cy={p.y}
                r={r + 4.5 * unit}
                vectorEffect="non-scaling-stroke"
                className={cn(
                  "fill-none stroke-accent-300 [stroke-width:2]",
                  isSelected ? "opacity-100" : "opacity-0 group-focus-visible:opacity-100",
                )}
              />
              <circle
                cx={p.x}
                cy={p.y}
                r={id === "prague" ? r * 1.15 : r}
                vectorEffect="non-scaling-stroke"
                className={cn("[stroke-width:1.6]", DOT_CLASS[st])}
              />
              {st === "cleared" && (
                <path
                  d={`M${p.x - r * 0.45},${p.y + r * 0.02} l${r * 0.32},${r * 0.32} l${r * 0.6},${-r * 0.62}`}
                  vectorEffect="non-scaling-stroke"
                  className="fill-none stroke-white [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:1.6]"
                />
              )}
              {showLabel && (
                <text
                  x={lx}
                  y={ly}
                  fontSize={font}
                  textAnchor={anchor}
                  className={cn(
                    "font-card font-semibold stroke-surface-950 [paint-order:stroke] [stroke-linejoin:round] [stroke-width:3px]",
                    NAME_CLASS[st],
                  )}
                >
                  {cityName(id)}
                  <tspan
                    x={lx}
                    dy={font * 1.05}
                    fontSize={font * 0.95}
                    className={cn("font-bold tabular-nums", NUMS_CLASS[st])}
                  >
                    {missionNumbers(id)}
                  </tspan>
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
