import type { SlotId } from "@boardgames/core/games/sky-team/types";
import type { BoardPoint, BoardRect, BoardViewBox } from "../../../../components/board";

/**
 * Sky Team cockpit geometry — the *only* file with numeric coordinates.
 *
 * ViewBox: 720 × 1000. Mirrors sky-team-lab/board.css `--board-w` and
 * `--board-aspect`. All other Sky Team board files read from these constants;
 * never inline coordinates in a component.
 */
export const COCKPIT_VIEWBOX: BoardViewBox = { x: 0, y: 0, width: 720, height: 1000 };

// ---------- region bands ----------

export const TOP_HUD_HEIGHT = 88;
export const BOTTOM_PANEL_HEIGHT = 140;
export const SIDE_STRIP_WIDTH = 137;

export const PLAY_AREA: BoardRect = {
  x: SIDE_STRIP_WIDTH,
  y: TOP_HUD_HEIGHT,
  w: COCKPIT_VIEWBOX.width - 2 * SIDE_STRIP_WIDTH,
  h: COCKPIT_VIEWBOX.height - TOP_HUD_HEIGHT - BOTTOM_PANEL_HEIGHT,
};

// ---------- top HUD ----------

export const HUD_REROLL: { center: BoardPoint; radius: number } = {
  center: { x: 70, y: 50 },
  radius: 28,
};

export const HUD_WEATHER: BoardRect = { x: 198, y: 22, w: 192, h: 56 };
export const HUD_ALTITUDE: BoardRect = { x: 430, y: 22, w: 220, h: 56 };

// ---------- side strips ----------

const STRIP_SLOT_W = 78;
const STRIP_SLOT_H = 76;
const STRIP_X_LEFT = (SIDE_STRIP_WIDTH - STRIP_SLOT_W) / 2;
const STRIP_X_RIGHT =
  COCKPIT_VIEWBOX.width - SIDE_STRIP_WIDTH + (SIDE_STRIP_WIDTH - STRIP_SLOT_W) / 2;

// ---------- center cluster ----------

export const ARTIFICIAL_HORIZON: { center: BoardPoint; radius: number; bezelWidth: number } = {
  center: { x: 360, y: 300 },
  radius: 130,
  bezelWidth: 18,
};

export const AXIS_ARC: { center: BoardPoint; radius: number; startDeg: number; endDeg: number } = {
  center: { x: 360, y: 300 },
  radius: 178,
  startDeg: 165,
  endDeg: 15,
};

export const BRAKE_ARC: { center: BoardPoint; radius: number; startDeg: number; endDeg: number } = {
  center: { x: 360, y: 600 },
  radius: 130,
  startDeg: 195,
  endDeg: 345,
};

const ENGINE_Y = 540;
const ENGINE_W = 78;
const ENGINE_H = 78;

export const ENGINE_ROW_AXIS_MARKER: BoardPoint = {
  x: COCKPIT_VIEWBOX.width / 2,
  y: ENGINE_Y + ENGINE_H / 2,
};

const BRAKE_ROW_Y = 720;
const BRAKE_SLOT_W = 70;
const BRAKE_SLOT_H = 70;

// ---------- slot lookup ----------

export const SLOT_GEOMETRY: Record<SlotId, BoardRect> = {
  // Engines (centre, side by side, with axis marker between)
  "pilot-engine": { x: 300 - ENGINE_W, y: ENGINE_Y, w: ENGINE_W, h: ENGINE_H },
  "copilot-engine": { x: 420, y: ENGINE_Y, w: ENGINE_W, h: ENGINE_H },

  // Axis (where dice land for the artificial-horizon roll)
  "pilot-axis": { x: 200, y: 460, w: 64, h: 64 },
  "copilot-axis": { x: 456, y: 460, w: 64, h: 64 },

  // Radio
  "pilot-radio": { x: 270, y: 165, w: 56, h: 56 },
  "copilot-radio-1": { x: 394, y: 165, w: 56, h: 56 },
  "copilot-radio-2": { x: 394, y: 235, w: 56, h: 56 },

  // Concentration (bottom centre row, just above the bottom panel)
  "concentration-1": { x: 184, y: 830, w: 56, h: 56 },
  "concentration-2": { x: 332, y: 830, w: 56, h: 56 },
  "concentration-3": { x: 480, y: 830, w: 56, h: 56 },

  // Landing gear (left strip, top to bottom)
  "landing-gear-1": { x: STRIP_X_LEFT, y: 180, w: STRIP_SLOT_W, h: STRIP_SLOT_H },
  "landing-gear-2": { x: STRIP_X_LEFT, y: 305, w: STRIP_SLOT_W, h: STRIP_SLOT_H },
  "landing-gear-3": { x: STRIP_X_LEFT, y: 430, w: STRIP_SLOT_W, h: STRIP_SLOT_H },

  // Flaps (right strip, top to bottom — order: 1, 2, 3)
  "flaps-1": { x: STRIP_X_RIGHT, y: 180, w: STRIP_SLOT_W, h: STRIP_SLOT_H },
  "flaps-2": { x: STRIP_X_RIGHT, y: 305, w: STRIP_SLOT_W, h: STRIP_SLOT_H },
  "flaps-3": { x: STRIP_X_RIGHT, y: 430, w: STRIP_SLOT_W, h: STRIP_SLOT_H },

  // Brakes (centre row, ordered)
  "brakes-2": { x: 220, y: BRAKE_ROW_Y, w: BRAKE_SLOT_W, h: BRAKE_SLOT_H },
  "brakes-4": { x: 325, y: BRAKE_ROW_Y, w: BRAKE_SLOT_W, h: BRAKE_SLOT_H },
  "brakes-6": { x: 430, y: BRAKE_ROW_Y, w: BRAKE_SLOT_W, h: BRAKE_SLOT_H },
};

// ---------- bottom panel ----------

export const BOTTOM_PANEL: BoardRect = {
  x: 24,
  y: COCKPIT_VIEWBOX.height - BOTTOM_PANEL_HEIGHT + 12,
  w: COCKPIT_VIEWBOX.width - 48,
  h: BOTTOM_PANEL_HEIGHT - 24,
};

export const COFFEE_ANCHOR: BoardPoint = { x: 48, y: BOTTOM_PANEL.y + BOTTOM_PANEL.h / 2 };

// ---------- approach & speed (existing tracks, now SVG inline) ----------

export const APPROACH_RIBBON: BoardRect = { x: 168, y: 110, w: 384, h: 36 };
export const SPEED_GAUGE: BoardRect = { x: 168, y: PLAY_AREA.y + 4, w: 384, h: 20 };
