import { CITY_DATA } from "@boardgames/core/games/pandemic/city-graph";
import { getRoleDef } from "@boardgames/core/games/pandemic/roles";
import type { GameState } from "@boardgames/core/games/pandemic/types";
import { DISEASE_COLORS } from "@boardgames/core/games/pandemic/types";
import { DISEASE_FILL } from "../colors";

interface Props {
  state: GameState;
  cityId: string;
}

/**
 * Hover tooltip with per-city detail: name, cubes per color, research
 * station presence, and any players standing here. The parent positions
 * the wrapper absolutely (typically at the cursor or pinned to the
 * map corner); this component only owns its own chrome.
 *
 * Plain HTML so the text is selectable, screen-reader-friendly, and
 * not subject to the SVG viewBox's scaling — which would otherwise blow
 * small captions out of legibility on a zoomed-out board.
 */
export default function CityTooltip({ state, cityId }: Props) {
  const city = CITY_DATA.get(cityId);
  if (!city) return null;

  const cubes = state.cityCubes[cityId];
  const hasStation = state.researchStations.includes(cityId);
  const playersHere = state.players.filter((p) => p.location === cityId);
  const cubeRows = DISEASE_COLORS.filter((c) => cubes[c] > 0);

  return (
    <div
      role="tooltip"
      className="pointer-events-none w-44 rounded-md border border-white/15 bg-black/90 p-2 text-xs text-white shadow-lg shadow-black/60 backdrop-blur-sm"
    >
      <p className="text-sm font-semibold text-white">{city.name}</p>
      {cubeRows.length > 0 && (
        <ul className="mt-1 space-y-0.5">
          {cubeRows.map((color) => (
            <li key={color} className="flex items-center gap-1.5">
              <span
                className="inline-block h-2.5 w-2.5 rounded"
                style={{ backgroundColor: DISEASE_FILL[color] }}
              />
              <span className="text-2xs capitalize">
                {color}: {cubes[color]} cube{cubes[color] === 1 ? "" : "s"}
              </span>
            </li>
          ))}
        </ul>
      )}
      {hasStation && <p className="mt-1 text-2xs text-emerald-300">Research Station</p>}
      {playersHere.length > 0 && (
        <ul className="mt-1 space-y-0.5">
          {playersHere.map((p) => {
            const role = getRoleDef(p.role);
            return (
              <li key={p.id} className="flex items-center gap-1.5 text-2xs text-fg-secondary">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: role.pawnColor }}
                />
                <span>
                  Player {p.id + 1} · {role.name}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
