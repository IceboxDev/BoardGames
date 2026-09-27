/**
 * How a 7 Wonders AI seat decides. Core stays pure (no subprocess or native
 * dependencies): a seat set to `random` picks a random legal move; a seat set
 * to `search` asks the machine's search agent, which the server supplies per
 * session with `withSevenWondersAgent` (the C++ search in `cpp-agent.ts`).
 * Without an agent — or when it declines — a search seat plays randomly too.
 */
import type { Rng } from "../../../lib/rng";
import type { GameState, SevenWondersAction } from "../types";
import { randomLegalAction } from "./random";

export type SevenWondersStrategyId = "random" | "search";

export const SEVEN_WONDERS_STRATEGY_IDS: readonly { readonly id: SevenWondersStrategyId }[] = [
  { id: "random" },
  { id: "search" },
];

/** A search engine for one seat; `null` declines (the seat then plays randomly). */
export type SevenWondersAgent = (
  state: GameState,
  playerIndex: number,
) => Promise<SevenWondersAction | null>;

export async function chooseAiAction(
  state: GameState,
  playerIndex: number,
  strategy: SevenWondersStrategyId,
  agent: SevenWondersAgent | null,
  rng?: Rng,
): Promise<SevenWondersAction | null> {
  if (strategy === "search" && agent) {
    const action = await agent(state, playerIndex);
    if (action) return action;
  }
  return randomLegalAction(state, playerIndex, rng);
}
