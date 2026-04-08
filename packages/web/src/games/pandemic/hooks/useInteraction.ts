import { CITY_DATA } from "@boardgames/core/games/pandemic/city-graph";
import { getLegalActions } from "@boardgames/core/games/pandemic/rules";
import type { DiseaseColor, GameState } from "@boardgames/core/games/pandemic/types";
import { DISEASE_COLORS } from "@boardgames/core/games/pandemic/types";
import { useCallback, useEffect, useRef } from "react";
import type { HighlightState } from "../rendering/highlight-layer";
import { testHit } from "../rendering/hit-test";
import type { GameRenderer, Viewport } from "../rendering/renderer";
import type { GameDispatch } from "./useGameState";

export interface InteractionMode {
  type: "normal" | "select_destination" | "select_discard" | "select_cure_cards";
  actionKind?: string;
  selectedCardIdx?: number;
  color?: DiseaseColor;
  requiredCards?: number;
  selectedCureCards?: number[];
}

export function useInteraction(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  rendererRef: React.MutableRefObject<GameRenderer | null>,
  viewportRef: React.MutableRefObject<Viewport>,
  stateRef: React.MutableRefObject<GameState | null>,
  highlightRef: React.MutableRefObject<HighlightState>,
  hoveredButtonRef: React.MutableRefObject<string | null>,
  selectedCardIdxRef: React.MutableRefObject<number | null>,
  onClearSelection: () => void,
  dispatch: GameDispatch,
) {
  const modeRef = useRef<InteractionMode>({ type: "normal" });

  // Auto-advance automated phases
  useEffect(() => {
    const state = stateRef.current;
    if (!state || state.result) return;

    if (state.phase === "draw" || state.phase === "epidemic" || state.phase === "infect") {
      const timer = setTimeout(
        () => {
          dispatch({ kind: "animate_complete" });
        },
        state.phase === "epidemic" ? 800 : 400,
      );
      return () => clearTimeout(timer);
    }
  });

  const handleClick = useCallback(
    (e: MouseEvent) => {
      const canvas = canvasRef.current;
      const renderer = rendererRef.current;
      const state = stateRef.current;
      if (!canvas || !renderer || !state || state.result) return;

      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;

      const regions = renderer.getAllHitRegions(viewportRef.current);
      const hit = testHit(regions, sx, sy);
      const mode = modeRef.current;

      if (!hit) {
        // Click on empty space — deselect
        onClearSelection();
        modeRef.current = { type: "normal" };
        highlightRef.current = {
          ...highlightRef.current,
          validDestinations: new Set(),
          selectedCity: null,
        };
        return;
      }

      // Handle destination selection mode
      if (mode.type === "select_destination" && hit.type === "city") {
        const cityId = hit.data as string;
        if (highlightRef.current.validDestinations.has(cityId)) {
          if (mode.actionKind === "charter_flight") {
            dispatch({ kind: "charter_flight", to: cityId });
          } else if (mode.actionKind === "ops_move" && mode.selectedCardIdx !== undefined) {
            dispatch({
              kind: "ops_move",
              to: cityId,
              cardIdx: mode.selectedCardIdx,
            });
          }
          modeRef.current = { type: "normal" };
          onClearSelection();
          highlightRef.current = {
            ...highlightRef.current,
            validDestinations: new Set(),
            selectedCity: null,
          };
          return;
        }
      }

      // Normal click handling
      if (hit.type === "city" && state.phase === "actions") {
        const cityId = hit.data as string;
        const legal = getLegalActions(state);

        // Try drive/ferry first
        const drive = legal.find((a) => a.kind === "drive_ferry" && a.to === cityId);
        if (drive) {
          dispatch(drive);
          modeRef.current = { type: "normal" };
          return;
        }

        // Try shuttle flight
        const shuttle = legal.find((a) => a.kind === "shuttle_flight" && a.to === cityId);
        if (shuttle) {
          dispatch(shuttle);
          modeRef.current = { type: "normal" };
          return;
        }

        // Try direct flight (if we have the card)
        const directFlight = legal.find(
          (a) =>
            a.kind === "direct_flight" &&
            state.players[state.currentPlayerIndex].hand[(a as { cardIdx: number }).cardIdx]
              ?.kind === "city" &&
            (
              state.players[state.currentPlayerIndex].hand[(a as { cardIdx: number }).cardIdx] as {
                cityId: string;
              }
            ).cityId === cityId,
        );
        if (directFlight) {
          dispatch(directFlight);
          modeRef.current = { type: "normal" };
          return;
        }
      }

      if (hit.type === "button" && state.phase === "actions") {
        const actionKind = hit.data as string;
        handleButtonClick(actionKind, state, dispatch, modeRef, highlightRef, selectedCardIdxRef);
      }
    },
    [
      canvasRef,
      dispatch,
      highlightRef,
      onClearSelection,
      rendererRef.current,
      selectedCardIdxRef,
      stateRef.current,
      viewportRef.current,
    ],
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      const canvas = canvasRef.current;
      const renderer = rendererRef.current;
      if (!canvas || !renderer) return;

      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;

      const regions = renderer.getAllHitRegions(viewportRef.current);
      const hit = testHit(regions, sx, sy);

      if (hit) {
        canvas.style.cursor = hit.cursor ?? "default";
        if (hit.type === "city") {
          highlightRef.current = {
            ...highlightRef.current,
            hoveredCity: hit.data as string,
          };
        } else {
          highlightRef.current = {
            ...highlightRef.current,
            hoveredCity: null,
          };
        }
        if (hit.type === "button") {
          hoveredButtonRef.current = hit.data as string;
        } else {
          hoveredButtonRef.current = null;
        }
      } else {
        canvas.style.cursor = "default";
        highlightRef.current = {
          ...highlightRef.current,
          hoveredCity: null,
        };
        hoveredButtonRef.current = null;
      }
    },
    [canvasRef, highlightRef, hoveredButtonRef, rendererRef.current, viewportRef.current],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.addEventListener("click", handleClick);
    canvas.addEventListener("mousemove", handleMouseMove);

    return () => {
      canvas.removeEventListener("click", handleClick);
      canvas.removeEventListener("mousemove", handleMouseMove);
    };
  }, [handleClick, handleMouseMove, canvasRef.current]);

  // Update valid destinations when state changes
  useEffect(() => {
    const state = stateRef.current;
    if (!state || state.phase !== "actions") {
      highlightRef.current = {
        ...highlightRef.current,
        validDestinations: new Set(),
      };
      return;
    }

    const legal = getLegalActions(state);
    const destinations = new Set<string>();

    for (const action of legal) {
      if (action.kind === "drive_ferry") destinations.add(action.to);
      if (action.kind === "shuttle_flight") destinations.add(action.to);
      if (action.kind === "direct_flight") {
        const card = state.players[state.currentPlayerIndex].hand[action.cardIdx];
        if (card?.kind === "city") destinations.add(card.cityId);
      }
    }

    highlightRef.current = {
      ...highlightRef.current,
      validDestinations: destinations,
    };
  });
}

