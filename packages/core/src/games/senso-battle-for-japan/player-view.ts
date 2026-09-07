import { computeScores } from "./scoring";
import type { GameState, SensoPlayerView } from "./types";

/**
 * Project the state for one seat. Hidden: every other hand (counts only) and
 * the `seed` — the only thing that would reveal future deals or the rounds
 * 5–8 advantage row. Seat -1 is a spectator.
 */
export function buildPlayerView(state: GameState, seat: number): SensoPlayerView {
  const me = state.players[seat];
  return {
    phase: state.phase,
    round: state.round,
    trumpSuit: state.trumpSuit,
    advantageRow: [...state.advantageRow],
    firstPlayer: state.firstPlayer,
    leader: state.leader,
    turn: state.turn,
    trickNumber: state.trickNumber,
    me: me ? seat : -1,
    myClan: me?.clan ?? null,
    hand: me ? [...me.hand] : [],
    players: state.players.map((p) => ({
      index: p.index,
      type: p.type,
      aiStrategy: p.aiStrategy,
      clan: p.clan,
      handCount: p.hand.length,
      tricksWon: p.tricksWon,
    })),
    emperorSeat: state.emperorSeat,
    seatedClans: [...state.seatedClans],
    table: state.table.map((p) => ({ ...p })),
    leadSuit: state.leadSuit,
    played: [...state.played],
    tricks: state.tricks,
    completedTrick: state.completedTrick,
    lastTrick: state.lastTrick,
    board: state.board.map((squares) => [...squares]),
    supply: { ...state.supply },
    rewardQueue: state.rewardQueue.map((slot) => ({ ...slot, used: [...slot.used] })),
    affected: state.affected.map((a) => ({ ...a })),
    bonusQueue: [...state.bonusQueue],
    scores: computeScores(state),
    log: state.log,
    result: state.result,
  };
}
