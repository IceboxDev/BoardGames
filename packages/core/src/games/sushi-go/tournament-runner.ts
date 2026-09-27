import { strategyGuard } from "../../machines/seats";
import type { TournamentSimulator } from "../../tournament/simulator";
import { ALL_STRATEGIES, createStrategy } from "./ai/strategy";
import { applyRevealAndRotate, applySelection, createInitialState } from "./game-engine";
import { sushiGoOutcome } from "./outcome";

const toStrategy = strategyGuard("Sushi Go", ALL_STRATEGIES);

export const sushiGoSimulator: TournamentSimulator = {
  // Nash and Minimax only solve the two-player game (see the manifest).
  playerCounts: [2],
  // The Nash solver peaks near 3 GB per process.
  maxWorkers: 3,

  simulate({ strategies, seed }) {
    const seats = strategies.map((id) => createStrategy(toStrategy(id)));
    let state = createInitialState(seats.length, seed);
    while (state.phase !== "game-over") {
      // Simultaneous picks: every seat chooses from the same pre-reveal state.
      const picks = seats.map((pick, seat) => pick(state, seat));
      for (const [seat, selection] of picks.entries())
        state = applySelection(state, seat, selection);
      state = applyRevealAndRotate(state);
    }
    return sushiGoOutcome(state);
  },
};
