// Rebuilds a finished game from its persisted replay: everything in Sensō is
// seeded (seat clans, the Emperor, every deal), so replaying the recorded
// cards and reward choices through the engine reproduces every position.

import { applyAction, createInitialState, settleTrick } from "./game-engine";
import { computeScores } from "./scoring";
import type { Action, AIStrategyId, Board, Clan, GameState, LogEntry } from "./types";

/** What `sensoSpec.getReplayLog` persists (see machine.ts). */
export interface SensoReplay {
  scores: number[];
  winner: number | null;
  winners: number[];
  placements: number[];
  playerCount: number;
  seed: number;
  strategies: (AIStrategyId | null)[];
  clans: (Clan | null)[];
  emperorSeat: number | null;
  finalBoard: Board;
  log: LogEntry[];
}

export interface ReplayStep {
  /** Position after `action` (the initial deal for the first step). */
  state: GameState;
  /** The log entry this step belongs to (a trick's entry for each of its plays). */
  entry: LogEntry | null;
  action: Action | null;
  /** 0-based index of the log entry, for grouping. */
  entryIndex: number;
}

export function isSensoReplay(value: unknown): value is SensoReplay {
  if (typeof value !== "object" || value === null) return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r.seed === "number" &&
    typeof r.playerCount === "number" &&
    Array.isArray(r.strategies) &&
    Array.isArray(r.log)
  );
}

function snapshot(state: GameState): GameState {
  return structuredClone(state);
}

/**
 * Every position of the game, one per card played or reward decided. Throws
 * if the recorded moves no longer replay through the current engine (a rules
 * change since the game was played).
 */
export function replaySteps(replay: SensoReplay): ReplayStep[] {
  const state = createInitialState(replay.playerCount, replay.strategies, replay.seed, {
    log: false,
  });
  const steps: ReplayStep[] = [
    { state: snapshot(state), entry: null, action: null, entryIndex: -1 },
  ];
  const push = (entry: LogEntry, action: Action, entryIndex: number) => {
    if (state.phase === "trick-settle") settleTrick(state);
    applyAction(state, action);
    steps.push({ state: snapshot(state), entry, action, entryIndex });
  };
  replay.log.forEach((entry, i) => {
    switch (entry.kind) {
      case "trick-won":
        for (const play of entry.plays) push(entry, { type: "play", card: play.card }, i);
        break;
      case "reward":
        push(entry, entry.action, i);
        break;
      case "reward-pass":
      case "bonus-pass":
        push(entry, { type: "pass" }, i);
        break;
      case "bonus":
        push(entry, { type: "bonus-place", region: entry.region }, i);
        break;
      default:
        break; // round-start, advantage-row, game-over: the engine emits these itself
    }
  });
  if (state.phase === "trick-settle") settleTrick(state);
  const last = steps[steps.length - 1];
  if (last.state.phase === "trick-settle") last.state = snapshot(state);
  const scores = computeScores(state);
  if (scores.some((s, seat) => s !== replay.scores[seat])) {
    throw new Error(
      `Replay diverged from the engine: scores ${scores.join("/")} vs recorded ${replay.scores.join("/")}`,
    );
  }
  return steps;
}
