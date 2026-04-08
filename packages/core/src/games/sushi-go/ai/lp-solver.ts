// ── Zero-sum Nash equilibrium solver ────────────────────────────────────
//
// For a 2-player zero-sum game with m×n payoff matrix A (rows = P1, cols = P2):
//   P1 maximizes min_j Σ_i p_i·A[i][j]  (maximin)
//   P2 minimizes max_i Σ_j q_j·A[i][j]  (minimax)
//
// By the minimax theorem these are equal. We solve both via LP:
//   P1: maximize v  s.t.  Σ_i p_i·A[i][j] ≥ v ∀j,  Σp=1, p≥0
//   P2: minimize w  s.t.  Σ_j q_j·A[i][j] ≤ w ∀i,  Σq=1, q≥0
//
// Implementation: shift payoffs so all are positive, then use the classic
// LP formulation where variables are x_i = p_i / v (unnormalized).

export interface NashSolution {
  p1Strategy: number[];
  p2Strategy: number[];
  gameValue: number;
}

/**
 * Solve a zero-sum game. A[i][j] = payoff to P1 when P1 plays i, P2 plays j.
 * Returns mixed-strategy Nash equilibrium.
 */
export function solveZeroSum(A: number[][]): NashSolution {
  const m = A.length;
  const n = A[0].length;

  // Trivial cases
  if (m === 1) return singleRow(A, n);
  if (n === 1) return singleCol(A, m);

  // Check for dominant pure strategies (common in late game)
  const pureSol = checkPureStrategies(A, m, n);
  if (pureSol) return pureSol;

  // 2×2 closed-form (very common in late turns)
  if (m === 2 && n === 2) return solve2x2(A);

  // Iterated strict dominance elimination
  const reduced = iteratedDominanceElimination(A, m, n);
  if (reduced) return redistributeEquivalent(A, reduced);

  // General case: solve via simplex
  return redistributeEquivalent(A, solveLPSimplex(A, m, n));
}

// ── Trivial: single row/column ─────────────────────────────────────────

function singleRow(A: number[][], n: number): NashSolution {
  let minVal = A[0][0];
  let minJ = 0;
  for (let j = 1; j < n; j++) {
    if (A[0][j] < minVal) {
      minVal = A[0][j];
      minJ = j;
    }
  }
  const q = Array(n).fill(0);
  q[minJ] = 1;
  return { p1Strategy: [1], p2Strategy: q, gameValue: minVal };
}

function singleCol(A: number[][], m: number): NashSolution {
  let maxVal = A[0][0];
  let maxI = 0;
  for (let i = 1; i < m; i++) {
    if (A[i][0] > maxVal) {
      maxVal = A[i][0];
      maxI = i;
    }
  }
  const p = Array(m).fill(0);
  p[maxI] = 1;
  return { p1Strategy: p, p2Strategy: [1], gameValue: maxVal };
}

// ── Pure strategy dominance check ──────────────────────────────────────

function checkPureStrategies(A: number[][], m: number, n: number): NashSolution | null {
  let maximinVal = -Infinity;
  let maximinRow = 0;
  for (let i = 0; i < m; i++) {
    let rowMin = Infinity;
    for (let j = 0; j < n; j++) {
      if (A[i][j] < rowMin) rowMin = A[i][j];
    }
    if (rowMin > maximinVal) {
      maximinVal = rowMin;
      maximinRow = i;
    }
  }

  let minimaxVal = Infinity;
  let minimaxCol = 0;
  for (let j = 0; j < n; j++) {
    let colMax = -Infinity;
    for (let i = 0; i < m; i++) {
      if (A[i][j] > colMax) colMax = A[i][j];
    }
    if (colMax < minimaxVal) {
      minimaxVal = colMax;
      minimaxCol = j;
    }
  }

  if (Math.abs(maximinVal - minimaxVal) < 1e-9) {
    const p = Array(m).fill(0);
    p[maximinRow] = 1;
    const q = Array(n).fill(0);
    q[minimaxCol] = 1;
    return { p1Strategy: p, p2Strategy: q, gameValue: maximinVal };
  }

  return null;
}

// ── 2×2 closed-form Nash equilibrium ──────────────────────────────────

