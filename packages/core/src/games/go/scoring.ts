/**
 * Area (Chinese) scoring: each side's stones on the board plus the empty
 * regions only it borders, once the agreed dead stones are lifted. An empty
 * region touching both colours is dame and counts for nobody — which is how a
 * seki scores itself. White adds komi and one point per handicap stone (the
 * `chinese` handicap compensation KataGo also uses).
 */

import { groupAt, neighbors } from "./board";
import { BLACK, type Cell, type Color, EMPTY, WHITE } from "./types";

export interface SideScore {
  readonly stones: number;
  readonly territory: number;
  /** Komi plus handicap compensation — White only. */
  readonly bonus: number;
  readonly total: number;
}

export interface ScoreBreakdown {
  readonly black: SideScore;
  readonly white: SideScore;
  readonly dame: number;
  /** Black's total minus White's. */
  readonly margin: number;
  readonly winner: Color | null;
  /** "B+3.5", "W+12", "0" (jigo). */
  readonly result: string;
  /** Owner of every point after removal: 0 black, 1 white, -1 neutral. */
  readonly ownership: readonly (-1 | 0 | 1)[];
}

export function handicapBonus(handicap: number): number {
  return handicap >= 2 ? handicap : 0;
}

export function areaScore(
  board: readonly Cell[],
  size: number,
  dead: Iterable<number>,
  komi: number,
  handicap: number,
): ScoreBreakdown {
  const b = board.slice() as Cell[];
  for (const p of dead) b[p] = EMPTY;
  const adj = neighbors(size);
  const ownership = new Array<-1 | 0 | 1>(b.length).fill(-1);
  let blackStones = 0;
  let whiteStones = 0;
  for (let p = 0; p < b.length; p++) {
    if (b[p] === 1) {
      blackStones++;
      ownership[p] = BLACK;
    } else if (b[p] === 2) {
      whiteStones++;
      ownership[p] = WHITE;
    }
  }
  let blackTerritory = 0;
  let whiteTerritory = 0;
  let dame = 0;
  const visited = new Uint8Array(b.length);
  for (let p = 0; p < b.length; p++) {
    if (b[p] !== EMPTY || visited[p]) continue;
    const region: number[] = [];
    let touchesBlack = false;
    let touchesWhite = false;
    const stack = [p];
    visited[p] = 1;
    while (stack.length > 0) {
      const q = stack.pop() as number;
      region.push(q);
      for (const r of adj[q] ?? []) {
        const c = b[r];
        if (c === 1) touchesBlack = true;
        else if (c === 2) touchesWhite = true;
        else if (!visited[r]) {
          visited[r] = 1;
          stack.push(r);
        }
      }
    }
    if (touchesBlack && !touchesWhite) {
      blackTerritory += region.length;
      for (const q of region) ownership[q] = BLACK;
    } else if (touchesWhite && !touchesBlack) {
      whiteTerritory += region.length;
      for (const q of region) ownership[q] = WHITE;
    } else {
      dame += region.length;
    }
  }
  const bonus = komi + handicapBonus(handicap);
  const blackTotal = blackStones + blackTerritory;
  const whiteTotal = whiteStones + whiteTerritory + bonus;
  const margin = blackTotal - whiteTotal;
  return {
    black: { stones: blackStones, territory: blackTerritory, bonus: 0, total: blackTotal },
    white: { stones: whiteStones, territory: whiteTerritory, bonus, total: whiteTotal },
    dame,
    margin,
    winner: margin > 0 ? BLACK : margin < 0 ? WHITE : null,
    result: formatMargin(margin),
    ownership,
  };
}

export function formatMargin(margin: number): string {
  if (margin === 0) return "0";
  return `${margin > 0 ? "B" : "W"}+${Math.abs(margin)}`;
}

/** Every stone of the chain through `point` — the unit dead-stone marking toggles. */
export function chainStones(board: readonly Cell[], size: number, point: number): number[] {
  return groupAt(board, size, point)?.stones ?? [];
}
