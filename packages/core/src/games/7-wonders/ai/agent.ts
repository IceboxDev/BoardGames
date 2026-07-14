/**
 * Injectable AI seam. Core stays pure (no subprocess/native deps): the machine
 * calls `chooseAiAction`, which defaults to the random-legal stub. The server
 * injects a stronger agent (the C++ search via `cpp-agent.ts`) at startup with
 * `setAiAgent`. Any thrown/None result falls back to random inside the caller.
 */
import type { Rng } from "../../../lib/rng";
import type { GameState, SevenWondersAction } from "../types";
import { randomLegalAction } from "./random";

export type AiAgent = (
  state: GameState,
  playerIndex: number,
  rng?: Rng,
) => SevenWondersAction | null;

let override: AiAgent | null = null;

/** Install (or clear, with null) the agent used for all 7 Wonders AI seats. */
export function setAiAgent(fn: AiAgent | null): void {
  override = fn;
}

export function chooseAiAction(
  state: GameState,
  playerIndex: number,
  rng?: Rng,
): SevenWondersAction | null {
  if (override) {
    const a = override(state, playerIndex, rng);
    if (a) return a; // fall back to random if the injected agent declines/fails
  }
  return randomLegalAction(state, playerIndex, rng);
}
