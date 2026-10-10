/**
 * Every number of the Connect 4 board, in viewBox units. One cell is `CELL`
 * square; the board face sits below a strip where the next disc hovers, and
 * (PopOut) above a strip of pop arrows.
 */

export const CELL = 100;
export const DISC_R = 40;
/** The face's margin around the grid of holes. */
export const FRAME = 18;
/** The strip above the board where the hovering disc waits. */
export const HOVER_STRIP = CELL;
/** The strip below the board holding the pop arrows (PopOut only). */
export const POP_STRIP = 64;

export interface BoardGeometry {
  cols: number;
  rows: number;
  width: number;
  height: number;
  /** Top of the board face. */
  faceTop: number;
  faceBottom: number;
}

export function boardGeometry(cols: number, rows: number, popOut: boolean): BoardGeometry {
  const faceTop = HOVER_STRIP;
  const faceBottom = faceTop + rows * CELL + FRAME * 2;
  return {
    cols,
    rows,
    width: cols * CELL + FRAME * 2,
    height: faceBottom + (popOut ? POP_STRIP : 12),
    faceTop,
    faceBottom,
  };
}

export function cellX(column: number): number {
  return FRAME + column * CELL + CELL / 2;
}

export function cellY(g: BoardGeometry, row: number): number {
  return g.faceTop + FRAME + (g.rows - 1 - row) * CELL + CELL / 2;
}

/** Where a disc waits before it drops. */
export function hoverY(): number {
  return HOVER_STRIP / 2;
}

/** The board face: a rounded rectangle with a hole per cell (even-odd fill). */
export function facePath(g: BoardGeometry): string {
  const r = 26;
  const x0 = 0;
  const y0 = g.faceTop;
  const x1 = g.width;
  const y1 = g.faceBottom;
  let d = `M${x0 + r},${y0}H${x1 - r}Q${x1},${y0} ${x1},${y0 + r}V${y1 - r}Q${x1},${y1} ${x1 - r},${y1}H${x0 + r}Q${x0},${y1} ${x0},${y1 - r}V${y0 + r}Q${x0},${y0} ${x0 + r},${y0}Z`;
  const hole = DISC_R + 3;
  for (let c = 0; c < g.cols; c++) {
    for (let row = 0; row < g.rows; row++) {
      const cx = cellX(c);
      const cy = cellY(g, row);
      d += `M${cx - hole},${cy}a${hole},${hole} 0 1,0 ${hole * 2},0a${hole},${hole} 0 1,0 ${-hole * 2},0Z`;
    }
  }
  return d;
}
