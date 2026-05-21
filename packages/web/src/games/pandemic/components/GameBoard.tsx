import { getLegalActions } from "@boardgames/core/games/pandemic/rules";
import type { DiseaseColor, GameState, LegalAction } from "@boardgames/core/games/pandemic/types";
import { useCallback, useMemo, useState } from "react";
import { ActionLog } from "../../../components/action-log";
import { GameScreen } from "../../../components/game-layout";
import { type ActionKind, deriveActionButtons } from "../action-buttons";
import {
  deriveLegalDestinations,
  type GameDispatch,
  type InteractionMode,
  pickTreatDiseaseAction,
  resolveCityClick,
} from "../interaction";
import { mapPandemicLog } from "../log-mapper";
import ActionButtons from "./ActionButtons";
import PandemicMap from "./board/PandemicMap";
import CityTooltip from "./CityTooltip";
import CureCardSelectionModal from "./CureCardSelectionModal";
import InfoBar from "./InfoBar";
import PlayerHandOverlay from "./PlayerHandOverlay";
import PlayerStrip from "./PlayerStrip";
import TrackPanel from "./TrackPanel";

export type DiscoverCureOption = Extract<LegalAction, { kind: "discover_cure" }>;

interface Props {
  state: GameState;
  dispatch: GameDispatch;
}

/**
 * The full-board surface. Replaces the canvas-era GameCanvas + useInteraction
 * + 11 layer files with a tree of React components:
 *
 *   • <PandemicMap> renders the SVG board (cities, connections, cubes,
 *     stations, pawns) and surfaces clicks/hover via standard handlers.
 *   • <InfoBar>, <PlayerStrip>, <TrackPanel>, <ActionButtons> are HUD
 *     overlays in plain HTML, positioned absolutely above the map.
 *   • <CityTooltip> appears when a city is hovered.
 *   • The bottom card fan (<PlayerHandOverlay>) and the cure-card modal
 *     are unchanged DOM components from before the port.
 *
 * Every interaction is React state — no more imperative refs.
 */
