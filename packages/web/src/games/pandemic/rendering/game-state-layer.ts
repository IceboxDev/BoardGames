import { CITY_DATA } from "@boardgames/core/games/pandemic/city-graph";
import { getRoleDef } from "@boardgames/core/games/pandemic/roles";
import type { DiseaseColor, GameState } from "@boardgames/core/games/pandemic/types";
import { DISEASE_COLORS } from "@boardgames/core/games/pandemic/types";
import type { HitRegion } from "./hit-test";
import type { RenderLayer, Viewport } from "./renderer";

const CITYTEXT_WIDTH = 150;
const CITYSPACE_SIZE = 50;
const CUBE_SIZE = 10;
const CUBE_GAP = 2;
const PAWN_RADIUS = 10;
const STATION_SIZE = 16;

const DISEASE_CSS: Record<DiseaseColor, string> = {
  blue: "#4488ff",
  yellow: "#ffcc00",
  black: "#333333",
  red: "#ff3333",
};

export function createGameStateLayer(stateRef: { current: GameState | null }): RenderLayer {
  return {
    id: "gameState",
    zIndex: 10,
    dirty: true,

    render(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
      const state = stateRef.current;
      if (!state) return;

      ctx.save();
      ctx.translate(viewport.offsetX, viewport.offsetY);
      ctx.scale(viewport.scale, viewport.scale);

      // Render disease cubes and research stations for each city
      for (const [cityId, cubes] of Object.entries(state.cityCubes)) {
        const city = CITY_DATA.get(cityId);
        if (!city) continue;

        const cx = city.position[0] + CITYTEXT_WIDTH / 2;
        const cy = city.position[1] + CITYSPACE_SIZE + 8;

        // Research station
        if (state.researchStations.includes(cityId)) {
          ctx.fillStyle = "#ffffff";
          ctx.strokeStyle = "#000000";
          ctx.lineWidth = 1.5;
          const sx = city.position[0] + CITYTEXT_WIDTH / 2 - STATION_SIZE / 2;
          const sy = city.position[1] - STATION_SIZE - 2;

          // Simple house shape
          ctx.beginPath();
          ctx.moveTo(sx, sy + STATION_SIZE);
          ctx.lineTo(sx, sy + STATION_SIZE * 0.4);
          ctx.lineTo(sx + STATION_SIZE / 2, sy);
          ctx.lineTo(sx + STATION_SIZE, sy + STATION_SIZE * 0.4);
          ctx.lineTo(sx + STATION_SIZE, sy + STATION_SIZE);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }

        // Disease cubes
        let cubeIdx = 0;
        for (const color of DISEASE_COLORS) {
          const count = cubes[color];
          for (let i = 0; i < count; i++) {
            const col = cubeIdx % 4;
            const row = Math.floor(cubeIdx / 4);
            const cubex = cx - (4 * (CUBE_SIZE + CUBE_GAP)) / 2 + col * (CUBE_SIZE + CUBE_GAP);
            const cubey = cy + row * (CUBE_SIZE + CUBE_GAP);

            ctx.fillStyle = DISEASE_CSS[color];
            ctx.fillRect(cubex, cubey, CUBE_SIZE, CUBE_SIZE);
            ctx.strokeStyle = "#000";
            ctx.lineWidth = 0.5;
            ctx.strokeRect(cubex, cubey, CUBE_SIZE, CUBE_SIZE);
            cubeIdx++;
          }
        }
      }

      // Render player pawns
      const locationCounts = new Map<string, number>();
      for (const player of state.players) {
        const count = locationCounts.get(player.location) ?? 0;
        locationCounts.set(player.location, count + 1);
      }

      const locationIdx = new Map<string, number>();
      for (const player of state.players) {
        const city = CITY_DATA.get(player.location);
        if (!city) continue;

        const idx = locationIdx.get(player.location) ?? 0;
        locationIdx.set(player.location, idx + 1);
        const total = locationCounts.get(player.location) ?? 1;

        const baseCx = city.position[0] + CITYTEXT_WIDTH / 2;
        const baseCy = city.position[1] + CITYSPACE_SIZE / 2;
        const offsetX = (idx - (total - 1) / 2) * (PAWN_RADIUS * 2.5);

        const roleDef = getRoleDef(player.role);

        ctx.beginPath();
        ctx.arc(baseCx + offsetX, baseCy, PAWN_RADIUS, 0, Math.PI * 2);
        ctx.fillStyle = roleDef.pawnColor;
        ctx.fill();
        ctx.strokeStyle = "#000";
        ctx.lineWidth = 2;
        ctx.stroke();

        // Player number
        ctx.fillStyle = player.role === "scientist" ? "#000" : "#fff";
        ctx.font = "bold 11px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(player.id + 1), baseCx + offsetX, baseCy);
      }

      ctx.restore();
    },

    getHitRegions(viewport: Viewport): HitRegion[] {
      const regions: HitRegion[] = [];
      for (const [cityId, city] of CITY_DATA) {
        const x = viewport.offsetX + (city.position[0] + CITYTEXT_WIDTH / 2 - 25) * viewport.scale;
        const y = viewport.offsetY + (city.position[1] - 5) * viewport.scale;
        const w = 50 * viewport.scale;
        const h = (CITYSPACE_SIZE + 20) * viewport.scale;

        regions.push({
          id: `city:${cityId}`,
          type: "city",
          bounds: { x, y, w, h },
          data: cityId,
          cursor: "pointer",
        });
      }
      return regions;
    },
  };
}
