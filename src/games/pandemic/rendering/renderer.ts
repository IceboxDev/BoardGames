import type { HitRegion } from "./hit-test";

export interface Viewport {
  offsetX: number;
  offsetY: number;
  scale: number;
  width: number;
  height: number;
}

export interface RenderLayer {
  id: string;
  zIndex: number;
  dirty: boolean;
  render(ctx: CanvasRenderingContext2D, viewport: Viewport): void;
  getHitRegions?(viewport: Viewport): HitRegion[];
}

export class GameRenderer {
  private layers: RenderLayer[] = [];

  addLayer(layer: RenderLayer): void {
    this.layers.push(layer);
    this.layers.sort((a, b) => a.zIndex - b.zIndex);
  }

  removeLayer(id: string): void {
    this.layers = this.layers.filter((l) => l.id !== id);
  }

  render(ctx: CanvasRenderingContext2D, viewport: Viewport): void {
    for (const layer of this.layers) {
      layer.render(ctx, viewport);
    }
  }

  markAllDirty(): void {
    for (const layer of this.layers) {
      layer.dirty = true;
    }
  }

  getAllHitRegions(viewport: Viewport): HitRegion[] {
    const regions: HitRegion[] = [];
    // Iterate in reverse z-order so topmost layers are first
    for (let i = this.layers.length - 1; i >= 0; i--) {
      const layer = this.layers[i];
      if (layer.getHitRegions) {
        regions.push(...layer.getHitRegions(viewport));
      }
    }
    return regions;
  }
}
