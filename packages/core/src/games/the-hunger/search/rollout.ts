import { heuristicPick } from "../ai-heuristic";
import { applyUnchecked } from "../game-engine";
import { getActivePlayer, getLegalActions } from "../rules";
import type { Action, GameState } from "../types";

/** Nosferatu's move for whoever decides now — the rollout policy. */
export function rolloutAction(s: GameState): { seat: number; action: Action } {
  const seat = getActivePlayer(s);
  const legal = getLegalActions(s, seat);
  if (legal.length === 1) return { seat, action: legal[0] };
  try {
    const pick = heuristicPick(s, seat, legal);
    if (legal.includes(pick)) return { seat, action: pick };
  } catch {
    // Fall through to a safe legal move.
  }
  return { seat, action: legal.find((a) => a.type === "end-turn") ?? legal[0] };
}

/** Play `s` to sunrise with the rollout policy for every seat (mutation-free). */
export function playout(s: GameState, maxSteps = 5000): GameState {
  let cur = s;
  for (let i = 0; cur.phase !== "game-over" && i < maxSteps; i++) {
    const { seat, action } = rolloutAction(cur);
    cur = applyUnchecked(cur, seat, action);
  }
  return cur;
}

/**
 * A finished game's value for `seat` in [0, 1]. Mostly the win (shared wins
 * split); the rest separates otherwise-equal outcomes and cuts rollout noise:
 * placing higher, the score margin over the best rival, and surviving
 * sunrise (at two seats a burnt loss and a living loss otherwise tie, which
 * turns a noisy "I'm behind" into reckless lines).
 */
export function outcomeUtility(s: GameState, seat: number): number {
  const r = s.result;
  if (!r) return 0;
  const n = r.placements.length;
  const win = r.winners.includes(seat) ? 1 / r.winners.length : 0;
  const place = n > 1 ? (n - r.placements[seat]) / (n - 1) : 1;
  let best = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < n; i++) if (i !== seat && r.scores[i] > best) best = r.scores[i];
  const margin = 1 / (1 + Math.exp(-(r.scores[seat] - best) / 8));
  const survived = r.breakdown[seat].fate === "ashes" ? 0 : 1;
  return 0.5 * win + 0.2 * place + 0.2 * margin + 0.1 * survived;
}
