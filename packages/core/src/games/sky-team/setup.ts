import type { Rng } from "./rng";
import { BRAKES_ORDER, FLAPS_ORDER, LANDING_GEAR_SLOTS } from "./scenarios";
import type { ScenarioConfig, SkyTeamGameState, SlotId, SlotState } from "./types";
import { SLOT_IDS } from "./types";

const SWITCHED_SLOT_IDS: ReadonlySet<SlotId> = new Set<SlotId>([
  ...LANDING_GEAR_SLOTS,
  ...FLAPS_ORDER,
  ...BRAKES_ORDER,
]);

function freshSlots(): Record<SlotId, SlotState> {
  const out = {} as Record<SlotId, SlotState>;
  for (const id of SLOT_IDS) {
    const state: SlotState = { id, die: null };
    if (SWITCHED_SLOT_IDS.has(id)) state.switchOn = false;
    out[id] = state;
  }
  return out;
}

export interface CreateGameOptions {
  scenario: ScenarioConfig;
  seed: number;
}

export function createGame(opts: CreateGameOptions, _rng: Rng): SkyTeamGameState {
  const { scenario, seed } = opts;
  return {
    scenario,
    round: 1,
    phase: "briefing",
    toPlace: scenario.firstPlacer,
    firstThisRound: scenario.firstPlacer,
    readyForRoll: [false, false],
    unplacedDice: [[], []],
    slots: freshSlots(),
    speedGauge: { ...scenario.speedGaugeStart },
    brakeTrack: { pos: scenario.brakeTrackStart },
    axis: { position: 0, spinAt: scenario.axisSpinAt },
    approach: {
      current: 0,
      airportIndex: scenario.approach.airportIndex,
      airliners: [...scenario.approach.airliners],
    },
    altitude: {
      feet: scenario.altitudeStart,
      rerollAt: scenario.rerollAt,
    },
    coffeeTokens: 0,
    rerollTokens: scenario.rerollAt.includes(scenario.altitudeStart) ? 1 : 0,
    isFinalRound: false,
    finalRoundSpeed: null,
    log: [
      {
        t: "round-start",
        round: 1,
        first: scenario.firstPlacer,
        rerollTokens: scenario.rerollAt.includes(scenario.altitudeStart) ? 1 : 0,
      },
    ],
    outcome: null,
    seed,
    nextDieId: 0,
  };
}
