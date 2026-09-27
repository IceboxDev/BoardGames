import type { Action, GameState } from "../types";
import { configArray, DRACULA_CONFIG_FIELDS, wasmPick } from "./wasm-agent";

// Dracula: the top tier. Its search lives in C++ (cpp/the-hunger/src/dracula.cpp),
// reached through WebAssembly — ~20× the TS engine's speed, which buys
// thousands of sampled-world rollouts per decision. On top of Strigoi's
// algorithm it plans whole turns (every distinct sequence of the seat's
// remaining decisions this turn, cut at the first reveal of hidden cards) and
// scores outcomes against rivals in the same survival tier.
//
// Benchmarks (cpp `hg duel`, 300 fresh deals, vs Strigoi at the rollout count
// its live 1.2 s buys): see scratch/bench/hunger/NOTES.md.

export interface DraculaConfig {
  /** Rollouts per decision when `timeMs` is 0 (benches, tournaments). */
  rollouts: number;
  /** Wall-clock budget per decision (live rooms); 0 = use `rollouts`. */
  timeMs: number;
}

export const DEFAULT_DRACULA: DraculaConfig = { rollouts: 4000, timeMs: 0 };

/** Dracula's move. Throws if the WebAssembly module is unavailable or traps. */
export function draculaPick(
  state: GameState,
  seat: number,
  legal: readonly Action[],
  cfg: DraculaConfig = DEFAULT_DRACULA,
): Action {
  if (legal.length === 1) return legal[0];
  return wasmPick(state, seat, legal, "dracula", configArray(DRACULA_CONFIG_FIELDS, { ...cfg }));
}
