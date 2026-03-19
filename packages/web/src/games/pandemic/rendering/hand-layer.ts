import { CITY_DATA } from "@boardgames/core/games/pandemic/city-graph";
import { getEventName } from "@boardgames/core/games/pandemic/events";
import type {
  CityCard,
  DiseaseColor,
  EventCard,
  GameState,
  PlayerCard,
} from "@boardgames/core/games/pandemic/types";
import type { HitRegion } from "./hit-test";
import type { RenderLayer, Viewport } from "./renderer";

const CARD_WIDTH = 70;
const CARD_HEIGHT = 100;
const CARD_GAP = 6;
const PANEL_PADDING = 12;
const COLOR_BAR_WIDTH = 8;

const DISEASE_CSS: Record<DiseaseColor, string> = {
  blue: "#4488ff",
  yellow: "#ffcc00",
  black: "#444",
  red: "#ff3333",
};

export interface HandState {
  selectedCardIdx: number | null;
}

export function createHandLayer(
  stateRef: { current: GameState | null },
  handStateRef: { current: HandState },
): RenderLayer {
  function getCardPositions(
    viewport: Viewport,
  ): Array<{ x: number; y: number; card: PlayerCard; idx: number }> {
    const state = stateRef.current;
    if (!state) return [];

    const player = state.players[state.currentPlayerIndex];
    const hand = player.hand;
    const totalWidth = hand.length * (CARD_WIDTH + CARD_GAP) - CARD_GAP;
    const startX = (viewport.width - totalWidth) / 2;
    const y = viewport.height - CARD_HEIGHT - PANEL_PADDING;

    return hand.map((card, idx) => ({
      x: startX + idx * (CARD_WIDTH + CARD_GAP),
      y: idx === handStateRef.current.selectedCardIdx ? y - 12 : y,
      card,
      idx,
    }));
  }

  return {
    id: "hand",
    zIndex: 40,
    dirty: true,

    render(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
      const state = stateRef.current;
      if (!state) return;

      ctx.save();

      // Panel background
      const panelY = viewport.height - CARD_HEIGHT - PANEL_PADDING * 2;
      ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
      ctx.fillRect(0, panelY, viewport.width, CARD_HEIGHT + PANEL_PADDING * 2 + 14);

      // Cards
      const positions = getCardPositions(viewport);

      for (const { x, y, card, idx } of positions) {
        const isSelected = idx === handStateRef.current.selectedCardIdx;

        // Card background
        ctx.fillStyle = isSelected ? "#444" : "#2a2a2a";
        ctx.beginPath();
        ctx.roundRect(x, y, CARD_WIDTH, CARD_HEIGHT, 4);
        ctx.fill();

        // Border
        ctx.strokeStyle = isSelected ? "#ffcc00" : "#666";
        ctx.lineWidth = isSelected ? 2 : 1;
        ctx.stroke();

        if (card.kind === "city") {
          const cc = card as CityCard;
          // Color bar
          ctx.fillStyle = DISEASE_CSS[cc.color];
          ctx.fillRect(x, y, COLOR_BAR_WIDTH, CARD_HEIGHT);

          // City name
          ctx.fillStyle = "#fff";
          ctx.font = "10px sans-serif";
          ctx.textAlign = "left";
          ctx.textBaseline = "top";

          const name = CITY_DATA.get(cc.cityId)?.name ?? cc.cityId;
          wrapText(ctx, name, x + COLOR_BAR_WIDTH + 4, y + 6, CARD_WIDTH - COLOR_BAR_WIDTH - 8, 12);
        } else if (card.kind === "event") {
          const ec = card as EventCard;
          // Gold border
          ctx.strokeStyle = "#daa520";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.roundRect(x + 1, y + 1, CARD_WIDTH - 2, CARD_HEIGHT - 2, 3);
          ctx.stroke();

          ctx.fillStyle = "#daa520";
          ctx.font = "bold 9px sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "top";
          ctx.fillText("EVENT", x + CARD_WIDTH / 2, y + 6);

          ctx.fillStyle = "#fff";
          ctx.font = "9px sans-serif";
          wrapText(ctx, getEventName(ec.event), x + 6, y + 22, CARD_WIDTH - 12, 11);
        }
      }

      // Deck info
      ctx.fillStyle = "#aaa";
      ctx.font = "11px sans-serif";
      ctx.textAlign = "right";
      ctx.textBaseline = "bottom";
      ctx.fillText(
        `Deck: ${state.playerDeck.length}  |  Infection: ${state.infectionDeck.length}`,
        viewport.width - 12,
        panelY - 4,
      );

      ctx.restore();
    },

    getHitRegions(viewport: Viewport): HitRegion[] {
      const positions = getCardPositions(viewport);
      return positions.map(({ x, y, idx }) => ({
        id: `card:${idx}`,
        type: "card" as const,
        bounds: { x, y, w: CARD_WIDTH, h: CARD_HEIGHT },
        data: idx,
        cursor: "pointer",
      }));
    },
  };
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
): void {
  const words = text.split(" ");
  let line = "";
  let lineY = y;

  for (const word of words) {
    const testLine = line ? `${line} ${word}` : word;
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && line) {
      ctx.fillText(line, x, lineY);
      line = word;
      lineY += lineHeight;
    } else {
      line = testLine;
    }
  }
  if (line) {
    ctx.fillText(line, x, lineY);
  }
}