function solve2x2(A: number[][]): NashSolution {
  const a = A[0][0];
  const b = A[0][1];
  const c = A[1][0];
  const d = A[1][1];

  const denom = a - b - c + d;

  if (Math.abs(denom) < 1e-12) {
    // Degenerate: all entries similar, any mix works. Use uniform.
    const value = (a + b + c + d) / 4;
    return { p1Strategy: [0.5, 0.5], p2Strategy: [0.5, 0.5], gameValue: value };
  }

  const p1 = (d - c) / denom; // P1's probability on row 0
  const q1 = (d - b) / denom; // P2's probability on col 0

  // If out of [0,1], a pure strategy dominates
  if (p1 <= 0 || p1 >= 1 || q1 <= 0 || q1 >= 1) {
    // Fall back to pure strategy check (handles edge cases cleanly)
    const maximin0 = Math.min(a, b);
    const maximin1 = Math.min(c, d);
    if (maximin0 >= maximin1) {
      const j = b < a ? 1 : 0;
      return {
        p1Strategy: [1, 0],
        p2Strategy: [j === 0 ? 1 : 0, j === 1 ? 1 : 0],
        gameValue: A[0][j],
      };
    }
    const j = d < c ? 1 : 0;
    return {
      p1Strategy: [0, 1],
      p2Strategy: [j === 0 ? 1 : 0, j === 1 ? 1 : 0],
      gameValue: A[1][j],
    };
  }

  const gameValue = (a * d - b * c) / denom;
  return {
    p1Strategy: [p1, 1 - p1],
    p2Strategy: [q1, 1 - q1],
    gameValue,
  };
}

// ── Iterated strict dominance elimination ──────────────────────────────

function iteratedDominanceElimination(A: number[][], m: number, n: number): NashSolution | null {
  // Track surviving rows/cols
  const rows: number[] = Array.from({ length: m }, (_, i) => i);
  const cols: number[] = Array.from({ length: n }, (_, j) => j);

  let changed = true;
  while (changed) {
    changed = false;

    // Remove strictly dominated rows (P1 strategies)
    for (let ri = rows.length - 1; ri >= 0; ri--) {
      if (rows.length <= 1) break;
      const r = rows[ri];
      for (let rk = 0; rk < rows.length; rk++) {
        if (rk === ri) continue;
        const rOther = rows[rk];
        let dominated = true;
        for (const c of cols) {
          if (A[r][c] >= A[rOther][c]) {
            dominated = false;
            break;
          }
        }
        if (dominated) {
          rows.splice(ri, 1);
          changed = true;
          break;
        }
      }
    }

    // Remove strictly dominated columns (P2 strategies)
    for (let ci = cols.length - 1; ci >= 0; ci--) {
      if (cols.length <= 1) break;
      const c = cols[ci];
      for (let ck = 0; ck < cols.length; ck++) {
        if (ck === ci) continue;
        const cOther = cols[ck];
        let dominated = true;
        for (const r of rows) {
          // P2 minimizes, so col c is dominated if A[r][c] >= A[r][cOther] for all r
          if (A[r][c] <= A[r][cOther]) {
            dominated = false;
            break;
          }
        }
        if (dominated) {
          cols.splice(ci, 1);
          changed = true;
          break;
        }
      }
    }
  }

  // If reduced to something smaller, solve the sub-game
  if (rows.length < m || cols.length < n) {
    if (rows.length === 1 && cols.length === 1) {
      const p = Array(m).fill(0);
      p[rows[0]] = 1;
      const q = Array(n).fill(0);
      q[cols[0]] = 1;
      return { p1Strategy: p, p2Strategy: q, gameValue: A[rows[0]][cols[0]] };
    }

    // Build sub-matrix and solve
    const subA = rows.map((r) => cols.map((c) => A[r][c]));
    const subSol = solveSubGame(subA, rows.length, cols.length);

    // Map back to original indices
    const p = Array(m).fill(0);
    for (let i = 0; i < rows.length; i++) p[rows[i]] = subSol.p1Strategy[i];
    const q = Array(n).fill(0);
    for (let j = 0; j < cols.length; j++) q[cols[j]] = subSol.p2Strategy[j];

    return { p1Strategy: p, p2Strategy: q, gameValue: subSol.gameValue };
  }

  return null; // No reduction possible
}

/** Solve a (possibly reduced) sub-game */
function solveSubGame(A: number[][], m: number, n: number): NashSolution {
  if (m === 1) return singleRow(A, n);
  if (n === 1) return singleCol(A, m);
  if (m === 2 && n === 2) return solve2x2(A);

  const pureSol = checkPureStrategies(A, m, n);
  if (pureSol) return pureSol;

  return solveLPSimplex(A, m, n);
}

// ── Simplex-based LP solver ────────────────────────────────────────────

function solveLPSimplex(A: number[][], m: number, n: number): NashSolution {
  // Shift matrix so all entries are strictly positive
  let minEntry = Infinity;
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      if (A[i][j] < minEntry) minEntry = A[i][j];
    }
  }
  const shift = minEntry <= 0 ? -minEntry + 1 : 0;

  const B: number[][] = Array.from({ length: m }, (_, i) =>
    Array.from({ length: n }, (_, j) => A[i][j] + shift),
  );

  const p1Raw = solveMaxSumLP(B, m, n);

  const Bt: number[][] = Array.from({ length: n }, (_, j) =>
    Array.from({ length: m }, (_, i) => B[i][j]),
  );
  const p2Raw = solveMaxSumLP(Bt, n, m);

  const sumP1 = p1Raw.reduce((a, b) => a + b, 0);
  const sumP2 = p2Raw.reduce((a, b) => a + b, 0);

  const p1Strategy = sumP1 > 1e-12 ? p1Raw.map((x) => x / sumP1) : Array(m).fill(1 / m);
  const p2Strategy = sumP2 > 1e-12 ? p2Raw.map((y) => y / sumP2) : Array(n).fill(1 / n);
  const gameValue = sumP1 > 1e-12 ? 1 / sumP1 - shift : 0;

  return { p1Strategy, p2Strategy, gameValue };
}

