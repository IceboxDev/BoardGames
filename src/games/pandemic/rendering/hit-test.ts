import type { Viewport } from "./renderer";

export interface HitRegion {
  id: string;
  type: "city" | "card" | "button" | "cube" | "station" | "discard";
  bounds: { x: number; y: number; w: number; h: number };
  data: unknown;
  cursor?: string;
}

export function testHit(regions: HitRegion[], wx: number, wy: number): HitRegion | null {
  for (const region of regions) {
    const { x, y, w, h } = region.bounds;
    if (wx >= x && wx <= x + w && wy >= y && wy <= y + h) {
      return region;
    }
  }
  return null;
}

export function screenToWorld(
  sx: number,
  sy: number,
  viewport: Viewport,
  dpr: number,
): { x: number; y: number } {
  return {
    x: (sx / dpr - viewport.offsetX) / viewport.scale + viewport.offsetX / viewport.scale,
    y: (sy / dpr - viewport.offsetY) / viewport.scale + viewport.offsetY / viewport.scale,
  };
}

export function screenToWorldSimple(
  sx: number,
  sy: number,
  viewport: Viewport,
): { x: number; y: number } {
  return {
    x: (sx - viewport.offsetX) / viewport.scale,
    y: (sy - viewport.offsetY) / viewport.scale,
  };
}
