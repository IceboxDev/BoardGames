import { CITY_DATA } from "./city-graph";
import { cloneGameState } from "./state-utils";
import type { GameAction, GameResult, GameState, SetupConfig } from "./types";

// ---------------------------------------------------------------------------
// Replay format
// ---------------------------------------------------------------------------
//
// Pandemic replays are designed to be fully reproducible from the (seed,
// config, actions) triple — the engine is deterministic given a seeded Rng.
// We additionally snapshot the full GameState after every transition so the
// replay viewer can scrub to any point without replaying from scratch. The
// full-state snapshot is larger than a compact card-ID format (see EK's
// replay-log), but Pandemic's state is already JSON-serializable POJOs and
// games are short enough (~50–150 transitions) that the tradeoff is fine.
// ---------------------------------------------------------------------------

export const REPLAY_FORMAT_VERSION = 1;

/**
 * One step in the replay. Step 0 holds the initial state (no action).
 * Subsequent steps hold the state AFTER the associated action/transition.
 * Player-driven actions carry a `GameAction`; the engine's automated
 * phase transitions (draw/epidemic/infect/advance_turn) are tagged via
 * `automated` instead.
 */
export interface PandemicReplayStep {
  stepIndex: number;
  /** Current player at the time this step was taken (pre-action). */
  player: number;
  /** Full game state after this step. */
  state: GameState;
  /** Present only when this step was caused by a player action. */
  action?: GameAction;
  /** Present only when this step was an engine-driven phase transition. */
  automated?: "draw" | "epidemic" | "infect" | "advance_turn";
  /** Human-readable description of the step for the replay viewer. */
  description: string;
}

/** Full replay log for one game. */
export interface PandemicGameReplayLog {
  formatVersion: 1;
  seed: number;
  config: SetupConfig;
  steps: PandemicReplayStep[];
  result: GameResult | null;
  turnCount: number;
  playerCount: number;
  /** Uniform score for the server's session_replays table — Pandemic is co-op. */
  scoreA: number;
  scoreB: number;
  scores: number[];
}

// ---------------------------------------------------------------------------
// Descriptions
// ---------------------------------------------------------------------------

function cityName(cityId: string): string {
  return CITY_DATA.get(cityId)?.name ?? cityId;
}

/** Generate a human-readable description of a player action. */
export function describeAction(action: GameAction, state: GameState): string {
  const p = state.players[state.currentPlayerIndex];
  const who = `P${p.id} (${p.role})`;
  switch (action.kind) {
    case "drive_ferry":
      return `${who} drove to ${cityName(action.to)}`;
    case "direct_flight":
      return `${who} flew direct to card #${action.cardIdx}`;
    case "charter_flight":
      return `${who} chartered to ${cityName(action.to)}`;
    case "shuttle_flight":
      return `${who} shuttle-flew to ${cityName(action.to)}`;
    case "build_station":
      return `${who} built research station${action.relocateFrom ? ` (relocating from ${cityName(action.relocateFrom)})` : ""}`;
    case "treat_disease":
      return `${who} treated ${action.color} at ${cityName(p.location)}`;
    case "share_give":
      return `${who} gave card to P${action.targetId}`;
    case "share_take":
      return `${who} took card from P${action.fromId}`;
    case "discover_cure":
      return `${who} discovered a cure for ${action.color}`;
    case "ops_move":
      return `${who} (Ops Expert) moved to ${cityName(action.to)}`;
    case "dispatcher_move_to_pawn":
      return `${who} (Dispatcher) moved P${action.targetId} to P${action.toPlayerId}'s city`;
    case "dispatcher_move_as":
      return `${who} (Dispatcher) moved P${action.targetId}`;
    case "contingency_take":
      return `${who} (Contingency Planner) stored an event card`;
    case "play_event":
      return `${who} played event ${action.event}`;
    case "pass":
      return `${who} passed remaining actions`;
    case "discard_card":
      return `${who} discarded card #${action.cardIdx}`;
    case "forecast_reorder":
      return `${who} reordered forecast`;
  }
}

/** Generate a description for an automated phase transition. */
export function describeAutomated(kind: PandemicReplayStep["automated"]): string {
  switch (kind) {
    case "draw":
      return "Draw phase — drew 2 player cards";
    case "epidemic":
      return "Epidemic resolved";
    case "infect":
      return "Infect phase — drew infection cards";
    case "advance_turn":
      return "Turn advanced";
    default:
      return "";
  }
}

// ---------------------------------------------------------------------------
// Snapshotting
// ---------------------------------------------------------------------------

/**
 * Snapshot the full game state. We deep-clone so subsequent engine mutations
 * can't corrupt the replay steps — `cloneGameState` already handles every
 * nested mutable field in the state.
 */
export function snapshotGameState(state: GameState): GameState {
  return cloneGameState(state);
}

// ---------------------------------------------------------------------------
// Step constructors
// ---------------------------------------------------------------------------

export function makeInitialStep(state: GameState): PandemicReplayStep {
  return {
    stepIndex: 0,
    player: state.currentPlayerIndex,
    state: snapshotGameState(state),
    description: "Game started",
  };
}

export function makePlayerActionStep(
  prevSteps: readonly PandemicReplayStep[],
  action: GameAction,
  preState: GameState,
  postState: GameState,
): PandemicReplayStep {
  return {
    stepIndex: prevSteps.length,
    player: preState.currentPlayerIndex,
    state: snapshotGameState(postState),
    action,
    description: describeAction(action, preState),
  };
}

export function makeAutomatedStep(
  prevSteps: readonly PandemicReplayStep[],
  kind: NonNullable<PandemicReplayStep["automated"]>,
  preState: GameState,
  postState: GameState,
): PandemicReplayStep {
  return {
    stepIndex: prevSteps.length,
    player: preState.currentPlayerIndex,
    state: snapshotGameState(postState),
    automated: kind,
    description: describeAutomated(kind),
  };
}

// ---------------------------------------------------------------------------
// Final log builder
// ---------------------------------------------------------------------------

export function buildGameLog(opts: {
  seed: number;
  config: SetupConfig;
  steps: PandemicReplayStep[];
  finalState: GameState;
}): PandemicGameReplayLog {
  const { seed, config, steps, finalState } = opts;
  const playerCount = finalState.players.length;
  const won = finalState.result === "win";
  const scoreSlot = won ? 1 : 0;
  return {
    formatVersion: REPLAY_FORMAT_VERSION,
    seed,
    config,
    steps,
    result: finalState.result,
    turnCount: finalState.turnNumber,
    playerCount,
    scoreA: scoreSlot,
    scoreB: 0,
    scores: Array.from({ length: playerCount }, () => scoreSlot),
  };
}
