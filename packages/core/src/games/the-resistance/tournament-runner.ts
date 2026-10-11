import type { GameOutcome } from "../../machines/outcome";
import { playMachineToEnd } from "../../tournament/drive-machine";
import type { TournamentSimulator } from "../../tournament/simulator";
import { createInitialState } from "./game-engine";
import { resistanceMachine, resistanceSpec } from "./machine";
import { resistanceManifest } from "./manifest";
import { TEAM_OF_ROLE } from "./outcome";

/** The machine without its pacing pauses: bots propose, vote and play back to back. */
const instant = resistanceMachine.provide({ delays: { aiDelay: 0, phaseDelay: 0 } });

/** Base game: no Targeting, no Blind Spies; the Solver panel is view-only, so it's off. */
const CONFIG = resistanceManifest.config.parse({ liveSolver: false });

/**
 * Hidden roles: a seat's team is dealt from the seed, so a mirrored pair seats
 * strategy A as the whole Resistance and B as the Spies on one deal, then the
 * other way round on the same deal. The roles come from the engine's own
 * setup — the runner is offline, so knowing them here leaks nothing to a bot.
 */
export function resistanceSides(playerCount: number, seed: number): number[] {
  const { record } = createInitialState({
    playerCount,
    strategies: Array(playerCount).fill(null),
    variants: { targeting: CONFIG.targeting, blindSpies: CONFIG.blindSpies },
    seed,
  });
  return record.roles.map((role) => TEAM_OF_ROLE[role]);
}

export const resistanceSimulator: TournamentSimulator<Promise<GameOutcome>> = {
  playerCounts: [5, 6, 7, 8, 9, 10],
  sides: resistanceSides,

  simulate({ strategies, seed }) {
    return playMachineToEnd(resistanceSpec, instant, {
      strategies,
      seed,
      config: CONFIG,
      timeoutMs: 60_000,
    });
  },
};
