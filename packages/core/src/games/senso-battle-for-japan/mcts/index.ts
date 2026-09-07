import { pickBonus } from "../ai-rewards";
import { DEFAULT_SEARCH, pickRewardSearch } from "../ai-search";
import type { AIStrategy } from "../types";
import { DEFAULT_TENKA, type TenkaConfig } from "./config";
import { pickPlayTenka } from "./ismcts";
import { pickBonusTenka, pickRewardTenka } from "./rewards-search";

export { configureTenka, DEFAULT_TENKA, type TenkaConfig } from "./config";
export { pickPlayTenka, type TenkaStats } from "./ismcts";
export { pickBonusTenka, pickRewardTenka } from "./rewards-search";

/** A Tenka variant with fixed options — for A/B runs. */
export function tenkaStrategy(id: AIStrategy["id"], cfg: () => TenkaConfig): AIStrategy {
  return {
    id,
    pickAction(state, legal, seat, budget) {
      const c = budget && budget.timeMs > 0 ? { ...cfg(), timeMs: budget.timeMs } : cfg();
      switch (state.phase) {
        case "trick":
          return pickPlayTenka(state, legal, seat, c).action;
        case "rewards":
          return c.rewardsSearch
            ? pickRewardTenka(state, legal, seat, c)
            : pickRewardSearch(state, legal, seat, DEFAULT_SEARCH);
        case "bonus":
          return c.rewardsSearch
            ? pickBonusTenka(state, legal, seat, c)
            : pickBonus(state, legal, seat);
        default:
          return legal[0];
      }
    },
  };
}

export const TENKA: AIStrategy = tenkaStrategy("tenka", () => DEFAULT_TENKA);
