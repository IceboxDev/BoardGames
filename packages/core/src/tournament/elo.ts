export interface TournamentResultForElo {
  strategyA: string;
  strategyB: string;
  aWins: number;
  bWins: number;
  draws: number;
}

const INITIAL_STRENGTH = 1;
const ITERATIONS = 100;
const CONVERGENCE_EPS = 1e-9;
const ELO_SCALE = 400;
const ELO_BASE = 1500;

/**
 * Bradley-Terry model: P(A beats B) = π_A / (π_A + π_B).
 * Order-independent: fits strength parameters from full match history via iterative MM.
 * Converts to ELO-like scale for display: rating = 1500 + 400 * log10(π / π_avg).
 */
export function computeElo(
  results: TournamentResultForElo[],
  strategyIds: string[],
): Map<string, number> {
  const ratings = new Map<string, number>();
  for (const id of strategyIds) {
    ratings.set(id, ELO_BASE);
  }

  if (results.length === 0) return ratings;

  const ids = [...strategyIds];
  const idToIdx = new Map(ids.map((id, i) => [id, i]));
  const n = ids.length;

  const wins: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  for (const r of results) {
    const i = idToIdx.get(r.strategyA);
    const j = idToIdx.get(r.strategyB);
    if (i === undefined || j === undefined) continue;
    wins[i][j] += r.aWins + r.draws / 2;
    wins[j][i] += r.bWins + r.draws / 2;
  }

  let pi = ids.map(() => INITIAL_STRENGTH);

  for (let iter = 0; iter < ITERATIONS; iter++) {
    const piNew = [...pi];

    for (let i = 0; i < n; i++) {
      let denom = 0;
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const total = wins[i][j] + wins[j][i];
        if (total <= 0) continue;
        denom += total / (pi[i] + pi[j]);
      }
      const winsTotal = wins[i].reduce((s, w) => s + w, 0);
      piNew[i] = denom > 0 ? winsTotal / denom : pi[i];
    }

    const scale = piNew.reduce((a, b) => a * b, 1) ** (1 / n);
    for (let i = 0; i < n; i++) {
      piNew[i] /= scale;
    }

    const maxDiff = Math.max(...piNew.map((p, i) => Math.abs(p - pi[i])));
    pi = piNew;
    if (maxDiff < CONVERGENCE_EPS) break;
  }

  const piAvg = pi.reduce((a, b) => a + b, 0) / n;
  for (let i = 0; i < n; i++) {
    const elo = ELO_BASE + ELO_SCALE * Math.log10(pi[i] / piAvg);
    ratings.set(ids[i], elo);
  }

  return ratings;
}
