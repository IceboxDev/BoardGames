import type { GameState } from "@boardgames/core/games/pandemic/types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HistorySidebar } from "../../../components/action-log";
import { useGameRenderer } from "../hooks/useGameRenderer";
import type { GameDispatch } from "../hooks/useGameState";
import { useInteraction } from "../hooks/useInteraction";
import type { HighlightState } from "../rendering/highlight-layer";
import type { GameAssets } from "../rendering/sprites";
import PandemicActionLog from "./ActionLog";
import PlayerHandOverlay from "./PlayerHandOverlay";

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
  const hoveredButtonRef = useRef<string | null>(null);

  // Card selection: React-owned state, ref-synced for canvas interaction
  const [selectedCardIdx, setSelectedCardIdx] = useState<number | null>(null);
  const selectedCardIdxRef = useRef<number | null>(null);
  useEffect(() => {
    selectedCardIdxRef.current = selectedCardIdx;
  }, [selectedCardIdx]);

  const clearSelection = useCallback(() => setSelectedCardIdx(null), []);

  // Keep stateRef in sync
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const { rendererRef, viewportRef } = useGameRenderer(canvasRef, assets, {
    stateRef,
    highlightRef,
    hoveredButtonRef,
  });

  useInteraction(
    canvasRef,
    rendererRef,
    viewportRef,
    stateRef,
    highlightRef,
    hoveredButtonRef,
    selectedCardIdxRef,
    clearSelection,
    dispatch,
  );

  const roles = useMemo(() => state.players.map((p) => p.role), [state.players]);

  return (
    <HistorySidebar
      className="bg-black"
      noPadding
      sidebar={<PandemicActionLog actionLog={state.actionLog} roles={roles} />}
    >
      <div className="relative h-full w-full">
        <canvas ref={canvasRef} className="block h-full w-full" />
        <PlayerHandOverlay
          state={state}
          dispatch={dispatch}
          selectedCardIdx={selectedCardIdx}
          onSelectCard={setSelectedCardIdx}
        />
      </div>
    </HistorySidebar>
  );
}
