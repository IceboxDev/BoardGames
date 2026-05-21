import type { SlotId } from "@boardgames/core/games/sky-team/types";
import type { BoardPoint, BoardRect, BoardViewBox } from "../../../../components/board";

/**
 * Sky Team cockpit geometry — the *only* file with numeric coordinates.
 *
 * ViewBox: 720 × 1000. Layout numbers mirror `sky-team-lab/board.css`
 * (`--board-w`, `--board-aspect`, `--top-hud-h`, `--side-strip-w`), then
 * converted from percentages to viewBox units once and read everywhere else.
 */
export const COCKPIT_VIEWBOX: BoardViewBox = { x: 0, y: 0, width: 720, height: 1000 };

// ---------- region bands ----------

export const TOP_HUD_HEIGHT = 88; // 8.8% of board height
export const SIDE_STRIP_WIDTH = 137; // 19% of board width
export const CABIN_PANEL_HEIGHT = 100; // shrunk from lab's 125 with breathing room for concentration tile
export const CABIN_PANEL_BOTTOM_MARGIN = 20; // 2% of board height
export const CABIN_PANEL_LEFT = 18; // 2.5% of board width
export const CABIN_PANEL_TOP =
  COCKPIT_VIEWBOX.height - CABIN_PANEL_BOTTOM_MARGIN - CABIN_PANEL_HEIGHT;
export const BOTTOM_PANEL_HEIGHT = CABIN_PANEL_HEIGHT + CABIN_PANEL_BOTTOM_MARGIN;

export const PLAY_AREA: BoardRect = {
  x: SIDE_STRIP_WIDTH,
  y: TOP_HUD_HEIGHT,
  w: COCKPIT_VIEWBOX.width - 2 * SIDE_STRIP_WIDTH,
  h: COCKPIT_VIEWBOX.height - TOP_HUD_HEIGHT - BOTTOM_PANEL_HEIGHT,
};

// ---------- top HUD (lab grid: auto reroll | 1fr weather | 1fr altitude) ----------

export const HUD_REROLL: { center: BoardPoint; radius: number } = {
  center: { x: 50, y: 69 },
  radius: 32,
};

export const HUD_WEATHER: BoardRect = { x: 222, y: 6, w: 170, h: 82 };
export const HUD_ALTITUDE: BoardRect = { x: 408, y: 6, w: 180, h: 82 };

// ---------- side strips ----------

// Bounds are TILE-only (64×64 square). The slider that sits below each strip
// tile is positioned by `CockpitSlot.tsx` as a separate overlay; including the
// slider in the slot's bounding rect would make the tile shell non-square and
// shift `cqi` resolution off the lab's 64-px baseline.
const STRIP_TILE_W = 64;
const STRIP_TILE_H = 64;
// Lab strips align their controls to the OUTER edge of the strip:
//   - left strip: `justify-items: start; padding-left: 4px;`
//   - right strip: `justify-items: end;   padding-right: 4px;`
// Inside each `.control` (78w) the 64-tile is centred, so the tile's outer-x
// is 4 + (78-64)/2 = 11 from the board edge. The slider stays 4 from the rim.
const STRIP_X_LEFT = 11;
const STRIP_X_RIGHT = COCKPIT_VIEWBOX.width - STRIP_TILE_W - STRIP_X_LEFT;

// Lab pushes strip tiles into the lower half via a 5-row grid (2fr top spacer
// + 4×1fr rows). Strip runs y=88..980 = 892 tall; each fr ≈ 149.
// Row centres: 237 (spacer), 460, 610, 758, 908. Tile-stack height = tile (64)
// + gap (4) + slider (30) = 98; stack top in a 149-row = row_centre - 49.
const STRIP_Y_ROW_1 = 411; // landing-gear-1 / flaps-1
const STRIP_Y_ROW_2 = 561; // landing-gear-2 / flaps-2
const STRIP_Y_ROW_3 = 709; // landing-gear-3 / flaps-3
const STRIP_Y_ROW_4 = 859; // flaps-4 (right strip only; left strip's row 4 sits under the cabin)

// ---------- center cluster ----------

// Centre cluster spans y = TOP_HUD_HEIGHT (88) to y = CABIN_PANEL_TOP - 20 (835).
// Lab grid rows inside: 4.4 / 1.3 / 1.6 / 1.3 fr (horizon / engines / brake-arc / brake-row).

export const ARTIFICIAL_HORIZON: {
  center: BoardPoint;
  outerRadius: number;
  faceRadius: number;
  bezelThickness: number;
} = {
  center: { x: 360, y: 296 },
  outerRadius: 174,
  faceRadius: 153,
  bezelThickness: 18,
};

// Axis arc — TRUE 180° half-circle. Chord length 456 = diameter, so radius =
// 228; sagitta also = 228, putting arc bottom at y=574. The engine row + brake
// arc + brake row sit BELOW the half-circle (engine row top at y=600).
export const AXIS_ARC: {
  chord: { left: BoardPoint; right: BoardPoint };
  rx: number;
  ry: number;
  thickness: number;
} = {
  chord: { left: { x: 132, y: 346 }, right: { x: 588, y: 346 } },
  rx: 228,
  ry: 228,
  thickness: 36,
};

// Brake arc — quadratic-bezier U-curve. Sits between the engine row (bottom
// y=670) and the brake row (top y=778). Path lab-depth 91 preserved.
export const BRAKE_ARC: {
  start: BoardPoint;
  control: BoardPoint;
  end: BoardPoint;
  thickness: number;
} = {
  start: { x: 249.6, y: 695 },
  control: { x: 360, y: 786 },
  end: { x: 470.4, y: 695 },
  thickness: 38,
};

// ---------- slot geometry ----------

