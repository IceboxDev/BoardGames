import { huntsLeft, playAreaSpeed } from "@boardgames/core/games/the-hunger/rules";
import type { HungerPlayerView, PlayCard } from "@boardgames/core/games/the-hunger/types";

/** What "your Speed" means right now, for the gauge on the left rail. */
export interface SpeedReadout {
  /** The big number. */
  value: number;
  /** When set, `value` is what is left of this. */
  of?: number;
  label: string;
  detail: string;
  /** Hunts still open this turn (general + column-1), when you are acting. */
  hunts?: number;
  /** Your Speed is being spent right now. */
  live: boolean;
}

/**
 * Your Speed at a glance, whatever is happening:
 * - acting, after step 1: Speed left of the turn's total, and Hunts left;
 * - in step 1: what the cards in play will give (tokens spent included);
 * - otherwise: what your next hand will give, with your Permanents.
 */
export function speedReadout(view: HungerPlayerView): SpeedReadout | null {
  const me = view.players[view.me];
  if (!me) return null;
  if (me.castleTile !== null) {
    return { value: 0, label: "Home", detail: "Safe in the Castle until sunrise", live: false };
  }
  const turn = view.current;
  if (turn && turn.player === view.me && view.phase === "play") {
    if (turn.stage === 2) {
      const h = huntsLeft(turn);
      return {
        value: turn.speedLeft,
        of: Math.max(0, turn.speed),
        label: "Speed left",
        detail: turn.speedLeft > 0 ? "Walk or hunt with it" : "All spent",
        hunts: h.general + h.col1,
        live: true,
      };
    }
    return {
      value: playAreaSpeed(me.playArea) + turn.bonusSpeed,
      label: "Speed this turn",
      detail: "From the cards in play, before movement",
      live: true,
    };
  }
  const next: PlayCard[] = [
    ...me.playArea,
    ...view.hand.map((id): PlayCard => ({ id, resolved: false })),
  ];
  return {
    value: playAreaSpeed(next),
    label: "Next turn",
    detail: "Your hand and Permanents",
    live: false,
  };
}