function handleButtonClick(
  actionKind: string,
  state: GameState,
  dispatch: GameDispatch,
  modeRef: React.MutableRefObject<InteractionMode>,
  highlightRef: React.MutableRefObject<HighlightState>,
  selectedCardIdxRef: React.MutableRefObject<number | null>,
): void {
  const legal = getLegalActions(state);

  switch (actionKind) {
    case "pass":
      dispatch({ kind: "pass" });
      break;

    case "build_station": {
      const action = legal.find((a) => a.kind === "build_station");
      if (action) dispatch(action);
      break;
    }

    case "treat_disease": {
      const treatActions = legal.filter((a) => a.kind === "treat_disease");
      if (treatActions.length === 1) {
        dispatch(treatActions[0]);
      } else if (treatActions.length > 1) {
        // Treat the color with the most cubes first
        const loc = state.players[state.currentPlayerIndex].location;
        let maxColor: DiseaseColor = "blue";
        let maxCount = 0;
        for (const color of DISEASE_COLORS) {
          if (state.cityCubes[loc][color] > maxCount) {
            maxCount = state.cityCubes[loc][color];
            maxColor = color;
          }
        }
        dispatch({ kind: "treat_disease", color: maxColor });
      }
      break;
    }

    case "discover_cure": {
      const action = legal.find((a) => a.kind === "discover_cure");
      if (action) dispatch(action);
      break;
    }

    case "share_give":
    case "share_take": {
      const shareAction = legal.find((a) => a.kind === "share_give" || a.kind === "share_take");
      if (shareAction) dispatch(shareAction);
      break;
    }

    case "charter_flight": {
      // Need destination selection
      modeRef.current = { type: "select_destination", actionKind: "charter_flight" };
      // All cities are valid destinations
      const allCities = new Set(Array.from(CITY_DATA.keys()));
      allCities.delete(state.players[state.currentPlayerIndex].location);
      highlightRef.current = {
        ...highlightRef.current,
        validDestinations: allCities,
      };
      break;
    }

    case "ops_move": {
      const selectedIdx = selectedCardIdxRef.current;
      if (selectedIdx !== null) {
        modeRef.current = {
          type: "select_destination",
          actionKind: "ops_move",
          selectedCardIdx: selectedIdx,
        };
        const allCities = new Set(Array.from(CITY_DATA.keys()));
        allCities.delete(state.players[state.currentPlayerIndex].location);
        highlightRef.current = {
          ...highlightRef.current,
          validDestinations: allCities,
        };
      }
      break;
    }

    case "drive_ferry":
    case "direct_flight":
    case "shuttle_flight":
      // These are handled by clicking on the city directly
      break;

    case "dispatcher_move_to_pawn": {
      const action = legal.find((a) => a.kind === "dispatcher_move_to_pawn");
      if (action) dispatch(action);
      break;
    }

    case "contingency_take": {
      const action = legal.find((a) => a.kind === "contingency_take");
      if (action) dispatch(action);
      break;
    }

    case "play_event": {
      // Find first event card in hand and play it
      const player = state.players[state.currentPlayerIndex];
      const eventIdx = player.hand.findIndex((c) => c.kind === "event");
      if (eventIdx >= 0) {
        const card = player.hand[eventIdx];
        if (card.kind === "event") {
          if (card.event === "one_quiet_night") {
            dispatch({
              kind: "play_event",
              event: card.event,
              params: {},
            });
          }
          // Other events need parameter selection — for now dispatch with defaults
          // A full UI would show a modal for parameter selection
        }
      }
      break;
    }
  }
}
