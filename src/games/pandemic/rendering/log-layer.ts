import type { GameState } from "../logic/types";
import type { RenderLayer, Viewport } from "./renderer";

const LOG_PANEL_WIDTH = 300;
const LOG_LINE_HEIGHT = 14;
const MAX_VISIBLE_LINES = 10;
const PANEL_PADDING = 8;

export function createLogLayer(stateRef: { current: GameState | null }): RenderLayer {
  return {
    id: "log",
    zIndex: 45,
    dirty: true,

    render(ctx: CanvasRenderingContext2D, _viewport: Viewport): void {
      const state = stateRef.current;
      if (!state || state.log.length === 0) return;

      ctx.save();

      const panelH = MAX_VISIBLE_LINES * LOG_LINE_HEIGHT + PANEL_PADDING * 2 + 16;
      const panelX = 10;
      const panelY = 60;

      ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
      ctx.beginPath();
      ctx.roundRect(panelX, panelY, LOG_PANEL_WIDTH, panelH, 8);
      ctx.fill();

      ctx.fillStyle = "#aaa";
      ctx.font = "bold 10px sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText("Game Log", panelX + PANEL_PADDING, panelY + PANEL_PADDING);

      const recentLogs = state.log.slice(-MAX_VISIBLE_LINES);

      ctx.font = "10px sans-serif";
      let y = panelY + PANEL_PADDING + 16;

      for (const entry of recentLogs) {
        // Color-code by content
        if (entry.message.includes("Outbreak")) {
          ctx.fillStyle = "#ff6666";
        } else if (entry.message.includes("Epidemic")) {
          ctx.fillStyle = "#ff4444";
        } else if (entry.message.includes("cure") || entry.message.includes("Cure")) {
          ctx.fillStyle = "#66ff66";
        } else if (entry.message.includes("eradicated")) {
          ctx.fillStyle = "#00ff88";
        } else if (entry.message.includes("Game Over") || entry.message.includes("Victory")) {
          ctx.fillStyle = "#ffcc00";
        } else {
          ctx.fillStyle = "#999";
        }

        // Truncate long messages
        let msg = entry.message;
        const maxWidth = LOG_PANEL_WIDTH - PANEL_PADDING * 2;
        while (ctx.measureText(msg).width > maxWidth && msg.length > 10) {
          msg = `${msg.slice(0, -4)}...`;
        }

        ctx.fillText(msg, panelX + PANEL_PADDING, y);
        y += LOG_LINE_HEIGHT;
      }

      ctx.restore();
    },
  };
}
