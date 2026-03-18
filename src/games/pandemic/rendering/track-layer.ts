import type { DiseaseColor, GameState } from "../logic/types";
import { DISEASE_COLORS, INFECTION_RATE_TRACK } from "../logic/types";
import type { RenderLayer, Viewport } from "./renderer";

const DISEASE_CSS: Record<DiseaseColor, string> = {
  blue: "#4488ff",
  yellow: "#ffcc00",
  black: "#333333",
  red: "#ff3333",
};

const _TRACK_Y = 20;
const BOX_SIZE = 30;
const BOX_GAP = 4;
const _SECTION_GAP = 20;

export function createTrackLayer(stateRef: { current: GameState | null }): RenderLayer {
  return {
    id: "tracks",
    zIndex: 30,
    dirty: true,

    render(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
      const state = stateRef.current;
      if (!state) return;

      // Draw in screen space (fixed position)
      ctx.save();

      const panelX = 10;
      const panelY = viewport.height - 160;
      const panelW = 320;
      const panelH = 150;

      // Background panel
      ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
      ctx.beginPath();
      ctx.roundRect(panelX, panelY, panelW, panelH, 8);
      ctx.fill();

      ctx.fillStyle = "#fff";
      ctx.font = "bold 11px sans-serif";
      ctx.textBaseline = "top";

      let y = panelY + 8;

      // Infection Rate Track
      ctx.fillText("Infection Rate:", panelX + 8, y);
      y += 16;

      for (let i = 0; i < INFECTION_RATE_TRACK.length; i++) {
        const bx = panelX + 8 + i * (BOX_SIZE + BOX_GAP);
        const isActive = i === state.infectionRateIndex;

        ctx.fillStyle = isActive ? "#ff4444" : "rgba(255,255,255,0.15)";
        ctx.fillRect(bx, y, BOX_SIZE, BOX_SIZE - 6);
        ctx.strokeStyle = isActive ? "#fff" : "rgba(255,255,255,0.3)";
        ctx.lineWidth = isActive ? 2 : 1;
        ctx.strokeRect(bx, y, BOX_SIZE, BOX_SIZE - 6);

        ctx.fillStyle = "#fff";
        ctx.font = isActive ? "bold 12px sans-serif" : "11px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(INFECTION_RATE_TRACK[i]), bx + BOX_SIZE / 2, y + (BOX_SIZE - 6) / 2);
      }

      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      y += BOX_SIZE + 4;

      // Outbreak Track
      ctx.fillStyle = "#fff";
      ctx.font = "bold 11px sans-serif";
      ctx.fillText(`Outbreaks: ${state.outbreakCount}/8`, panelX + 8, y);
      y += 16;

      for (let i = 0; i < 9; i++) {
        const bx = panelX + 8 + i * (BOX_SIZE + BOX_GAP);
        const isActive = i === state.outbreakCount;
        const isPast = i < state.outbreakCount;

        const red = Math.min(255, 80 + i * 20);
        ctx.fillStyle = isActive
          ? `rgb(${red}, 40, 40)`
          : isPast
            ? `rgba(${red}, 40, 40, 0.5)`
            : "rgba(255,255,255,0.1)";
        ctx.fillRect(bx, y, BOX_SIZE, BOX_SIZE - 6);
        ctx.strokeStyle = isActive ? "#fff" : "rgba(255,255,255,0.2)";
        ctx.lineWidth = isActive ? 2 : 1;
        ctx.strokeRect(bx, y, BOX_SIZE, BOX_SIZE - 6);

        ctx.fillStyle = "#fff";
        ctx.font = isActive ? "bold 12px sans-serif" : "11px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(i), bx + BOX_SIZE / 2, y + (BOX_SIZE - 6) / 2);
      }

      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      y += BOX_SIZE + 4;

      // Cure indicators + cube supply
      let cx = panelX + 8;
      for (const color of DISEASE_COLORS) {
        const status = state.diseaseStatus[color];
        const supply = state.diseaseCubeSupply[color];

        ctx.fillStyle = DISEASE_CSS[color];
        ctx.beginPath();
        ctx.arc(cx + 8, y + 8, 8, 0, Math.PI * 2);
        ctx.fill();

        if (status === "cured") {
          ctx.strokeStyle = "#fff";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(cx + 3, y + 8);
          ctx.lineTo(cx + 7, y + 12);
          ctx.lineTo(cx + 14, y + 4);
          ctx.stroke();
        } else if (status === "eradicated") {
          ctx.strokeStyle = "#0f0";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(cx + 3, y + 8);
          ctx.lineTo(cx + 7, y + 12);
          ctx.lineTo(cx + 14, y + 4);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(cx + 8, y + 8, 8, 0, Math.PI * 2);
          ctx.strokeStyle = "#0f0";
          ctx.stroke();
        }

        ctx.fillStyle = "#ccc";
        ctx.font = "10px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(String(supply), cx + 8, y + 20);
        ctx.textAlign = "left";

        cx += 70;
      }

      ctx.restore();
    },
  };
}
