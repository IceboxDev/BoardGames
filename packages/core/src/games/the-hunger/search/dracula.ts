import type { Action, GameState } from "../types";
import { configArray, DRACULA_CONFIG_FIELDS, wasmPick } from "./wasm-agent";

// Dracula: the top tier. Its search lives in C++ (cpp/the-hunger/src/dracula.cpp),
// reached through WebAssembly — ~20× the TS engine's speed, which buys
// thousands of sampled-world rollouts per decision. On top of Strigoi's
// algorithm it plans whole turns (every distinct sequence of the seat's
// remaining decisions this turn, cut at the first reveal of hidden cards) and
// scores outcomes against rivals in the same survival tier. Its playouts use a
// rival model that knows a doomed Vampire will push you on the last turn, and
// 30 % of its utility is survival alone, so a losing seat still runs home.
//
// Benchmarks (cpp `hg duel`, 300 fresh deals, vs Strigoi at the rollout count
// its live 1.2 s buys): see scratch/bench/hunger/NOTES.md.

export interface DraculaConfig {
  /** Rollouts per decision when `timeMs` is 0 (benches, tournaments). */
  rollouts: number;
  /** Wall-clock budget per decision (live rooms); 0 = use `rollouts`. */
  timeMs: number;
  /**
   * Share of the utility that is survival alone (C++ default when omitted).
   * Without it a seat that is losing anyway sees little reason to run home.
   */
  survival?: number;
  /**
   * Portfolio playouts (C++ Goal bits): 16 = the searcher's imagined self may also
   * play the Rose run (cpp/the-hunger/src/runner.cpp); a plan scores its better line.
   * Lilith is Dracula with this set.
   */
  goals?: number;
  /** Play the rest of the chosen whole-turn plan without re-searching until something is revealed. */
  followPlan?: boolean;
}

/** Lilith: Dracula whose imagined self can also play the Rose run. */
export const DEFAULT_LILITH: DraculaConfig = {
  rollouts: 8000,
  timeMs: 0,
  goals: 16,
  followPlan: true,
};

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
