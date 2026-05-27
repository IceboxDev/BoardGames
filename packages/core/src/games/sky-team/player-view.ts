import { placementsExhausted } from "./game-engine";
import type { PlayerIndex, SkyTeamGameState, SkyTeamPlayerView } from "./types";

export function buildPlayerView(state: SkyTeamGameState, viewer: PlayerIndex): SkyTeamPlayerView {
  const opp = (1 - viewer) as PlayerIndex;
  const canEndRound = placementsExhausted(state) && state.outcome == null;
  return {
    scenario: state.scenario,
    round: state.round,
    phase: state.phase,
    toPlace: state.toPlace,
    firstThisRound: state.firstThisRound,
    readyForRoll: [...state.readyForRoll],
    myDice: state.unplacedDice[viewer].map((d) => ({ ...d })),
    opponentDiceCount: state.unplacedDice[opp].length,
    slots: structuredClone(state.slots),
    speedGauge: { ...state.speedGauge },
    brakeTrack: { ...state.brakeTrack },
    axis: { ...state.axis },
    approach: {
      current: state.approach.current,
      airportIndex: state.approach.airportIndex,
      airliners: [...state.approach.airliners],
    },
    altitude: { feet: state.altitude.feet, rerollAt: state.altitude.rerollAt },
    coffeeTokens: state.coffeeTokens,
    rerollTokens: state.rerollTokens,
    isFinalRound: state.isFinalRound,
    log: state.log,
    outcome: state.outcome,
    viewerIndex: viewer,
    isYourTurn:
      (state.phase === "placement" && state.toPlace === viewer && !canEndRound) ||
      (state.phase === "briefing" && !state.readyForRoll[viewer]),
    canEndRound,
  };
}
