export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Color {
  r: number;
  g: number;
  b: number;
  a?: number;
}

export function colorToCSS(c: Color): string {
  return c.a !== undefined ? `rgba(${c.r},${c.g},${c.b},${c.a})` : `rgb(${c.r},${c.g},${c.b})`;
}
