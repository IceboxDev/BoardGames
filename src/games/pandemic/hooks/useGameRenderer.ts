import { useCallback, useEffect, useRef } from "react";
import useGameLoop from "../../../engine/useGameLoop";
import type { GameState } from "../logic/types";
import { createActionPanelLayer } from "../rendering/action-panel-layer";
import { createBoardLayer } from "../rendering/board-layer";
import { fitToContainer } from "../rendering/camera";
import { createGameStateLayer } from "../rendering/game-state-layer";
import { createHandLayer, type HandState } from "../rendering/hand-layer";
import { createHighlightLayer, type HighlightState } from "../rendering/highlight-layer";
import { createInfoLayer } from "../rendering/info-layer";
import { createLogLayer } from "../rendering/log-layer";
import type { Viewport } from "../rendering/renderer";
import { GameRenderer } from "../rendering/renderer";
import type { GameAssets } from "../rendering/sprites";
import { createTooltipLayer } from "../rendering/tooltip-layer";
import { createTrackLayer } from "../rendering/track-layer";

export interface RendererRefs {
  stateRef: React.MutableRefObject<GameState | null>;
  highlightRef: React.MutableRefObject<HighlightState>;
  handStateRef: React.MutableRefObject<HandState>;
  hoveredButtonRef: React.MutableRefObject<string | null>;
}

export function useGameRenderer(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  assets: GameAssets | null,
  refs: RendererRefs,
) {
  const rendererRef = useRef<GameRenderer | null>(null);
  const viewportRef = useRef<Viewport>({
    offsetX: 0,
    offsetY: 0,
    scale: 1,
    width: 1920,
    height: 1080,
  });

  // Initialize layers when assets are loaded
  useEffect(() => {
    if (!assets) return;

    const renderer = new GameRenderer();

    renderer.addLayer(createBoardLayer(assets));
    renderer.addLayer(createGameStateLayer(refs.stateRef));
    renderer.addLayer(createTrackLayer(refs.stateRef));
    renderer.addLayer(createHighlightLayer(refs.highlightRef));
    renderer.addLayer(createHandLayer(refs.stateRef, refs.handStateRef));
    renderer.addLayer(createActionPanelLayer(refs.stateRef, refs.hoveredButtonRef));
    renderer.addLayer(createInfoLayer(refs.stateRef));
    renderer.addLayer(createLogLayer(refs.stateRef));
    renderer.addLayer(createTooltipLayer(refs.stateRef, refs.highlightRef));

    rendererRef.current = renderer;

    return () => {
      rendererRef.current = null;
    };
  }, [assets, refs.handStateRef, refs.highlightRef, refs.hoveredButtonRef, refs.stateRef]);

  // Resize handling
  const updateViewport = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const parent = canvas.parentElement;
    if (!parent) return;

    const containerW = parent.clientWidth;
    const containerH = parent.clientHeight;

    viewportRef.current = fitToContainer(containerW, containerH);

    const dpr = window.devicePixelRatio || 1;
    canvas.width = containerW * dpr;
    canvas.height = containerH * dpr;
    canvas.style.width = `${containerW}px`;
    canvas.style.height = `${containerH}px`;
  }, [canvasRef]);

  useEffect(() => {
    updateViewport();
    window.addEventListener("resize", updateViewport);
    return () => window.removeEventListener("resize", updateViewport);
  }, [updateViewport]);

  // Game loop rendering
  useGameLoop(() => {
    const canvas = canvasRef.current;
    const renderer = rendererRef.current;
    if (!canvas || !renderer) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Clear
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, viewportRef.current.width, viewportRef.current.height);

    renderer.render(ctx, viewportRef.current);
  }, !!assets);

  return { rendererRef, viewportRef };
}