export default function GameBoard({ state, dispatch }: Props) {
  const [mode, setMode] = useState<InteractionMode>({ kind: "normal" });
  const [hoveredCityId, setHoveredCityId] = useState<string | null>(null);
  const [selectedCardIdx, setSelectedCardIdx] = useState<number | null>(null);
  const [cureOptions, setCureOptions] = useState<DiscoverCureOption[] | null>(null);

  const legalActions = useMemo<readonly LegalAction[]>(() => getLegalActions(state), [state]);

  const buttons = useMemo(() => deriveActionButtons(state, legalActions), [state, legalActions]);

  const legalDestinations = useMemo(
    () => deriveLegalDestinations(legalActions, state.players[state.currentPlayerIndex].hand, mode),
    [legalActions, state, mode],
  );

  const roles = useMemo(() => state.players.map((p) => p.role), [state.players]);

  const goNormal = useCallback(() => setMode({ kind: "normal" }), []);

  const handleCityClick = useCallback(
    (cityId: string) => {
      if (state.result !== null) return;
      const action = resolveCityClick(cityId, state, legalActions, mode);
      if (action) {
        dispatch(action);
        goNormal();
        setSelectedCardIdx(null);
      }
    },
    [state, legalActions, mode, dispatch, goNormal],
  );

  const handleAction = useCallback(
    (kind: ActionKind) => {
      // Re-clicking the armed button cancels destination-pick mode.
      if (
        mode.kind === "select_destination" &&
        (kind === "charter_flight" || kind === "ops_move") &&
        mode.action === kind
      ) {
        goNormal();
        return;
      }

      switch (kind) {
        case "pass":
          dispatch({ kind: "pass" });
          break;
        case "build_station": {
          const action = legalActions.find(
            (a): a is Extract<LegalAction, { kind: "build_station" }> => a.kind === "build_station",
          );
          if (action) dispatch(action);
          break;
        }
        case "treat_disease": {
          const action = pickTreatDiseaseAction(state, legalActions);
          if (action) dispatch(action);
          break;
        }
        case "discover_cure": {
          const options = legalActions.filter(
            (a): a is DiscoverCureOption => a.kind === "discover_cure",
          );
          if (options.length > 0) setCureOptions(options);
          break;
        }
        case "share_give": {
          const action = legalActions.find(
            (
              a,
            ): a is
              | Extract<LegalAction, { kind: "share_give" }>
              | Extract<LegalAction, { kind: "share_take" }> =>
              a.kind === "share_give" || a.kind === "share_take",
          );
          if (action) dispatch(action);
          break;
        }
        case "charter_flight": {
          const charter = legalActions.find(
            (a): a is Extract<LegalAction, { kind: "charter_flight" }> =>
              a.kind === "charter_flight",
          );
          if (charter) {
            setMode({
              kind: "select_destination",
              action: "charter_flight",
              destinations: new Set(charter.destinations),
            });
          }
          break;
        }
        case "ops_move": {
          if (selectedCardIdx === null) break;
          const opsMove = legalActions.find(
            (a): a is Extract<LegalAction, { kind: "ops_move" }> =>
              a.kind === "ops_move" && a.cardIdx === selectedCardIdx,
          );
          if (opsMove) {
            setMode({
              kind: "select_destination",
              action: "ops_move",
              cardIdx: selectedCardIdx,
              destinations: new Set(opsMove.destinations),
            });
          }
          break;
        }
        case "dispatcher_move_to_pawn": {
          const action = legalActions.find(
            (a): a is Extract<LegalAction, { kind: "dispatcher_move_to_pawn" }> =>
              a.kind === "dispatcher_move_to_pawn",
          );
          if (action) dispatch(action);
          break;
        }
        case "contingency_take": {
          const action = legalActions.find(
            (a): a is Extract<LegalAction, { kind: "contingency_take" }> =>
              a.kind === "contingency_take",
          );
          if (action) dispatch(action);
          break;
        }
        case "play_event": {
          // MVP: only `one_quiet_night` has no parameters and dispatches
          // straight from the button. Airlift / Government Grant / Resilient
          // Population / Forecast need dedicated param pickers — tracked
          // as a follow-up. Same scope the canvas version shipped with.
          const player = state.players[state.currentPlayerIndex];
          const idx = player.hand.findIndex(
            (c) => c.kind === "event" && c.event === "one_quiet_night",
          );
          if (idx >= 0) {
            dispatch({ kind: "play_event", event: "one_quiet_night", params: {} });
          }
          break;
        }
        // direct_flight / drive_ferry / shuttle_flight are handled by
        // clicking the city directly — buttons exist only for affordance.
        default:
          break;
      }
    },
    [mode, legalActions, dispatch, state, selectedCardIdx, goNormal],
  );

  const handleCureConfirm = useCallback(
    (color: DiseaseColor, cardIndices: number[]) => {
      dispatch({ kind: "discover_cure", color, cardIndices });
      setCureOptions(null);
    },
    [dispatch],
  );

  const activeAction =
    mode.kind === "select_destination" ? (mode.action satisfies ActionKind) : null;

  return (
    <GameScreen
      background="bg-black"
      noPadding
      sidebar={<ActionLog blocks={mapPandemicLog(state.actionLog, roles)} />}
    >
      <div className="relative h-full w-full overflow-hidden">
        <PandemicMap
          state={state}
          hoveredCityId={hoveredCityId}
          selectedCityId={null}
          legalDestinations={legalDestinations}
          onCityClick={handleCityClick}
          onCityHover={setHoveredCityId}
        />

        {/* Floating HUD overlays. `pointer-events-none` on the wrappers so
            the SVG below stays interactive everywhere not covered by a
            specific widget; widgets re-enable pointer events themselves. */}
        <div className="pointer-events-none absolute inset-x-2 top-2 z-10">
          <InfoBar state={state} />
        </div>
        <div className="pointer-events-none absolute left-2 top-16 z-10">
          <PlayerStrip players={state.players} currentPlayerIndex={state.currentPlayerIndex} />
        </div>
        <div className="pointer-events-none absolute right-2 top-16 z-10">
          <ActionButtons
            buttons={buttons}
            actionsRemaining={state.actionsRemaining}
            activeAction={activeAction}
            onAction={handleAction}
          />
        </div>
        <div className="pointer-events-none absolute bottom-32 left-2 z-10">
          <TrackPanel state={state} />
        </div>
        {hoveredCityId && (
          <div className="pointer-events-none absolute bottom-32 right-2 z-10">
            <CityTooltip state={state} cityId={hoveredCityId} />
          </div>
        )}

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
            onCancel={() => setCureOptions(null)}
          />
        )}
      </div>
    </GameScreen>
  );
}
