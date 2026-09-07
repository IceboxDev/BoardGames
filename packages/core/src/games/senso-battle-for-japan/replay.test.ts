import { describe, expect, it } from "vitest";
import { configureSearch } from "./ai-search";
import { pickAiAction } from "./ai-strategies";
import { applyAction, createInitialState, settleTrick } from "./game-engine";
import { isSensoReplay, replaySteps, type SensoReplay } from "./replay";
import { getActivePlayer, getLegalActions } from "./rules";
import { computeScores } from "./scoring";
import type { GameState } from "./types";

function phaseOf(state: GameState): GameState["phase"] {
  return state.phase;
}

/** Play a full seeded game and package it the way the machine persists it. */
function recordGame(players: number, seed: number): SensoReplay {
  configureSearch({ determinizations: 1, rewardCandidates: 2, opponentSearch: 0 });
  const strategies = Array.from({ length: players }, (_, i) =>
    i === 0 ? null : ("heuristic-v1" as const),
  );
  const state = createInitialState(players, strategies, seed);
  while (phaseOf(state) !== "game-over") {
    if (phaseOf(state) === "trick-settle") {
      settleTrick(state);
      continue;
    }
    const seat = getActivePlayer(state);
    const legal = getLegalActions(state);
    applyAction(
      state,
      seat === 0 ? legal[legal.length - 1] : pickAiAction(state, seat, "heuristic-v1"),
    );
  }
  const result = state.result;
  if (!result) throw new Error("no result");
  return {
    scores: result.scores,
    winner: result.winner,
    winners: result.winners,
    placements: result.placements,
    playerCount: players,
    seed,
    strategies,
    clans: state.players.map((p) => p.clan),
    emperorSeat: state.emperorSeat,
    finalBoard: result.finalBoard,
    log: state.log,
  };
}

describe("replaySteps", () => {
  it.each([2, 3, 5])("rebuilds a %i-player game move by move from its log and seed", (players) => {
    const replay = recordGame(players, 40 + players);
    expect(isSensoReplay(replay)).toBe(true);
    const steps = replaySteps(replay);
    const plays = replay.log.reduce((n, e) => n + (e.kind === "trick-won" ? e.plays.length : 0), 0);
    const decisions = replay.log.filter((e) =>
      ["reward", "reward-pass", "bonus", "bonus-pass"].includes(e.kind),
    ).length;
    expect(steps.length).toBe(1 + plays + decisions);
    expect(steps[0].state.round).toBe(1);
    expect(steps[0].state.players.map((p) => p.clan)).toEqual(replay.clans);
    const last = steps[steps.length - 1].state;
    expect(last.phase).toBe("game-over");
    expect(computeScores(last)).toEqual(replay.scores);
    expect(last.board).toEqual(replay.finalBoard);
    // Steps are independent snapshots.
    expect(steps[1].state).not.toBe(steps[0].state);
  });

  it("rejects a log that no longer matches the engine", () => {
    const replay = recordGame(2, 7);
    expect(() => replaySteps({ ...replay, scores: replay.scores.map((s) => s + 1) })).toThrow(
      /diverged/,
    );
    expect(isSensoReplay({ scores: [1] })).toBe(false);
  });
});
