// ---------------------------------------------------------------------------
// AI seats. Every strategy picks from the engine's own legal actions, so a
// bad heuristic can play badly but never illegally.
// ---------------------------------------------------------------------------

import { createRng } from "../../lib/rng";
import { matchLegalAction } from "../../machines/action-validation";
import { heuristicPick } from "./ai-heuristic";
import { getActivePlayer, getLegalActions } from "./rules";
import { DEFAULT_DRACULA, DEFAULT_LILITH, type DraculaConfig, draculaPick } from "./search/dracula";
import { DEFAULT_STRIGOI, type StrigoiConfig, strigoiPick } from "./search/strigoi";
import { type Action, type AIStrategyId, ALL_STRATEGIES, type GameState } from "./types";

export interface HungerStrategy {
  id: AIStrategyId;
  label: string;
  description: string;
  pickAction(state: GameState, seat: number, legal: readonly Action[]): Action;
}

// ---------------------------------------------------------------------------
// Random
// ---------------------------------------------------------------------------

const meta = (id: AIStrategyId) => {
  const m = ALL_STRATEGIES.find((s) => s.id === id);
  if (!m) throw new Error(`Unknown strategy ${id}`);
  return m;
};

const RANDOM: HungerStrategy = {
  ...meta("random"),
  pickAction(state, _seat, legal) {
    // Seeded from the game so self-play (and its tests) replay exactly.
    return legal[Math.floor(createRng(state.rng ^ (state.log.length * 7919))() * legal.length)];
  },
};

const HEURISTIC: HungerStrategy = {
  ...meta("heuristic-v1"),
  pickAction: heuristicPick,
};

/** Live Strigoi settings (the bench patches them via `configureStrigoi`). */
const strigoiConfig: StrigoiConfig = { ...DEFAULT_STRIGOI };
export function configureStrigoi(patch: Partial<StrigoiConfig>): void {
  Object.assign(strigoiConfig, patch);
}

const STRIGOI: HungerStrategy = {
  ...meta("strigoi"),
  pickAction: (state, seat, legal) => strigoiPick(state, seat, legal, strigoiConfig),
};

/** Live Dracula settings (the worker sets a time budget via `configureDracula`). */
const draculaConfig: DraculaConfig = { ...DEFAULT_DRACULA };
export function configureDracula(patch: Partial<DraculaConfig>): void {
  Object.assign(draculaConfig, patch);
}

const DRACULA: HungerStrategy = {
  ...meta("dracula"),
  pickAction: (state, seat, legal) => {
    try {
      return draculaPick(state, seat, legal, draculaConfig);
    } catch {
      // No WebAssembly (or a trap): Strigoi on the same budget is the next best.
      return strigoiPick(state, seat, legal, strigoiConfig);
    }
  },
};

/** Live Lilith settings (the worker sets her time budget via `configureLilith`). */
const lilithConfig: DraculaConfig = { ...DEFAULT_LILITH };
export function configureLilith(patch: Partial<DraculaConfig>): void {
  Object.assign(lilithConfig, patch);
}

const LILITH: HungerStrategy = {
  ...meta("lilith"),
  pickAction: (state, seat, legal) => {
    try {
      return draculaPick(state, seat, legal, lilithConfig);
    } catch {
      return strigoiPick(state, seat, legal, strigoiConfig);
    }
  },
};

export const STRATEGIES: readonly HungerStrategy[] = [HEURISTIC, RANDOM, STRIGOI, DRACULA, LILITH];

/** Bench-only variants (e.g. `strigoi:rollouts=384`), looked up after the shipped ones. */
const EXTRA = new Map<string, HungerStrategy>();

export function registerStrategy(strategy: HungerStrategy): void {
  EXTRA.set(strategy.id, strategy);
}

export function getStrategy(id: AIStrategyId | undefined): HungerStrategy {
  return STRATEGIES.find((s) => s.id === id) ?? (id && EXTRA.get(id)) ?? HEURISTIC;
}

/** The move an AI seat makes now. Falls back to any legal action on a throw. */
export function pickAiAction(state: GameState): Action {
  const seat = getActivePlayer(state);
  const legal = getLegalActions(state, seat);
  if (legal.length === 0) throw new Error("AI has no legal action");
  try {
    const pick = getStrategy(state.players[seat]?.aiStrategy).pickAction(state, seat, legal);
    if (legal.includes(pick)) return pick;
  } catch {
    // Fall through to a safe legal move.
  }
  return legal.find((a) => a.type === "end-turn") ?? legal[0];
}

// ---------------------------------------------------------------------------
// Off-thread search (live rooms)
// ---------------------------------------------------------------------------

/**
 * Runs a search bot's decision somewhere other than the caller's thread. The
 * server binds a worker pool into each session's machine
 * (`withHungerAiOffload`); core stays free of worker dependencies.
 */
export type AiOffload = (state: GameState) => Promise<Action>;

/** A search bot: too slow for the caller's thread, so it is offloaded. */
export function isSearchStrategy(id: AIStrategyId | undefined): boolean {
  return ALL_STRATEGIES.some((s) => s.id === id && s.search === true);
}

/**
 * The live machine's AI move. A search bot's move comes from `offload`; if
 * there is none, or it fails or answers with something illegal, the seat
 * plays Nosferatu's move this time so a game never stalls and a long search
 * never blocks the caller's thread.
 */
export async function pickAiActionAsync(
  state: GameState,
  offload: AiOffload | null,
): Promise<Action> {
  const seat = getActivePlayer(state);
  if (!isSearchStrategy(state.players[seat]?.aiStrategy)) return pickAiAction(state);
  const legal = getLegalActions(state, seat);
  if (legal.length === 1) return legal[0];
  if (offload) {
    try {
      const match = matchLegalAction(legal, await offload(state));
      if (match) return match;
    } catch {
      // Fall back below.
    }
  }
  try {
    const pick = HEURISTIC.pickAction(state, seat, legal);
    if (legal.includes(pick)) return pick;
  } catch {
    // Fall through to a safe legal move.
  }
  return legal.find((a) => a.type === "end-turn") ?? legal[0];
}
