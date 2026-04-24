import type { DiseaseColor, GameState } from "@boardgames/core/games/pandemic/types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActionLog } from "../../../components/action-log";
import { GameScreen } from "../../../components/game-layout";
import { useGameRenderer } from "../hooks/useGameRenderer";
import type { GameDispatch } from "../hooks/useGameState";
import type { DiscoverCureOption } from "../hooks/useInteraction";
import { useInteraction } from "../hooks/useInteraction";
import { mapPandemicLog } from "../log-mapper";
import type { HighlightState } from "../rendering/highlight-layer";
import type { GameAssets } from "../rendering/sprites";
import CureCardSelectionModal from "./CureCardSelectionModal";
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

  // Modal state for cure-card selection. Lifted here so the canvas hook can
  // remain side-effect-free — useInteraction just fires the callback and
  // this component owns the React tree.
  const [cureOptions, setCureOptions] = useState<DiscoverCureOption[] | null>(null);

  const handleRequestCureSelection = useCallback((options: DiscoverCureOption[]) => {
    setCureOptions(options);
  }, []);

  const handleCureConfirm = useCallback(
    (color: DiseaseColor, cardIndices: number[]) => {
      dispatch({ kind: "discover_cure", color, cardIndices });
      setCureOptions(null);
    },
    [dispatch],
  );

  const handleCureCancel = useCallback(() => {
    setCureOptions(null);
  }, []);

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
    handleRequestCureSelection,
  );

  const roles = useMemo(() => state.players.map((p) => p.role), [state.players]);

  return (
    <GameScreen
      background="bg-black"
      noPadding
      sidebar={<ActionLog blocks={mapPandemicLog(state.actionLog, roles)} />}
    >
      <div className="relative h-full w-full">
        <canvas ref={canvasRef} className="block h-full w-full" />
        <PlayerHandOverlay
          state={state}
          dispatch={dispatch}
          selectedCardIdx={selectedCardIdx}
          onSelectCard={setSelectedCardIdx}
        />
        {cureOptions && (
          <CureCardSelectionModal
            state={state}
            options={cureOptions}
            onConfirm={handleCureConfirm}
            onCancel={handleCureCancel}
          />
        )}
      </div>
    </GameScreen>
  );
}
