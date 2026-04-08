import type { Card, PlayerState } from "./types";
import { DUMPLING_SCORES, isNigiri, makiCount, nigiriValue } from "./types";

// ── Detailed Round Scoring ────────────────────────────────────────────────

export interface CategoryScores {
  maki: number;
  tempura: number;
  sashimi: number;
  dumpling: number;
  nigiri: number;
  total: number;
}

export interface RoundSnapshot {
  tableau: Card[];
  wasabiBoostedNigiriIds: number[];
  puddings: number;
}

export interface DetailedRoundResult {
  playerScores: CategoryScores[];
  snapshots: RoundSnapshot[];
  makiTotals: number[];
}

export function scoreRoundDetailed(players: PlayerState[]): DetailedRoundResult {
  const n = players.length;
  const perPlayer: CategoryScores[] = Array.from({ length: n }, () => ({
    maki: 0,
    tempura: 0,
    sashimi: 0,
    dumpling: 0,
    nigiri: 0,
    total: 0,
  }));

  // Maki
  const makiTotals = players.map((p) => p.tableau.reduce((sum, c) => sum + makiCount(c.type), 0));
  const makiScores = new Array<number>(n).fill(0);
  addMakiScores(makiTotals, makiScores);
  for (let i = 0; i < n; i++) perPlayer[i].maki = makiScores[i];

  for (let i = 0; i < n; i++) {
    const p = players[i];

    const tempuraCount = p.tableau.filter((c) => c.type === "tempura").length;
    perPlayer[i].tempura = Math.floor(tempuraCount / 2) * 5;

    const sashimiCount = p.tableau.filter((c) => c.type === "sashimi").length;
    perPlayer[i].sashimi = Math.floor(sashimiCount / 3) * 10;

    const dumplingCount = p.tableau.filter((c) => c.type === "dumpling").length;
    const clamped = Math.min(dumplingCount, DUMPLING_SCORES.length - 1);
    perPlayer[i].dumpling = DUMPLING_SCORES[clamped];

    let nigiriPts = 0;
    for (const card of p.tableau) {
      if (isNigiri(card.type)) {
        const base = nigiriValue(card.type);
        nigiriPts += p.wasabiBoostedNigiriIds.includes(card.id) ? base * 3 : base;
      }
    }
    perPlayer[i].nigiri = nigiriPts;

    perPlayer[i].total =
      perPlayer[i].maki +
      perPlayer[i].tempura +
      perPlayer[i].sashimi +
      perPlayer[i].dumpling +
      perPlayer[i].nigiri;
  }

  const snapshots: RoundSnapshot[] = players.map((p) => ({
    tableau: [...p.tableau],
    wasabiBoostedNigiriIds: [...p.wasabiBoostedNigiriIds],
    puddings: p.puddings + p.tableau.filter((c) => c.type === "pudding").length,
  }));

  return { playerScores: perPlayer, snapshots, makiTotals };
}

// ── Round Scoring ──────────────────────────────────────────────────────────

export function scoreRound(players: PlayerState[]): number[] {
  const n = players.length;
  const scores = new Array<number>(n).fill(0);

  // Maki
  const makiTotals = players.map((p) => p.tableau.reduce((sum, c) => sum + makiCount(c.type), 0));
  addMakiScores(makiTotals, scores);

  for (let i = 0; i < n; i++) {
    const p = players[i];

    // Tempura: 5 per pair
    const tempuraCount = p.tableau.filter((c) => c.type === "tempura").length;
    scores[i] += Math.floor(tempuraCount / 2) * 5;

    // Sashimi: 10 per triple
    const sashimiCount = p.tableau.filter((c) => c.type === "sashimi").length;
    scores[i] += Math.floor(sashimiCount / 3) * 10;

    // Dumplings: 0/1/3/6/10/15
    const dumplingCount = p.tableau.filter((c) => c.type === "dumpling").length;
    const clampedDumplings = Math.min(dumplingCount, DUMPLING_SCORES.length - 1);
    scores[i] += DUMPLING_SCORES[clampedDumplings];

    // Nigiri (with wasabi)
    for (const card of p.tableau) {
      if (isNigiri(card.type)) {
        const base = nigiriValue(card.type);
        const boosted = p.wasabiBoostedNigiriIds.includes(card.id);
        scores[i] += boosted ? base * 3 : base;
      }
    }
  }

  return scores;
}

function addMakiScores(makiTotals: number[], scores: number[]): void {
  if (makiTotals.every((m) => m === 0)) return;

  const sorted = [...new Set(makiTotals)].sort((a, b) => b - a).filter((v) => v > 0);
  if (sorted.length === 0) return;

  const firstValue = sorted[0];
  const firstCount = makiTotals.filter((m) => m === firstValue).length;
  const firstPoints = Math.floor(6 / firstCount);

  for (let i = 0; i < makiTotals.length; i++) {
    if (makiTotals[i] === firstValue) {
      scores[i] += firstPoints;
    }
  }

  // Second place only if not everyone tied for first
  if (firstCount === 1 && sorted.length > 1) {
    const secondValue = sorted[1];
    const secondCount = makiTotals.filter((m) => m === secondValue).length;
    const secondPoints = Math.floor(3 / secondCount);
    for (let i = 0; i < makiTotals.length; i++) {
      if (makiTotals[i] === secondValue) {
        scores[i] += secondPoints;
      }
    }
  }
}

// ── Pudding Scoring (End of Game) ──────────────────────────────────────────

export function scorePuddings(players: { puddings: number }[], playerCount: number): number[] {
  const n = players.length;
  const scores = new Array<number>(n).fill(0);
  const puddings = players.map((p) => p.puddings);

  const maxPudding = Math.max(...puddings);
  const minPudding = Math.min(...puddings);

  if (maxPudding > 0) {
    const mostCount = puddings.filter((p) => p === maxPudding).length;
    const bonus = Math.floor(6 / mostCount);
    for (let i = 0; i < n; i++) {
      if (puddings[i] === maxPudding) scores[i] += bonus;
    }
  }

  // No penalty in 2-player game (official rules)
  if (playerCount > 2 && maxPudding !== minPudding) {
    const fewestCount = puddings.filter((p) => p === minPudding).length;
    const penalty = Math.floor(6 / fewestCount);
    for (let i = 0; i < n; i++) {
      if (puddings[i] === minPudding) scores[i] -= penalty;
    }
  }

  return scores;
}
