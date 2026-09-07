// ---------------------------------------------------------------------------
// Board mutators. Every function preserves the contiguity invariant: within a
// region, cubes occupy squares 0..k-1 (the top squares) and the rest are null.
// ---------------------------------------------------------------------------

import { CUBES_PER_CLAN, REGIONS, SETUP_CUBES } from "./map";
import { RULINGS } from "./rulings";
import type { Board, Clan, GameState } from "./types";
import { CLANS } from "./types";

export function emptyBoard(): Board {
  return REGIONS.map((r) => r.squares.map(() => null));
}

export function setupBoard(): Board {
  const board = emptyBoard();
  for (const { region, square, clan } of SETUP_CUBES) board[region][square] = clan;
  for (const squares of board) normalizeRegion(squares);
  return board;
}

/** Gravity: slide every cube up so the occupied squares are contiguous from the top. */
export function normalizeRegion(squares: (Clan | null)[]): void {
  const cubes = squares.filter((c): c is Clan => c !== null);
  for (let i = 0; i < squares.length; i++) squares[i] = cubes[i] ?? null;
}

/** Index of the highest (topmost) empty square, or -1 when the region is full. */
export function highestEmpty(squares: readonly (Clan | null)[]): number {
  return squares.indexOf(null);
}

export function isFull(squares: readonly (Clan | null)[]): boolean {
  return highestEmpty(squares) === -1;
}

export function isEmpty(squares: readonly (Clan | null)[]): boolean {
  return squares.every((c) => c === null);
}

/** Index of the lowest occupied square, or -1 when the region is empty. */
export function lowestOccupied(squares: readonly (Clan | null)[]): number {
  for (let i = squares.length - 1; i >= 0; i--) if (squares[i] !== null) return i;
  return -1;
}

export function countClan(squares: readonly (Clan | null)[], clan: Clan): number {
  return squares.filter((c) => c === clan).length;
}

export function cubesOnMap(board: Board, clan: Clan): number {
  return board.reduce((sum, squares) => sum + countClan(squares, clan), 0);
}

/** VP of every square holding `clan`, summed over the board. */
export function cubeVp(board: Board, clan: Clan): number {
  let vp = 0;
  board.forEach((squares, r) => {
    squares.forEach((cube, s) => {
      if (cube === clan) vp += REGIONS[r].squares[s];
    });
  });
  return vp;
}

export function initialSupply(seatedClans: readonly Clan[], board: Board): Record<Clan, number> {
  const supply = { takeda: 0, uesugi: 0, oda: 0, mori: 0 };
  for (const clan of CLANS) {
    supply[clan] = seatedClans.includes(clan) ? CUBES_PER_CLAN - cubesOnMap(board, clan) : 0;
  }
  return supply;
}

/**
 * A removed cube goes back to its owner's supply. Clans without a seat had
 * their spare cubes "removed from the game" at setup, so theirs vanish.
 */
export function returnCubeToSupply(state: GameState, clan: Clan): void {
  if (!RULINGS.removedCubesReturnToSupply) return;
  if (state.seatedClans.includes(clan)) state.supply[clan] += 1;
}

/**
 * Place a cube on the highest empty square (or an explicit `square`, which must
 * be that same square — placement never creates a hole). `fromSupply: false`
 * for a cube that is being moved rather than brought in from the supply.
 */
export function placeCube(
  state: GameState,
  region: number,
  clan: Clan,
  opts: { fromSupply?: boolean; square?: number } = {},
): number {
  const squares = state.board[region];
  const target = highestEmpty(squares);
  if (target === -1) throw new Error(`Region ${region + 1} is full`);
  if (opts.square !== undefined && opts.square !== target) {
    throw new Error(`Square ${opts.square} of region ${region + 1} is not the highest empty`);
  }
  const fromSupply = opts.fromSupply ?? true;
  if (fromSupply) {
    if (state.supply[clan] <= 0) throw new Error(`${clan} has no cubes left to place`);
    state.supply[clan] -= 1;
  }
  squares[target] = clan;
  return target;
}

/**
 * Remove the cube at `square`, returning it to its supply (unless `toSupply`
 * is false, e.g. the cube is moving) and closing the gap with gravity.
 */
export function removeCube(
  state: GameState,
  region: number,
  square: number,
  opts: { toSupply?: boolean } = {},
): Clan {
  const squares = state.board[region];
  const cube = squares[square];
  if (cube === null || cube === undefined) {
    throw new Error(`No cube on square ${square} of region ${region + 1}`);
  }
  squares[square] = null;
  normalizeRegion(squares);
  if (opts.toSupply ?? true) returnCubeToSupply(state, cube);
  return cube;
}

/** Overwrite the cube at `square` in place (Aggression / Balance-replace): no hole, no gravity. */
export function replaceCube(
  state: GameState,
  region: number,
  square: number,
  clan: Clan,
  opts: { fromSupply?: boolean } = {},
): Clan {
  const squares = state.board[region];
  const victim = squares[square];
  if (victim === null || victim === undefined) {
    throw new Error(`No cube on square ${square} of region ${region + 1}`);
  }
  if (opts.fromSupply ?? true) {
    if (state.supply[clan] <= 0) throw new Error(`${clan} has no cubes left to place`);
    state.supply[clan] -= 1;
  }
  squares[square] = clan;
  returnCubeToSupply(state, victim);
  return victim;
}

/** Contiguity check used by tests and the engine's debug assertions. */
export function isContiguous(squares: readonly (Clan | null)[]): boolean {
  const firstEmpty = highestEmpty(squares);
  if (firstEmpty === -1) return true;
  return squares.slice(firstEmpty).every((c) => c === null);
}
