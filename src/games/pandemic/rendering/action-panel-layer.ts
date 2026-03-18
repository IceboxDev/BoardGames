import { getLegalActions } from "../logic/rules";
import type { GameState } from "../logic/types";
import type { HitRegion } from "./hit-test";
import type { RenderLayer, Viewport } from "./renderer";

const BUTTON_WIDTH = 150;
const BUTTON_HEIGHT = 28;
const BUTTON_GAP = 4;
const PANEL_PADDING = 8;

interface ActionButton {
  label: string;
  actionKind: string;
  enabled: boolean;
}

function getButtons(state: GameState): ActionButton[] {
  if (state.phase !== "actions") return [];

  const legal = getLegalActions(state);
  const legalKinds = new Set(legal.map((a) => a.kind));

  const buttons: ActionButton[] = [
    { label: "Drive / Ferry", actionKind: "drive_ferry", enabled: legalKinds.has("drive_ferry") },
    {
      label: "Direct Flight",
      actionKind: "direct_flight",
      enabled: legalKinds.has("direct_flight"),
    },
    {
      label: "Charter Flight",
      actionKind: "charter_flight",
      enabled: legalKinds.has("charter_flight"),
    },
    {
      label: "Shuttle Flight",
      actionKind: "shuttle_flight",
      enabled: legalKinds.has("shuttle_flight"),
    },
    {
      label: "Build Station",
      actionKind: "build_station",
      enabled: legalKinds.has("build_station"),
    },
    {
      label: "Treat Disease",
      actionKind: "treat_disease",
      enabled: legalKinds.has("treat_disease"),
    },
    {
      label: "Share Knowledge",
      actionKind: "share_give",
      enabled: legalKinds.has("share_give") || legalKinds.has("share_take"),
    },
    {
      label: "Discover Cure",
      actionKind: "discover_cure",
      enabled: legalKinds.has("discover_cure"),
    },
    { label: "Pass", actionKind: "pass", enabled: true },
  ];

  const player = state.players[state.currentPlayerIndex];

  if (player.role === "operations_expert" && legalKinds.has("ops_move")) {
    buttons.splice(4, 0, {
      label: "Ops Expert Move",
      actionKind: "ops_move",
      enabled: true,
    });
  }

  if (player.role === "dispatcher" && legalKinds.has("dispatcher_move_to_pawn")) {
    buttons.splice(4, 0, {
      label: "Dispatch to Pawn",
      actionKind: "dispatcher_move_to_pawn",
      enabled: true,
    });
  }

  if (player.role === "contingency_planner" && legalKinds.has("contingency_take")) {
    buttons.splice(buttons.length - 1, 0, {
      label: "Store Event",
      actionKind: "contingency_take",
      enabled: true,
    });
  }

  // Event card if player has any
  const hasEvent = player.hand.some((c) => c.kind === "event") || state.contingencyCard;
  if (hasEvent) {
    buttons.splice(buttons.length - 1, 0, {
      label: "Play Event",
      actionKind: "play_event",
      enabled: true,
    });
  }

  return buttons;
}

export function createActionPanelLayer(
  stateRef: { current: GameState | null },
  hoveredButtonRef: { current: string | null },
): RenderLayer {
  return {
    id: "actionPanel",
    zIndex: 35,
    dirty: true,

    render(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
      const state = stateRef.current;
      if (!state || state.phase === "game_over") return;

      const buttons = getButtons(state);
      if (buttons.length === 0) return;

      ctx.save();

      const panelW = BUTTON_WIDTH + PANEL_PADDING * 2;
      const panelH = buttons.length * (BUTTON_HEIGHT + BUTTON_GAP) + PANEL_PADDING * 2;
      const panelX = viewport.width - panelW - 10;
      const panelY = 60;

      // Panel bg
      ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
      ctx.beginPath();
      ctx.roundRect(panelX, panelY, panelW, panelH, 8);
      ctx.fill();

      // Title
      ctx.fillStyle = "#fff";
      ctx.font = "bold 11px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(`Actions: ${state.actionsRemaining}/4`, panelX + panelW / 2, panelY + 4);

      let by = panelY + PANEL_PADDING + 16;

      for (const btn of buttons) {
        const bx = panelX + PANEL_PADDING;
        const isHovered = hoveredButtonRef.current === btn.actionKind;

        if (btn.enabled) {
          ctx.fillStyle = isHovered ? "#555" : "#3a3a3a";
        } else {
          ctx.fillStyle = "#1a1a1a";
        }

        ctx.beginPath();
        ctx.roundRect(bx, by, BUTTON_WIDTH, BUTTON_HEIGHT, 4);
        ctx.fill();

        ctx.strokeStyle = btn.enabled ? "#888" : "#333";
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.fillStyle = btn.enabled ? "#fff" : "#555";
        ctx.font = "11px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(btn.label, bx + BUTTON_WIDTH / 2, by + BUTTON_HEIGHT / 2);

        by += BUTTON_HEIGHT + BUTTON_GAP;
      }

      ctx.restore();
    },

    getHitRegions(viewport: Viewport): HitRegion[] {
      const state = stateRef.current;
      if (!state || state.phase === "game_over") return [];

      const buttons = getButtons(state);
      const regions: HitRegion[] = [];

      const panelW = BUTTON_WIDTH + PANEL_PADDING * 2;
      const panelX = viewport.width - panelW - 10;
      let by = 60 + PANEL_PADDING + 16;

      for (const btn of buttons) {
        if (btn.enabled) {
          regions.push({
            id: `btn:${btn.actionKind}`,
            type: "button",
            bounds: {
              x: panelX + PANEL_PADDING,
              y: by,
              w: BUTTON_WIDTH,
              h: BUTTON_HEIGHT,
            },
            data: btn.actionKind,
            cursor: "pointer",
          });
        }
        by += BUTTON_HEIGHT + BUTTON_GAP;
      }

      return regions;
    },
  };
}