/**
 * Solve: maximize Σ x_i  subject to  C^T · x ≤ 1,  x ≥ 0
 * Uses the simplex method with Bland's rule to avoid cycling.
 */
function solveMaxSumLP(C: number[][], rows: number, cols: number): number[] {
  const totalVars = rows + cols;
  const tableau: number[][] = [];

  for (let j = 0; j < cols; j++) {
    const row = Array(totalVars + 1).fill(0);
    for (let i = 0; i < rows; i++) {
      row[i] = C[i][j];
    }
    row[rows + j] = 1; // slack
    row[totalVars] = 1; // rhs
    tableau.push(row);
  }

  const objRow = Array(totalVars + 1).fill(0);
  for (let i = 0; i < rows; i++) {
    objRow[i] = -1;
  }
  tableau.push(objRow);

  const basis = Array.from({ length: cols }, (_, j) => rows + j);

  const maxIter = 200;
  for (let iter = 0; iter < maxIter; iter++) {
    const zRow = tableau[cols];

    let enterCol = -1;
    for (let c = 0; c < totalVars; c++) {
      if (zRow[c] < -1e-10) {
        enterCol = c;
        break;
      }
    }
    if (enterCol === -1) break;

    let minRatio = Infinity;
    let leaveRow = -1;
    for (let r = 0; r < cols; r++) {
      if (tableau[r][enterCol] > 1e-10) {
        const ratio = tableau[r][totalVars] / tableau[r][enterCol];
        if (
          ratio < minRatio - 1e-12 ||
          (Math.abs(ratio - minRatio) < 1e-12 && basis[r] < basis[leaveRow])
        ) {
          minRatio = ratio;
          leaveRow = r;
        }
      }
    }
    if (leaveRow === -1) break;

    // Pivot
    const pivotVal = tableau[leaveRow][enterCol];
    for (let c = 0; c <= totalVars; c++) {
      tableau[leaveRow][c] /= pivotVal;
    }
    for (let r = 0; r <= cols; r++) {
      if (r === leaveRow) continue;
      const factor = tableau[r][enterCol];
      if (Math.abs(factor) < 1e-15) continue;
      for (let c = 0; c <= totalVars; c++) {
        tableau[r][c] -= factor * tableau[leaveRow][c];
      }
    }

    basis[leaveRow] = enterCol;
  }

  const x = Array(rows).fill(0);
  for (let r = 0; r < cols; r++) {
    if (basis[r] < rows) {
      x[basis[r]] = Math.max(0, tableau[r][totalVars]);
    }
  }

  return x;
}

// ── Redistribute weight among equivalent strategies ───────────────────
//
// The LP solver picks an arbitrary vertex when multiple strategies have
// identical payoffs (e.g. 100% Tempura / 0% Dumpling when their columns
// are the same). This post-processing distributes weight evenly among
// equivalent strategies so the UI doesn't mislead the player.

function redistributeEquivalent(A: number[][], sol: NashSolution): NashSolution {
  const m = A.length;
  const n = A[0].length;

  // Group equivalent P1 rows (identical payoff vectors)
  const p1 = redistributeByGroups(sol.p1Strategy, m, (i1, i2) => {
    for (let j = 0; j < n; j++) {
      if (Math.abs(A[i1][j] - A[i2][j]) > 1e-9) return false;
    }
    return true;
  });

  // Group equivalent P2 columns (identical payoff vectors)
  const p2 = redistributeByGroups(sol.p2Strategy, n, (j1, j2) => {
    for (let i = 0; i < m; i++) {
      if (Math.abs(A[i][j1] - A[i][j2]) > 1e-9) return false;
    }
    return true;
  });

  return { p1Strategy: p1, p2Strategy: p2, gameValue: sol.gameValue };
}

function redistributeByGroups(
  strategy: number[],
  size: number,
  areEquivalent: (a: number, b: number) => boolean,
): number[] {
  const assigned = new Uint8Array(size);
  const result = [...strategy];

  for (let i = 0; i < size; i++) {
    if (assigned[i]) continue;

    // Find all indices equivalent to i
    const group = [i];
    for (let k = i + 1; k < size; k++) {
      if (!assigned[k] && areEquivalent(i, k)) {
        group.push(k);
      }
    }

    if (group.length > 1) {
      // Sum total weight in this equivalence group, distribute evenly
      let total = 0;
      for (const idx of group) total += strategy[idx];
      const each = total / group.length;
      for (const idx of group) {
        result[idx] = each;
        assigned[idx] = 1;
      }
    } else {
      assigned[i] = 1;
    }
  }

  return result;
}
