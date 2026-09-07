import { pickAiAction } from "@boardgames/core/games/senso-battle-for-japan/ai-strategies";
import {
  applyAction,
  createInitialState,
  settleTrick,
} from "@boardgames/core/games/senso-battle-for-japan/game-engine";
import type { SensoReplay } from "@boardgames/core/games/senso-battle-for-japan/replay";
import { getActivePlayer } from "@boardgames/core/games/senso-battle-for-japan/rules";
import type { GameState } from "@boardgames/core/games/senso-battle-for-japan/types";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import GameReplay from "./GameReplay";

function phaseOf(state: GameState): GameState["phase"] {
  return state.phase;
}

/** A finished 2-player game packaged the way `getReplayLog` persists it. */
function recordedGame(): SensoReplay {
  const strategies = [null, "heuristic-v1" as const];
  const state = createInitialState(2, strategies, 91);
  while (phaseOf(state) !== "game-over") {
    if (phaseOf(state) === "trick-settle") {
      settleTrick(state);
      continue;
    }
    applyAction(state, pickAiAction(state, getActivePlayer(state), "heuristic-v1"));
  }
  const result = state.result;
  if (!result) throw new Error("unfinished");
  return {
    scores: result.scores,
    winner: result.winner,
    winners: result.winners,
    placements: result.placements,
    playerCount: 2,
    seed: 91,
    strategies,
    clans: state.players.map((p) => p.clan),
    emperorSeat: state.emperorSeat,
    finalBoard: result.finalBoard,
    log: state.log,
  };
}

describe("Sensō GameReplay", () => {
  it("scrubs a persisted game from the deal to the final position", () => {
    const replay = recordedGame();
    render(<GameReplay game={replay} />);
    expect(screen.getByText("Round 1 · cards dealt")).toBeInTheDocument();

    fireEvent.click(screen.getByTitle("Last"));
    const last = screen.getByRole("slider", { name: "Replay position" });
    expect(Number((last as HTMLInputElement).value)).toBeGreaterThan(100);
    // The closing step is a rewards-phase decision or the final trick, never blank.
    const caption = screen.getByTitle(/Round 8/);
    expect(caption.textContent).toMatch(/Round 8/);

    fireEvent.click(screen.getByTitle("First"));
    expect(screen.getByText("Round 1 · cards dealt")).toBeInTheDocument();
  });

  it("refuses a payload that is not a Sensō replay", () => {
    render(<GameReplay game={{ nope: true }} />);
    expect(screen.getByText("This replay cannot be shown.")).toBeInTheDocument();
  });
});
