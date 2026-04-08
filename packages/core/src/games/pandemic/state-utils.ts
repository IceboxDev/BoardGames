import type { GameState } from "./types";

export function cloneGameState(state: GameState): GameState {
  return {
    ...state,
    cityCubes: Object.fromEntries(Object.entries(state.cityCubes).map(([k, v]) => [k, { ...v }])),
    diseaseCubeSupply: { ...state.diseaseCubeSupply },
    diseaseStatus: { ...state.diseaseStatus },
    researchStations: [...state.researchStations],
    players: state.players.map((p) => ({ ...p, hand: [...p.hand] })),
    playerDeck: [...state.playerDeck],
    playerDiscard: [...state.playerDiscard],
    infectionDeck: [...state.infectionDeck],
    infectionDiscard: [...state.infectionDiscard],
    log: [...state.log],
    actionLog: [...state.actionLog],
  };
}
