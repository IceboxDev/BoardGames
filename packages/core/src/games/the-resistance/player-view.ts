/**
 * What one seat may see. TOTAL: any seat (a spectator is -1), any phase,
 * never throws. Roles appear only when the game is over; individual mission
 * cards never appear at all — the table only ever learns the Fail count.
 * The bots read the game through this projection too, so they can't cheat.
 */

import type { Role } from "./record";
import { tablePosition } from "./rules";
import type { GameState, ResistancePlayerView } from "./types";

/** Spies a seat knows: all of them (itself included) unless Blind Spies; none for the Resistance. */
export function knownSpiesOf(roles: readonly Role[], seat: number, blindSpies: boolean): number[] {
  if (roles[seat] !== "spy") return [];
  if (blindSpies) return [seat];
  return roles.flatMap((r, i) => (r === "spy" ? [i] : []));
}

export function buildPlayerView(
  state: GameState,
  seat: number,
  liveSolver = true,
): ResistancePlayerView {
  const { record } = state;
  const over = state.phase === "game-over";
  const pos = tablePosition(record);
  const inRange = seat >= 0 && seat < record.playerCount;
  const role = inRange ? record.roles[seat] : null;
  const pending = state.phase === "voting" ? state.pendingVotes : state.pendingCards;

  return {
    phase: state.phase,
    playerCount: record.playerCount,
    variants: record.variants,
    record: {
      playerCount: record.playerCount,
      variants: record.variants,
      firstLeader: record.firstLeader,
      rounds: record.rounds.map((round) => ({
        proposals: round.proposals.map((p) => ({ ...p, team: [...p.team] })),
        result: round.result
          ? {
              mission: round.result.mission,
              team: [...round.result.team],
              fails: round.result.fails,
              success: round.result.success,
              ...(over && round.result.cards ? { cards: [...round.result.cards] } : {}),
            }
          : null,
      })),
      roles: over ? [...record.roles] : null,
      winner: record.winner ?? null,
      winReason: record.winReason ?? null,
    },
    seat: inRange ? seat : -1,
    role,
    knownSpies: inRange ? knownSpiesOf(record.roles, seat, record.variants.blindSpies) : [],
    leader: pos.leader,
    rejections: pos.rejections,
    missionResults: pos.missionResults,
    seats: record.roles.map((_, i) => ({
      seat: i,
      isAi: state.strategies[i] !== null,
      submitted:
        (state.phase === "voting" || state.phase === "mission") && (pending[i] ?? null) !== null,
    })),
    myVote: inRange && state.phase === "voting" ? state.pendingVotes[seat] : null,
    myCard: inRange && state.phase === "mission" ? state.pendingCards[seat] : null,
    liveSolver,
  };
}
