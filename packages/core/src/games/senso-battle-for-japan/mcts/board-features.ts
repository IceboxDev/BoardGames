// Seat-relative board features for the learned static evaluator. Every
// feature is public information; the Emperor seat has no cubes (its own-cube
// terms are 0, `emperorRegions` carries its scoring).

import { isFull } from "../board";
import { EDGES, REGION_COUNT } from "../map";
import { computeScores, cubesPerSeat, emperorScoresRegion, regionsControlled } from "../scoring";
import { type Clan, type GameState, ROUNDS } from "../types";

const BASE = 16;
/** BASE features, the same BASE scaled by roundsLeft, then gap / emperor / players / bias. */
export const BOARD_FEATURES = BASE * 2 + 4;

const NEIGHBOURS: number[][] = Array.from({ length: REGION_COUNT }, () => []);
for (const [a, b] of EDGES) {
  NEIGHBOURS[a].push(b);
  NEIGHBOURS[b].push(a);
}

function clanTerms(state: GameState, clan: Clan | null, out: number[]): void {
  const board = state.board;
  let cubes = 0;
  let controlled = 0;
  let onePlusEmpty = 0;
  let exposed = 0;
  let top = 0;
  let reach = 0;
  let onlyMine = 0;
  let contested = 0;
  if (clan !== null) {
    controlled = regionsControlled(board, clan);
    for (let r = 0; r < REGION_COUNT; r++) {
      const squares = board[r];
      let mine = 0;
      let others = 0;
      let empty = false;
      for (let i = 0; i < squares.length; i++) {
        const cube = squares[i];
        if (cube === null) empty = true;
        else if (cube === clan) {
          mine++;
          if (i === 0) top++;
          const below = squares[i + 1];
          if (below !== undefined && below !== null && below !== clan) exposed++;
        } else others++;
      }
      cubes += mine;
      if (mine === 1 && empty) onePlusEmpty++;
      if (mine > 0 && others === 0) onlyMine++;
      if (mine > 0 && others > 0) contested++;
      if (mine > 0) for (const nb of NEIGHBOURS[r]) if (!isFull(board[nb])) reach++;
    }
  }
  out.push(
    cubes / 8,
    clan === null ? 0 : (state.supply[clan] ?? 0) / 8,
    controlled / REGION_COUNT,
    onePlusEmpty / REGION_COUNT,
    exposed / 8,
    top / REGION_COUNT,
    reach / 20,
    onlyMine / REGION_COUNT,
  );
  // contested is folded into onlyMine/controlled; keep the vector at 8 per side.
  void contested;
}

export function boardFeatures(state: GameState, seat: number, out: Float64Array): void {
  const scores = computeScores(state);
  let rival = -1;
  for (let i = 0; i < scores.length; i++) {
    if (i === seat) continue;
    if (rival === -1 || scores[i] > scores[rival]) rival = i;
  }
  const me = state.players[seat];
  const rivalClan = rival === -1 ? null : state.players[rival].clan;
  const base: number[] = [];
  clanTerms(state, me.clan, base);
  clanTerms(state, rivalClan, base);
  if (base.length !== BASE) throw new Error(`BASE mismatch ${base.length}`);
  const roundsLeft = (ROUNDS - state.round) / (ROUNDS - 1);
  let k = 0;
  for (let i = 0; i < BASE; i++) out[k++] = base[i];
  for (let i = 0; i < BASE; i++) out[k++] = base[i] * roundsLeft;
  const cubes = cubesPerSeat(state);
  const gap = rival === -1 ? scores[seat] : scores[seat] - scores[rival];
  const cubeGap = rival === -1 ? 0 : cubes[seat] - cubes[rival];
  out[k++] = gap / 10;
  out[k++] = me.clan === null ? emperorRegionCount(state) / REGION_COUNT : cubeGap / 8;
  out[k++] = state.players.length / 5;
  out[k++] = 1;
  if (k !== BOARD_FEATURES) throw new Error(`BOARD_FEATURES mismatch ${k}`);
}

function emperorRegionCount(state: GameState): number {
  let n = 0;
  for (let r = 0; r < REGION_COUNT; r++) if (emperorScoresRegion(state.board, r)) n++;
  return n;
}
