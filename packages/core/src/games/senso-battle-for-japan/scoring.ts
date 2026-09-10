import { countClan, cubesOnMap, cubeVp, isEmpty } from "./board";
import { EMPEROR_ZERO_REGIONS } from "./map";
import { RULINGS } from "./rulings";
import { resolveStandings, type StandingEntry } from "./standings";
import type { Board, Clan, GameState, SeatBreakdown, SensoResult } from "./types";
import { CLANS } from "./types";

/** A clan "controls" a region with 2 or more of its cubes there. */
export function controls(squares: readonly (Clan | null)[], clan: Clan): boolean {
  return countClan(squares, clan) >= 2;
}

export function regionsControlled(board: Board, clan: Clan): number {
  return board.filter((squares) => controls(squares, clan)).length;
}

export function scoreClan(board: Board, clan: Clan): { cubeVp: number; controlVp: number } {
  return { cubeVp: cubeVp(board, clan), controlVp: regionsControlled(board, clan) };
}

/**
 * The Emperor scores per region that is empty or that no clan controls;
 * regions 04 and 08 score nothing for the Emperor when any cube stands there.
 */
export function emperorScoresRegion(board: Board, region: number): boolean {
  const squares = board[region];
  if (EMPEROR_ZERO_REGIONS.has(region)) return isEmpty(squares);
  if (isEmpty(squares)) return true;
  return !CLANS.some((clan) => controls(squares, clan));
}

export function scoreEmperor(board: Board): number {
  let regions = 0;
  for (let r = 0; r < board.length; r++) if (emperorScoresRegion(board, r)) regions++;
  return regions * RULINGS.emperorVpPerRegion;
}

export function computeScores(state: GameState): number[] {
  return state.players.map((p) => {
    if (p.clan === null) return scoreEmperor(state.board);
    const { cubeVp: cubes, controlVp } = scoreClan(state.board, p.clan);
    return cubes + controlVp;
  });
}

export function cubesPerSeat(state: GameState): number[] {
  return state.players.map((p) => (p.clan === null ? 0 : cubesOnMap(state.board, p.clan)));
}

/** One ladder entry per seat — the shape `standings.ts` ranks. */
function standingEntries(state: GameState, scores: number[]): StandingEntry[] {
  const cubes = cubesPerSeat(state);
  return state.players.map((_, seat) => ({
    score: scores[seat] ?? 0,
    cubes: cubes[seat] ?? 0,
    emperor: seat === state.emperorSeat,
  }));
}

export function resolveWinners(
  state: GameState,
  scores: number[],
): { winners: number[]; tiebreak: SensoResult["tiebreak"] } {
  const { winners, tiebreak } = resolveStandings(standingEntries(state, scores));
  return { winners, tiebreak };
}

/** 1-based standard-competition ranks — winners first, then (score, cubes, Emperor). */
export function placementsFrom(state: GameState, scores: number[]): number[] {
  return resolveStandings(standingEntries(state, scores)).placements;
}

export function buildResult(state: GameState): SensoResult {
  const scores = computeScores(state);
  const cubes = cubesPerSeat(state);
  const { winners, tiebreak } = resolveWinners(state, scores);
  const breakdown: SeatBreakdown[] = state.players.map((p) => {
    if (p.clan === null) {
      return {
        seat: p.index,
        clan: null,
        cubeVp: 0,
        controlVp: 0,
        emperorVp: scoreEmperor(state.board),
        regionsControlled: 0,
        cubes: 0,
      };
    }
    const { cubeVp: cv, controlVp } = scoreClan(state.board, p.clan);
    return {
      seat: p.index,
      clan: p.clan,
      cubeVp: cv,
      controlVp,
      emperorVp: 0,
      regionsControlled: controlVp,
      cubes: cubes[p.index],
    };
  });
  return {
    scores,
    winner: winners.length === 1 ? winners[0] : null,
    winners,
    placements: placementsFrom(state, scores),
    breakdown,
    tiebreak,
    finalBoard: state.board.map((squares) => [...squares]),
  };
}
