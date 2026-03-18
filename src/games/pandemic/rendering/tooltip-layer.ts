import { CITY_DATA } from "../logic/city-graph";
import type { DiseaseColor, GameState } from "../logic/types";
import { DISEASE_COLORS } from "../logic/types";
import type { HighlightState } from "./highlight-layer";
import type { RenderLayer, Viewport } from "./renderer";

const DISEASE_CSS: Record<DiseaseColor, string> = {
  blue: "#4488ff",
  yellow: "#ffcc00",
  black: "#555",
  red: "#ff3333",
};

const TOOLTIP_PADDING = 8;
const CITYTEXT_WIDTH = 150;

export function createTooltipLayer(
  stateRef: { current: GameState | null },
  highlightRef: { current: HighlightState },
): RenderLayer {
  return {
    id: "tooltip",
    zIndex: 60,
    dirty: true,

    render(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
      const state = stateRef.current;
      const cityId = highlightRef.current.hoveredCity;
      if (!state || !cityId) return;

      const city = CITY_DATA.get(cityId);
      if (!city) return;

      const cubes = state.cityCubes[cityId];
      const hasStation = state.researchStations.includes(cityId);
      const playersHere = state.players.filter((p) => p.location === cityId);

      // Build tooltip text lines
      const lines: Array<{ text: string; color: string }> = [];
      lines.push({ text: city.name, color: "#fff" });

      const cubeCounts = DISEASE_COLORS.filter((c) => cubes[c] > 0);
      if (cubeCounts.length > 0) {
        for (const color of cubeCounts) {
          lines.push({
            text: `${color}: ${cubes[color]} cube${cubes[color] > 1 ? "s" : ""}`,
            color: DISEASE_CSS[color],
          });
        }
      }

      if (hasStation) {
        lines.push({ text: "Research Station", color: "#88ff88" });
      }

      for (const p of playersHere) {
        lines.push({
          text: `Player ${p.id + 1} (${p.role.replace(/_/g, " ")})`,
          color: "#aaa",
        });
      }

      // Position tooltip near the city in screen coordinates
      const worldX = city.position[0] + CITYTEXT_WIDTH / 2;
      const worldY = city.position[1] - 10;
      const screenX = viewport.offsetX + worldX * viewport.scale;
      const screenY = viewport.offsetY + worldY * viewport.scale;

      const lineHeight = 15;
      const tooltipW = 170;
      const tooltipH = lines.length * lineHeight + TOOLTIP_PADDING * 2;

      let tx = screenX - tooltipW / 2;
      let ty = screenY - tooltipH - 8;

      // Clamp to viewport
      if (tx < 4) tx = 4;
      if (tx + tooltipW > viewport.width - 4) tx = viewport.width - tooltipW - 4;
      if (ty < 4) ty = screenY + 20;

      ctx.save();

      ctx.fillStyle = "rgba(0, 0, 0, 0.9)";
      ctx.beginPath();
      ctx.roundRect(tx, ty, tooltipW, tooltipH, 6);
      ctx.fill();

      ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.font = "11px sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";

      let y = ty + TOOLTIP_PADDING;
      for (let i = 0; i < lines.length; i++) {
        ctx.fillStyle = lines[i].color;
        if (i === 0) ctx.font = "bold 12px sans-serif";
        else ctx.font = "11px sans-serif";
        ctx.fillText(lines[i].text, tx + TOOLTIP_PADDING, y);
        y += lineHeight;
      }

      ctx.restore();
    },
  };
}
