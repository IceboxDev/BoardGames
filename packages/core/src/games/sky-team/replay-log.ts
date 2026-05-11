import type { PlayerIndex, SkyTeamAction, SkyTeamGameState } from "./types";

/**
 * Each step records: the action that produced it (or null for setup/auto), the
 * player who emitted it (-1 for automated), and a snapshot of the resulting
 * state. Snapshots are full deep copies — bigger payload than diff-based, but
 * trivially serializable and trivially playable back without re-running the
 * engine.
 */
export interface SkyTeamReplayStep {
  index: number;
  player: PlayerIndex | -1;
  action: SkyTeamAction | null;
  state: SkyTeamGameState;
}

export function makeInitialStep(state: SkyTeamGameState): SkyTeamReplayStep {
  return {
    index: 0,
    player: -1,
    action: null,
    state: structuredClone(state),
  };
}

export function makePlayerActionStep(
  prev: SkyTeamReplayStep[],
  player: PlayerIndex,
  action: SkyTeamAction,
  state: SkyTeamGameState,
): SkyTeamReplayStep {
  return {
    index: prev.length,
    player,
    action,
    state: structuredClone(state),
  };
}

export function makeAutomatedStep(
  prev: SkyTeamReplayStep[],
  state: SkyTeamGameState,
): SkyTeamReplayStep {
  return {
    index: prev.length,
    player: -1,
    action: null,
    state: structuredClone(state),
  };
}

export interface SkyTeamReplayLog {
  scenarioId: string;
  seed: number;
  outcome: SkyTeamGameState["outcome"];
  rounds: number;
  steps: SkyTeamReplayStep[];
}

export function buildGameLog(args: {
  finalState: SkyTeamGameState;
  steps: SkyTeamReplayStep[];
}): SkyTeamReplayLog {
  return {
    scenarioId: args.finalState.scenario.id,
    seed: args.finalState.seed,
    outcome: args.finalState.outcome,
    rounds: args.finalState.round,
    steps: args.steps,
  };
}
