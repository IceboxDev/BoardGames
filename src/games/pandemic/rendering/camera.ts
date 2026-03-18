import type { Viewport } from "./renderer";

const REFERENCE_WIDTH = 1920;
const REFERENCE_HEIGHT = 1080;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2.0;

export function fitToContainer(containerW: number, containerH: number): Viewport {
  const scale = Math.min(containerW / REFERENCE_WIDTH, containerH / REFERENCE_HEIGHT);

  const drawW = REFERENCE_WIDTH * scale;
  const drawH = REFERENCE_HEIGHT * scale;

  return {
    offsetX: (containerW - drawW) / 2,
    offsetY: (containerH - drawH) / 2,
    scale,
    width: containerW,
    height: containerH,
  };
}

export function pan(viewport: Viewport, dx: number, dy: number): Viewport {
  const maxPanX = REFERENCE_WIDTH * viewport.scale * 0.3;
  const maxPanY = REFERENCE_HEIGHT * viewport.scale * 0.3;

  return {
    ...viewport,
    offsetX: Math.max(-maxPanX, Math.min(maxPanX + viewport.width, viewport.offsetX + dx)),
    offsetY: Math.max(-maxPanY, Math.min(maxPanY + viewport.height, viewport.offsetY + dy)),
  };
}

export function zoom(
  viewport: Viewport,
  delta: number,
  centerX: number,
  centerY: number,
): Viewport {
  const factor = delta > 0 ? 1.1 : 0.9;
  const newScale = Math.max(
    MIN_ZOOM * (viewport.width / REFERENCE_WIDTH),
    Math.min(MAX_ZOOM * (viewport.width / REFERENCE_WIDTH), viewport.scale * factor),
  );

  const ratio = newScale / viewport.scale;

  return {
    ...viewport,
    scale: newScale,
    offsetX: centerX - (centerX - viewport.offsetX) * ratio,
    offsetY: centerY - (centerY - viewport.offsetY) * ratio,
  };
}

export { REFERENCE_HEIGHT, REFERENCE_WIDTH };
