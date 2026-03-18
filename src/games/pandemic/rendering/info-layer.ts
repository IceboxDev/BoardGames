import { CITY_DATA } from "../logic/city-graph";
import { getRoleDef } from "../logic/roles";
import type { GameState } from "../logic/types";
import type { RenderLayer, Viewport } from "./renderer";

const PHASE_LABELS: Record<string, string> = {
  actions: "Action Phase",
  draw: "Drawing Cards...",
  epidemic: "Epidemic!",
  infect: "Infecting Cities...",
  discard: "Discard to 7 cards",
  forecast: "Forecast — Reorder Cards",
  game_over: "Game Over",
};

export function createInfoLayer(stateRef: { current: GameState | null }): RenderLayer {
  return {
    id: "info",
    zIndex: 50,
    dirty: true,

    render(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
      const state = stateRef.current;
      if (!state) return;

      ctx.save();

      // Top bar
      const barH = 48;
      ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
      ctx.fillRect(0, 0, viewport.width, barH);

      const player = state.players[state.currentPlayerIndex];
      const roleDef = getRoleDef(player.role);
      const cityName = CITY_DATA.get(player.location)?.name ?? player.location;

      // Pawn color dot
      ctx.beginPath();
      ctx.arc(20, barH / 2, 8, 0, Math.PI * 2);
      ctx.fillStyle = roleDef.pawnColor;
      ctx.fill();
      ctx.strokeStyle = "#000";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Player info
      ctx.fillStyle = "#fff";
      ctx.font = "bold 14px sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(`Player ${player.id + 1}: ${roleDef.name}`, 36, barH / 2 - 8);

      ctx.fillStyle = "#aaa";
      ctx.font = "12px sans-serif";
      ctx.fillText(`in ${cityName}`, 36, barH / 2 + 8);

      // Phase indicator
      const phaseText = PHASE_LABELS[state.phase] ?? state.phase;
      ctx.fillStyle = state.phase === "epidemic" ? "#ff4444" : "#ffcc00";
      ctx.font = "bold 14px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(phaseText, viewport.width / 2, barH / 2);

      // Turn number
      ctx.fillStyle = "#888";
      ctx.font = "12px sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(`Turn ${state.turnNumber}`, viewport.width - 180, barH / 2);

      // All players summary (right side of top bar)
      let px = viewport.width - 170;
      for (const p of state.players) {
        const rd = getRoleDef(p.role);
        const isActive = p.id === state.currentPlayerIndex;

        ctx.beginPath();
        ctx.arc(px, barH / 2, 6, 0, Math.PI * 2);
        ctx.fillStyle = rd.pawnColor;
        ctx.fill();
        if (isActive) {
          ctx.strokeStyle = "#fff";
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        ctx.fillStyle = isActive ? "#fff" : "#888";
        ctx.font = "9px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(String(p.hand.length), px, barH / 2 + 14);

        px += 30;
      }

      ctx.restore();
    },
  };
}
