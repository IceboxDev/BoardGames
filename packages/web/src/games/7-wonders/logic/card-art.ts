import type { CSSProperties } from "react";
import cardsSheet from "../assets/cards.webp";

/**
 * The printed card art: one sprite sheet (BGA's, 10 × 8 cells of 255 × 393)
 * addressed by the cell index BGA calls `img` (0–76, row-major). It prints
 * the 2020 second edition, the edition the engine plays. The map is keyed by
 * OUR card names — four are spelled differently on BGA (Apothocary, Bazaar,
 * Craftsmen Guild, and Pawnshop for the Well).
 */
export const SHEET_URL: string = cardsSheet;

export const SHEET = { cols: 10, rows: 8, cellW: 255, cellH: 393 } as const;

export const SPRITE_CELL: Readonly<Record<string, number>> = {
  // Age I
  "Stone Pit": 0,
  "Clay Pool": 1,
  "Ore Vein": 2,
  "Tree Farm": 3,
  Excavation: 4,
  "Clay Pit": 5,
  "Timber Yard": 6,
  "Forest Cave": 7,
  Mine: 8,
  "Lumber Yard": 74,
  Loom: 9,
  Glassworks: 10,
  Press: 11,
  Barracks: 12,
  Stockade: 13,
  "Guard Tower": 14,
  Apothecary: 15,
  Scriptorium: 16,
  Workshop: 17,
  "East Trading Post": 18,
  "West Trading Post": 19,
  Marketplace: 20,
  Tavern: 21,
  Theater: 22,
  Well: 23,
  Altar: 24,
  Baths: 25,
  // Age II
  Sawmill: 26,
  Quarry: 27,
  Brickyard: 28,
  Foundry: 29,
  Stables: 30,
  Walls: 31,
  "Archery Range": 32,
  "Training Ground": 33,
  Laboratory: 34,
  School: 35,
  Dispensary: 36,
  Library: 37,
  Vineyard: 38,
  Bazar: 39,
  Forum: 40,
  Caravansery: 41,
  Courthouse: 42,
  Statue: 43,
  Temple: 44,
  Aqueduct: 45,
  // Age III
  Circus: 46,
  Arsenal: 47,
  Fortifications: 48,
  "Siege Workshop": 49,
  Castrum: 76,
  Observatory: 50,
  Academy: 51,
  University: 52,
  Lodge: 53,
  Study: 54,
  Arena: 55,
  Ludus: 75,
  "Chamber of Commerce": 56,
  Haven: 57,
  Lighthouse: 58,
  Palace: 59,
  Gardens: 60,
  Pantheon: 61,
  "Town Hall": 62,
  Senate: 63,
  "Workers Guild": 64,
  "Craftsmens Guild": 65,
  "Traders Guild": 66,
  "Philosophers Guild": 67,
  "Spies Guild": 68,
  "Decorators Guild": 69,
  "Shipowners Guild": 70,
  "Scientists Guild": 71,
  "Magistrates Guild": 72,
  "Builders Guild": 73,
};

/** Cards the sheet has no art for — they draw the CSS face. Every card has art. */
export const NO_ART: readonly string[] = [];

export function spriteCell(name: string): number | undefined {
  return SPRITE_CELL[name];
}

/** A rectangle of a cell, in the cell's own pixels. */
export interface CellRegion {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const FULL_CELL: CellRegion = { x: 0, y: 0, w: SHEET.cellW, h: SHEET.cellH };

/**
 * Background styles that fill a box of the given aspect (width / height)
 * with one region of one cell, cropped like `object-fit: cover` and centred.
 * Everything is in percentages, so the box can be any size.
 */
export function spriteStyle(
  cell: number,
  boxAspect = 2 / 3,
  region: CellRegion = FULL_CELL,
): CSSProperties {
  const { x, y, sizePct } = spriteGeometry(cell, boxAspect, region);
  return {
    backgroundImage: `url(${SHEET_URL})`,
    backgroundSize: `${sizePct}% auto`,
    backgroundPosition: `${x}% ${y}%`,
    backgroundRepeat: "no-repeat",
  };
}

/**
 * The maths behind `spriteStyle`, in units of the box's width: the scale
 * (box widths per sheet pixel), the background-size and positions, and where
 * the region lands in the box (for tests).
 */
export function spriteGeometry(cell: number, boxAspect: number, region: CellRegion) {
  const { cols, rows, cellW, cellH } = SHEET;
  const sheetW = cols * cellW;
  const sheetH = rows * cellH;
  const boxW = 1;
  const boxH = 1 / boxAspect;
  // Cover: the region fills the box on its tighter axis.
  const scale = Math.max(boxW / region.w, boxH / region.h);
  const left = (cell % cols) * cellW + region.x;
  const top = Math.floor(cell / cols) * cellH + region.y;
  // Sheet offset (box units) that centres the region.
  const offX = -left * scale + (boxW - region.w * scale) / 2;
  const offY = -top * scale + (boxH - region.h * scale) / 2;
  const pct = (off: number, box: number, sheet: number) =>
    sheet * scale === box ? 0 : (off / (box - sheet * scale)) * 100;
  return {
    scale,
    sizePct: sheetW * scale * 100,
    x: pct(offX, boxW, sheetW),
    y: pct(offY, boxH, sheetH),
    /** The region's rectangle inside the box, in box widths. */
    placed: {
      left: offX + left * scale,
      top: offY + top * scale,
      width: region.w * scale,
      height: region.h * scale,
    },
  };
}

/**
 * A printed card's true shape, width : height — the sheet's 255 × 393 cell,
 * a 65 × 100 mm card. Cards are drawn at exactly this, never cropped to 2:3.
 */
export const CARD_ASPECT = SHEET.cellW / SHEET.cellH;

/**
 * The printed band's share of the card's height: it ends at y 110 of the
 * 393 px cell, so a tucked card shows exactly this.
 */
export const BAND_SHARE = 110 / SHEET.cellH;

/** Lighten (amount > 0) or darken (< 0) a #rrggbb colour. */
export function shade(hex: string, amount: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const channel = (c: number) => {
    const v = amount >= 0 ? c + (255 - c) * amount : c * (1 + amount);
    return Math.max(0, Math.min(255, Math.round(v)))
      .toString(16)
      .padStart(2, "0");
  };
  return `#${channel((n >> 16) & 255)}${channel((n >> 8) & 255)}${channel(n & 255)}`;
}
