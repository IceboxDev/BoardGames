export interface BoardViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BoardPoint {
  x: number;
  y: number;
}

export interface BoardRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type BoardSlotVariant = "pilot" | "copilot" | "neutral" | "mixed" | "system";
