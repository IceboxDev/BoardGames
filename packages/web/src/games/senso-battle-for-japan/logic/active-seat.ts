import type { SensoPlayerView } from "@boardgames/core/games/senso-battle-for-japan/types";

/** Mirrors core's `getActivePlayer` on the projected view. */
export function activeSeatOf(view: SensoPlayerView): number {
  switch (view.phase) {
    case "trick":
      return view.turn;
    case "trick-settle":
      return view.completedTrick?.winner ?? -1;
    case "rewards":
      return view.rewardQueue[0]?.player ?? -1;
    case "bonus":
      return view.bonusQueue[0] ?? -1;
    default:
      return -1;
  }
}
