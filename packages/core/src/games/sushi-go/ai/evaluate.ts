import { DUMPLING_SCORES } from "../types";
import type { MiniMaxPlayerState, MiniMaxState } from "./types";
import {
  MAKI_COUNTS,
  NIGIRI_VALUES,
  T_DUMPLING,
  T_EGG,
  T_MAKI1,
  T_MAKI3,
  T_PUDDING,
  T_SASHIMI,
  T_TEMPURA,
} from "./types";

// ── Score a single player's tableau ─────────────────────────────────────

interface PlayerScoreResult {
  maki: number;
  makiTotal: number;
  tempura: number;
  sashimi: number;
  dumpling: number;
  nigiri: number;
  total: number;
}

function scorePlayerTableau(player: MiniMaxPlayerState): PlayerScoreResult {
  const tab = player.tableau;

  // Maki total
  let makiTotal = 0;
  for (let t = T_MAKI1; t <= T_MAKI3; t++) {
    makiTotal += tab[t] * MAKI_COUNTS[t - T_MAKI1];
  }

  const tempuraCount = tab[T_TEMPURA];
  const sashimiCount = tab[T_SASHIMI];
  const dumplingCount = tab[T_DUMPLING];

  // Nigiri scoring with wasabi boost
  let nigiriPts = 0;
  for (let i = 0; i < 3; i++) {
    const count = tab[T_EGG + i];
    const boosted = player.boostedNigiri[i];
    const unboosted = count - boosted;
    const value = NIGIRI_VALUES[i];
    nigiriPts += boosted * value * 3 + unboosted * value;
  }

  const tempura = Math.floor(tempuraCount / 2) * 5;
  const sashimi = Math.floor(sashimiCount / 3) * 10;
  const clamped = Math.min(dumplingCount, DUMPLING_SCORES.length - 1);
  const dumpling = DUMPLING_SCORES[clamped];

  return {
    maki: 0, // filled in after comparing both players
    makiTotal,
    tempura,
    sashimi,
    dumpling,
    nigiri: nigiriPts,
    total: 0,
  };
}

// ── 2-player maki scoring ───────────────────────────────────────────────

function addMakiScores2P(scores: [PlayerScoreResult, PlayerScoreResult]): void {
  const m0 = scores[0].makiTotal;
  const m1 = scores[1].makiTotal;

  if (m0 === 0 && m1 === 0) return;

  if (m0 > m1) {
    scores[0].maki = 6;
    if (m1 > 0) scores[1].maki = 3;
  } else if (m1 > m0) {
    scores[1].maki = 6;
    if (m0 > 0) scores[0].maki = 3;
  } else {
    scores[0].maki = 3;
    scores[1].maki = 3;
  }
}

// ── Evaluate terminal state (round end) ─────────────────────────────────

export function evaluateRound(state: MiniMaxState): number {
  const scores: [PlayerScoreResult, PlayerScoreResult] = [
    scorePlayerTableau(state.players[0]),
    scorePlayerTableau(state.players[1]),
  ];

  addMakiScores2P(scores);

  for (const s of scores) {
    s.total = s.maki + s.tempura + s.sashimi + s.dumpling + s.nigiri;
  }

  let diff = scores[0].total - scores[1].total;

  // Pudding scoring: treat as if game ends now (accumulated + this round's tableau)
  // 2-player rules: +6 for most puddings, NO penalty for fewest
  const p0Puddings = state.players[0].puddings + state.players[0].tableau[T_PUDDING];
  const p1Puddings = state.players[1].puddings + state.players[1].tableau[T_PUDDING];
  const puddingDiff = p0Puddings - p1Puddings;

  if (puddingDiff > 0) diff += 6;
  else if (puddingDiff < 0) diff -= 6;

  // Tiebreaker: larger pudding margin is more robust across rounds.
  diff += puddingDiff * 0.3;

  return diff;
}
