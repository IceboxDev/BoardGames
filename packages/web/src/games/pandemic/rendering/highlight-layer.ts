import { CITY_DATA } from "@boardgames/core/games/pandemic/city-graph";
import type { RenderLayer, Viewport } from "./renderer";

const CITYTEXT_WIDTH = 150;
const CITYSPACE_SIZE = 50;

export interface HighlightState {
  hoveredCity: string | null;
  validDestinations: Set<string>;
  selectedCity: string | null;
}

export function createHighlightLayer(highlightRef: { current: HighlightState }): RenderLayer {
  return {
    id: "highlights",
    zIndex: 5,
    dirty: true,

    render(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
      const hl = highlightRef.current;

      ctx.save();
      ctx.translate(viewport.offsetX, viewport.offsetY);
      ctx.scale(viewport.scale, viewport.scale);

      // Valid destinations glow
      for (const cityId of hl.validDestinations) {
        const city = CITY_DATA.get(cityId);
        if (!city) continue;
        const cx = city.position[0] + CITYTEXT_WIDTH / 2;
        const cy = city.position[1] + CITYSPACE_SIZE / 2;

        ctx.beginPath();
        ctx.arc(cx, cy, 20, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(0, 255, 100, 0.25)";
        ctx.fill();
        ctx.strokeStyle = "rgba(0, 255, 100, 0.6)";
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Hovered city
      if (hl.hoveredCity) {
        const city = CITY_DATA.get(hl.hoveredCity);
        if (city) {
          const cx = city.position[0] + CITYTEXT_WIDTH / 2;
          const cy = city.position[1] + CITYSPACE_SIZE / 2;

          ctx.beginPath();
          ctx.arc(cx, cy, 22, 0, Math.PI * 2);
          ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
          ctx.lineWidth = 3;
          ctx.stroke();
        }
      }

      // Selected city
      if (hl.selectedCity) {
        const city = CITY_DATA.get(hl.selectedCity);
        if (city) {
          const cx = city.position[0] + CITYTEXT_WIDTH / 2;
          const cy = city.position[1] + CITYSPACE_SIZE / 2;

          ctx.beginPath();
          ctx.arc(cx, cy, 24, 0, Math.PI * 2);
          ctx.strokeStyle = "rgba(255, 200, 0, 0.9)";
          ctx.lineWidth = 3;
          ctx.setLineDash([6, 4]);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }

      ctx.restore();
    },
  };
}
