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
  /** Add each imagined plan's own line for this turn to the candidates (needed at big tables). */
  goalArms?: boolean;
  /** Bias toward the optimised plan's line, in hundredths of a utility point. */
  execBias?: number;
  /** The optimised plan's 14 numbers (cpp/the-hunger/src/exec.cpp); with goals bit 64. */
  exec?: readonly number[];
}

/**
 * The 5- and 6-player plans Lilith imagines, FOUND by CMA-ES over the plan
 * executor's 14 numbers (cpp/the-hunger/train/exec_opt.py; fitness = win share
 * among Dracula fields). Order: pace, margin, lastOut, lab, forest, chest,
 * tavern, crypt, plains, outHumanVp, outNegSpeed, outPower, backForest, huntMin.
 */
export const LILITH_PLAN_5P = [
  0.9283, 1.3679, 8.1806, 1.0943, 1.8376, 3.8512, 2.0253, 1.0087, 0.2872, 0.0022, 3.5841, 1.4315,
  -2.1845, 0.7911,
] as const;
export const LILITH_PLAN_6P = [
  0.7877, 0.6034, 6.1198, 1.6672, 1.0311, 5.0856, 4.4113, 1.1625, -1.7746, 0.4724, 3.8333, 2.6872,
  -1.2469, 2.3865,
] as const;

/**
 * Lilith's setup for a table: the Rose run at 2–4 seats, the optimised plan at
 * 5–6 (where the Rose run stops paying), each line also proposed as a candidate.
 * Gates (200 held-out deals each vs Dracula, rules from aec6088): +19.5 / +39.5 /
 * +51.5 / +44.0 / +42.5 paired Δwin at 2–6p — scratch/bench/hunger/NOTES.md.
 */
export function lilithForTable(players: number, base: DraculaConfig): DraculaConfig {
  if (players <= 4) return { ...base, goals: 16, goalArms: true, exec: undefined };
  return {
    ...base,
    goals: 64,
    goalArms: true,
    exec: players === 5 ? LILITH_PLAN_5P : LILITH_PLAN_6P,
  };
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
  const { exec, ...rest } = cfg;
  const execFields = Object.fromEntries((exec ?? []).map((v, k) => [`exec${k}`, v]));
  return wasmPick(
    state,
    seat,
    legal,
    "dracula",
    configArray(DRACULA_CONFIG_FIELDS, { ...rest, ...execFields }),
  );
}
