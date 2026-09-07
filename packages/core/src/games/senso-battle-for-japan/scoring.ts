import { countClan, cubesOnMap, cubeVp, isEmpty } from "./board";
import { EMPEROR_ZERO_REGIONS } from "./map";
import { RULINGS } from "./rulings";
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

export function resolveWinners(
  state: GameState,
  scores: number[],
): { winners: number[]; tiebreak: SensoResult["tiebreak"] } {
  const max = Math.max(...scores);
  let tied = scores.map((s, seat) => (s === max ? seat : -1)).filter((seat) => seat >= 0);
  if (tied.length === 1) return { winners: tied, tiebreak: "score" };

  const cubes = cubesPerSeat(state);
  const maxCubes = Math.max(...tied.map((seat) => cubes[seat]));
  tied = tied.filter((seat) => cubes[seat] === maxCubes);
  if (tied.length === 1) return { winners: tied, tiebreak: "cubes" };

  const emperor = state.emperorSeat;
  if (emperor !== null && (tied.includes(emperor) || !RULINGS.emperorWinsTiesOnlyIfTied)) {
    return { winners: [emperor], tiebreak: "emperor" };
  }
  return { winners: tied, tiebreak: "draw" };
}

/** 1-based standard-competition ranks by (score, cubes, Emperor). */
export function placementsFrom(state: GameState, scores: number[]): number[] {
  const cubes = cubesPerSeat(state);
  const key = (seat: number) => [scores[seat], cubes[seat], seat === state.emperorSeat ? 1 : 0];
  const order = state.players
    .map((p) => p.index)
    .sort((a, b) => {
      const ka = key(a);
      const kb = key(b);
      for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return kb[i] - ka[i];
      return a - b;
    });
  const placements: number[] = new Array(scores.length).fill(0);
  let rank = 0;
  order.forEach((seat, i) => {
    const prev = order[i - 1];
    const sameAsPrev = prev !== undefined && key(prev).every((value, k) => value === key(seat)[k]);
    if (!sameAsPrev) rank = i + 1;
    placements[seat] = rank;
  });
  return placements;
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
