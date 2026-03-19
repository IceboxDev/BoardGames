import type { GameState } from "@boardgames/core/games/pandemic/types";
import { useEffect, useRef } from "react";
import { useGameRenderer } from "../hooks/useGameRenderer";
import type { GameDispatch } from "../hooks/useGameState";
import { useInteraction } from "../hooks/useInteraction";
import type { HandState } from "../rendering/hand-layer";
import type { HighlightState } from "../rendering/highlight-layer";
import type { GameAssets } from "../rendering/sprites";

interface GameCanvasProps {
  state: GameState;
  dispatch: GameDispatch;
  assets: GameAssets;
}

export default function GameCanvas({ state, dispatch, assets }: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const stateRef = useRef<GameState | null>(state);
  const highlightRef = useRef<HighlightState>({
    hoveredCity: null,
    validDestinations: new Set(),
    selectedCity: null,
  });
  const handStateRef = useRef<HandState>({ selectedCardIdx: null });
  const hoveredButtonRef = useRef<string | null>(null);

  // Keep stateRef in sync
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const { rendererRef, viewportRef } = useGameRenderer(canvasRef, assets, {
    stateRef,
    highlightRef,
    handStateRef,
    hoveredButtonRef,
  });

  useInteraction(
    canvasRef,
    rendererRef,
    viewportRef,
    stateRef,
    highlightRef,
    handStateRef,
    hoveredButtonRef,
    dispatch,
  );

  return (
    <div className="h-[calc(100vh-64px)] w-full bg-black">
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  );
}
