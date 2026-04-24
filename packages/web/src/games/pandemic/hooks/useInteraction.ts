import { getLegalActions } from "@boardgames/core/games/pandemic/rules";
import type { DiseaseColor, GameState, LegalAction } from "@boardgames/core/games/pandemic/types";
import { DISEASE_COLORS } from "@boardgames/core/games/pandemic/types";
import { useCallback, useEffect, useRef } from "react";
import type { HighlightState } from "../rendering/highlight-layer";
import { testHit } from "../rendering/hit-test";
import type { GameRenderer, Viewport } from "../rendering/renderer";
import type { GameDispatch } from "./useGameState";

export type DiscoverCureOption = Extract<LegalAction, { kind: "discover_cure" }>;

/**
 * Called when the user clicks "Discover Cure" — we can't construct the
 * GameAction up-front because the player has to pick which cards to burn.
 * The host component opens a modal, lets the player choose, then dispatches
 * `discover_cure` with the chosen indices.
 */
export type OnRequestCureSelection = (options: DiscoverCureOption[]) => void;

export interface InteractionMode {
  type: "normal" | "select_destination";
  actionKind?: "charter_flight" | "ops_move";
  selectedCardIdx?: number;
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
  onRequestCureSelection: OnRequestCureSelection,
) {
  const modeRef = useRef<InteractionMode>({ type: "normal" });
  const onRequestCureSelectionRef = useRef(onRequestCureSelection);
  useEffect(() => {
    onRequestCureSelectionRef.current = onRequestCureSelection;
  }, [onRequestCureSelection]);

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
        const hand = state.players[state.currentPlayerIndex].hand;

        // Try drive/ferry first
        const drive = legal.find(
          (a): a is Extract<LegalAction, { kind: "drive_ferry" }> =>
            a.kind === "drive_ferry" && a.to === cityId,
        );
        if (drive) {
          dispatch(drive);
          modeRef.current = { type: "normal" };
          return;
        }

        // Try shuttle flight
        const shuttle = legal.find(
          (a): a is Extract<LegalAction, { kind: "shuttle_flight" }> =>
            a.kind === "shuttle_flight" && a.to === cityId,
        );
        if (shuttle) {
          dispatch(shuttle);
          modeRef.current = { type: "normal" };
          return;
        }

        // Try direct flight (if we have the card)
        const directFlight = legal.find(
          (a): a is Extract<LegalAction, { kind: "direct_flight" }> => {
            if (a.kind !== "direct_flight") return false;
            const card = hand[a.cardIdx];
            return card?.kind === "city" && card.cityId === cityId;
          },
        );
        if (directFlight) {
          dispatch(directFlight);
          modeRef.current = { type: "normal" };
          return;
        }
      }

      if (hit.type === "button" && state.phase === "actions") {
        const actionKind = hit.data as string;
        handleButtonClick(
          actionKind,
          state,
          dispatch,
          modeRef,
          highlightRef,
          selectedCardIdxRef,
          onRequestCureSelectionRef.current,
        );
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
    const hand = state.players[state.currentPlayerIndex].hand;

    for (const action of legal) {
      if (action.kind === "drive_ferry") destinations.add(action.to);
      if (action.kind === "shuttle_flight") destinations.add(action.to);
      if (action.kind === "direct_flight") {
        const card = hand[action.cardIdx];
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
  onRequestCureSelection: OnRequestCureSelection,
): void {
  const legal = getLegalActions(state);

  switch (actionKind) {
    case "pass":
      dispatch({ kind: "pass" });
      break;

    case "build_station": {
      const action = legal.find(
        (a): a is Extract<LegalAction, { kind: "build_station" }> => a.kind === "build_station",
      );
      if (action) dispatch(action);
      break;
    }

    case "treat_disease": {
      const treatActions = legal.filter(
        (a): a is Extract<LegalAction, { kind: "treat_disease" }> => a.kind === "treat_disease",
      );
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
      // Open the card-selection modal — the player picks exactly `needed`
      // cards (and the color, if multiple cures are simultaneously ready).
      const options = legal.filter((a): a is DiscoverCureOption => a.kind === "discover_cure");
      if (options.length > 0) {
        onRequestCureSelection(options);
      }
      break;
    }

    case "share_give":
    case "share_take": {
      const shareAction = legal.find(
        (
          a,
        ): a is
          | Extract<LegalAction, { kind: "share_give" }>
          | Extract<LegalAction, { kind: "share_take" }> =>
          a.kind === "share_give" || a.kind === "share_take",
      );
      if (shareAction) dispatch(shareAction);
      break;
    }

    case "charter_flight": {
      const charter = legal.find(
        (a): a is Extract<LegalAction, { kind: "charter_flight" }> => a.kind === "charter_flight",
      );
      if (charter) {
        modeRef.current = { type: "select_destination", actionKind: "charter_flight" };
        highlightRef.current = {
          ...highlightRef.current,
          validDestinations: new Set(charter.destinations),
        };
      }
      break;
    }

    case "ops_move": {
      const selectedIdx = selectedCardIdxRef.current;
      if (selectedIdx === null) break;
      const opsMove = legal.find(
        (a): a is Extract<LegalAction, { kind: "ops_move" }> =>
          a.kind === "ops_move" && a.cardIdx === selectedIdx,
      );
      if (opsMove) {
        modeRef.current = {
          type: "select_destination",
          actionKind: "ops_move",
          selectedCardIdx: selectedIdx,
        };
        highlightRef.current = {
          ...highlightRef.current,
          validDestinations: new Set(opsMove.destinations),
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
      const action = legal.find(
        (a): a is Extract<LegalAction, { kind: "dispatcher_move_to_pawn" }> =>
          a.kind === "dispatcher_move_to_pawn",
      );
      if (action) dispatch(action);
      break;
    }

    case "contingency_take": {
      const action = legal.find(
        (a): a is Extract<LegalAction, { kind: "contingency_take" }> =>
          a.kind === "contingency_take",
      );
      if (action) dispatch(action);
      break;
    }

    case "play_event": {
      // MVP: only one_quiet_night (no params) dispatches from the button.
      // Other events require a dedicated parameter picker UI (airlift target,
      // government_grant destination, resilient_population discard pick,
      // forecast reorder). Those are enumerated in legal actions but need
      // per-event modals to resolve — tracked separately.
      const player = state.players[state.currentPlayerIndex];
      const eventIdx = player.hand.findIndex(
        (c) => c.kind === "event" && c.event === "one_quiet_night",
      );
      if (eventIdx >= 0) {
        dispatch({
          kind: "play_event",
          event: "one_quiet_night",
          params: {},
        });
      }
      break;
    }
  }
}