const ENGINE_SLOT_W = 70;
const ENGINE_SLOT_H = 70;
const ENGINE_ROW_Y = 600; // shifted down to clear the half-circle axis arc (band bottom y=592)
const ENGINE_PILOT_X = 248;
const ENGINE_COPILOT_X = 402;

export const ENGINE_ROW_AXIS_MARKER: BoardPoint = { x: 360, y: 635 };

// Brake tile bounds — also tile-only (64×64). Slider positioned below.
const BRAKE_TILE_W = 64;
const BRAKE_TILE_H = 64;
const BRAKE_ROW_Y = 778; // 30 below lab's 748 — moved down per user request

const CONCENTRATION_W = 64;
const CONCENTRATION_H = 64;
const CONCENTRATION_Y = 910;

export const SLOT_GEOMETRY: Record<SlotId, BoardRect> = {
  // Engines (centre, flanking the axis marker)
  "pilot-engine": { x: ENGINE_PILOT_X, y: ENGINE_ROW_Y, w: ENGINE_SLOT_W, h: ENGINE_SLOT_H },
  "copilot-engine": { x: ENGINE_COPILOT_X, y: ENGINE_ROW_Y, w: ENGINE_SLOT_W, h: ENGINE_SLOT_H },

  // Axis (where dice land for the artificial-horizon roll). Lab doesn't sketch
  // these — kept at current positions just below the dial; revisit when lab adds
  // the region.
  "pilot-axis": { x: 200, y: 460, w: 64, h: 64 },
  "copilot-axis": { x: 456, y: 460, w: 64, h: 64 },

  // Radio (not in lab — placed above the horizon dial; revisit alongside axis).
  "pilot-radio": { x: 270, y: 165, w: 56, h: 56 },
  "copilot-radio-1": { x: 394, y: 165, w: 56, h: 56 },
  "copilot-radio-2": { x: 394, y: 235, w: 56, h: 56 },

  // Concentration tiles — centred on board x=50% inside the cabin polygon.
  // Centres at 270 / 360 / 450 (90px apart, matching the brake row).
  "concentration-1": {
    x: 270 - CONCENTRATION_W / 2,
    y: CONCENTRATION_Y,
    w: CONCENTRATION_W,
    h: CONCENTRATION_H,
  },
  "concentration-2": {
    x: 360 - CONCENTRATION_W / 2,
    y: CONCENTRATION_Y,
    w: CONCENTRATION_W,
    h: CONCENTRATION_H,
  },
  "concentration-3": {
    x: 450 - CONCENTRATION_W / 2,
    y: CONCENTRATION_Y,
    w: CONCENTRATION_W,
    h: CONCENTRATION_H,
  },

  // Landing gear — left strip, lower half (rows 1-3; the cabin polygon covers
  // row 4 on the pilot side).
  "landing-gear-1": { x: STRIP_X_LEFT, y: STRIP_Y_ROW_1, w: STRIP_TILE_W, h: STRIP_TILE_H },
  "landing-gear-2": { x: STRIP_X_LEFT, y: STRIP_Y_ROW_2, w: STRIP_TILE_W, h: STRIP_TILE_H },
  "landing-gear-3": { x: STRIP_X_LEFT, y: STRIP_Y_ROW_3, w: STRIP_TILE_W, h: STRIP_TILE_H },

  // Flaps — right strip, 4 tiles in lower half (rows 1-4).
  "flaps-1": { x: STRIP_X_RIGHT, y: STRIP_Y_ROW_1, w: STRIP_TILE_W, h: STRIP_TILE_H },
  "flaps-2": { x: STRIP_X_RIGHT, y: STRIP_Y_ROW_2, w: STRIP_TILE_W, h: STRIP_TILE_H },
  "flaps-3": { x: STRIP_X_RIGHT, y: STRIP_Y_ROW_3, w: STRIP_TILE_W, h: STRIP_TILE_H },
  "flaps-4": { x: STRIP_X_RIGHT, y: STRIP_Y_ROW_4, w: STRIP_TILE_W, h: STRIP_TILE_H },

  // Brakes — pilot row below the brake arc, centres at 270 / 360 / 450.
  "brakes-2": { x: 270 - BRAKE_TILE_W / 2, y: BRAKE_ROW_Y, w: BRAKE_TILE_W, h: BRAKE_TILE_H },
  "brakes-4": { x: 360 - BRAKE_TILE_W / 2, y: BRAKE_ROW_Y, w: BRAKE_TILE_W, h: BRAKE_TILE_H },
  "brakes-6": { x: 450 - BRAKE_TILE_W / 2, y: BRAKE_ROW_Y, w: BRAKE_TILE_W, h: BRAKE_TILE_H },
};

// ---------- cabin panel (HTML polygon overlay) ----------

export const CABIN_PANEL: BoardRect = {
  x: CABIN_PANEL_LEFT,
  y: CABIN_PANEL_TOP,
  w: COCKPIT_VIEWBOX.width - CABIN_PANEL_LEFT - SIDE_STRIP_WIDTH,
  h: CABIN_PANEL_HEIGHT,
};

// Kept for compatibility — same as CABIN_PANEL.
export const BOTTOM_PANEL: BoardRect = CABIN_PANEL;
export const COFFEE_ANCHOR: BoardPoint = { x: 48, y: CABIN_PANEL.y + CABIN_PANEL.h / 2 };

// ---------- approach + speed (lab doesn't sketch these — kept as-is) ----------

export const APPROACH_RIBBON: BoardRect = { x: 168, y: 110, w: 384, h: 36 };
export const SPEED_GAUGE: BoardRect = { x: 168, y: PLAY_AREA.y + 4, w: 384, h: 20 };
