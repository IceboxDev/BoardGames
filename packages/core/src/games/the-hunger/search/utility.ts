import type { GameState } from "../types";

// A finished game's value targets for one seat, as the value net learns them:
// [utility, win, placement, margin, survived, players]. Utility weighs them
// like Strigoi's (0.5 win + 0.2 place + 0.2 margin + 0.1 survived), except the
// margin compares against rivals in the same survival tier — survivors rank
// above the burnt whatever their score.

export function outcomeTargets(end: GameState, seat: number): number[] {
  const r = end.result;
  if (!r) return [0, 0, 0, 0, 0, end.players.length];
  const n = r.placements.length;
  const win = r.winners.includes(seat) ? 1 / r.winners.length : 0;
  const place = n > 1 ? (n - r.placements[seat]) / (n - 1) : 1;
  // Margin against the rivals that actually compete for my place: survivors
  // rank above the burnt whatever their score, so a burnt rival's big score
  // must not make a survivor's win look like a loss (and vice versa).
  const burnt = (i: number) => r.breakdown[i].fate === "ashes";
  const survived = burnt(seat) ? 0 : 1;
  let best = Number.NEGATIVE_INFINITY;
  let beaten = false;
  for (let i = 0; i < n; i++) {
    if (i === seat) continue;
    if (burnt(seat) && !burnt(i)) beaten = true;
    else if (burnt(i) === burnt(seat) && r.scores[i] > best) best = r.scores[i];
  }
  const margin = beaten
    ? 0
    : best === Number.NEGATIVE_INFINITY
      ? 1
      : 1 / (1 + Math.exp(-(r.scores[seat] - best) / 8));
  const util = 0.5 * win + 0.2 * place + 0.2 * margin + 0.1 * survived;
  return [util, win, place, margin, survived, n];
}

/** The utility alone. */
export function seatUtility(end: GameState, seat: number): number {
  return outcomeTargets(end, seat)[0];
}
