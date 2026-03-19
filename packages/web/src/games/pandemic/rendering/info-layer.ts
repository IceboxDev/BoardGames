import { CITY_DATA } from "@boardgames/core/games/pandemic/city-graph";
import { getRoleDef } from "@boardgames/core/games/pandemic/roles";
import type { GameState } from "@boardgames/core/games/pandemic/types";
import type { RenderedRoleCards } from "./card-renderer";
import type { RenderLayer, Viewport } from "./renderer";
import type { RolePortraits } from "./sprites";

const PHASE_LABELS: Record<string, string> = {
  actions: "Action Phase",
  draw: "Drawing Cards...",
  epidemic: "Epidemic!",
  infect: "Infecting Cities...",
  discard: "Discard to 7 cards",
  forecast: "Forecast — Reorder Cards",
  game_over: "Game Over",
};

const CARD_SRC_W = 200;
const CARD_SRC_H = 260;
const PLAYER_CARD_SCALE = 0.5;
const PLAYER_CARD_GAP = 6;
const PANEL_MARGIN = 8;

function drawCircularPortrait(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  cx: number,
  cy: number,
  radius: number,
  borderColor: string,
  borderWidth: number,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.clip();

  const size = radius * 2;
  const srcSize = Math.min(img.naturalWidth, img.naturalHeight);
  const srcX = (img.naturalWidth - srcSize) / 2;
  const srcY = (img.naturalHeight - srcSize) / 2;
  ctx.drawImage(img, srcX, srcY, srcSize, srcSize, cx - radius, cy - radius, size, size);
  ctx.restore();

  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = borderWidth;
  ctx.stroke();
}

export function createInfoLayer(
  stateRef: { current: GameState | null },
  rolePortraits: RolePortraits,
  roleCards: RenderedRoleCards,
): RenderLayer {
  return {
    id: "info",
    zIndex: 50,
    dirty: true,

    render(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
      const state = stateRef.current;
      if (!state) return;

      ctx.save();

      // ── Top bar ──
      const barH = 48;
      ctx.fillStyle = "rgba(0, 0, 0, 0.85)";
      ctx.fillRect(0, 0, viewport.width, barH);

      const player = state.players[state.currentPlayerIndex];
      const roleDef = getRoleDef(player.role);
      const cityName = CITY_DATA.get(player.location)?.name ?? player.location;

      // Player info text (left side, no portrait — the sidebar cards handle that)
      ctx.fillStyle = "#f0f0f4";
      ctx.font = "bold 14px sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(`Player ${player.id + 1}: ${roleDef.name}`, 14, barH / 2 - 8);

      ctx.fillStyle = "#888";
      ctx.font = "12px sans-serif";
      ctx.fillText(`in ${cityName}`, 14, barH / 2 + 8);

      // Phase indicator (center)
      const phaseText = PHASE_LABELS[state.phase] ?? state.phase;
      ctx.fillStyle = state.phase === "epidemic" ? "#ff4444" : "#ffcc00";
      ctx.font = "bold 14px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(phaseText, viewport.width / 2, barH / 2);

      // Turn number + player summary (right side)
      ctx.fillStyle = "#666";
      ctx.font = "12px sans-serif";
      ctx.textAlign = "right";
      const summaryStartX = viewport.width - 12 - state.players.length * 42;
      ctx.fillText(`Turn ${state.turnNumber}`, summaryStartX - 16, barH / 2);

      let px = summaryStartX;
      for (const p of state.players) {
        const rd = getRoleDef(p.role);
        const isActive = p.id === state.currentPlayerIndex;
        const pr = rolePortraits[p.role];
        const r = 14;

        drawCircularPortrait(
          ctx,
          pr,
          px + r,
          barH / 2 - 2,
          r,
          isActive ? "#fff" : rd.pawnColor,
          isActive ? 2.5 : 1.5,
        );

        ctx.fillStyle = isActive ? "#fff" : "#aaa";
        ctx.font = "bold 9px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(`${p.hand.length}`, px + r, barH / 2 + r + 8);

        px += 42;
      }

      // ── Left-side player role cards panel ──
      const cardW = Math.round(CARD_SRC_W * PLAYER_CARD_SCALE);
      const cardH = Math.round(CARD_SRC_H * PLAYER_CARD_SCALE);
      const panelX = PANEL_MARGIN;
      let cardY = barH + PANEL_MARGIN;

      for (const p of state.players) {
        const isActive = p.id === state.currentPlayerIndex;
        const cardCanvas = roleCards[p.role];
        const rd = getRoleDef(p.role);

        // Active glow
        if (isActive) {
          ctx.shadowColor = `${rd.pawnColor}60`;
          ctx.shadowBlur = 12;
        }

        ctx.drawImage(cardCanvas, panelX, cardY, cardW, cardH);

        ctx.shadowColor = "transparent";
        ctx.shadowBlur = 0;

        if (isActive) {
          ctx.strokeStyle = "#fff";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.roundRect(panelX, cardY, cardW, cardH, 4);
          ctx.stroke();
        }

        // Hand count badge
        const badgeR = 10;
        const badgeCx = panelX + cardW - badgeR + 2;
        const badgeCy = cardY + badgeR - 2;
        ctx.beginPath();
        ctx.arc(badgeCx, badgeCy, badgeR, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
        ctx.fill();
        ctx.strokeStyle = rd.pawnColor;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.fillStyle = "#fff";
        ctx.font = "bold 11px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(`${p.hand.length}`, badgeCx, badgeCy);

        cardY += cardH + PLAYER_CARD_GAP;
      }

      ctx.restore();
    },
  };
}
