// Shared fixtures for the quiztopia tests: a deterministic question source,
// a seeded table and small drivers that walk the engine through a turn.

import type { Rng } from "../../lib/rng.ts";
import { applyAction } from "./engine.ts";
import { createFixtureQuestionSource } from "./question-source.ts";
import { getLegalActions } from "./rules.ts";
import { createGame } from "./setup.ts";
import {
  type BuildingStatus,
  type EngineDeps,
  type HelpCardId,
  type QuiztopiaAction,
  type QuiztopiaGameState,
  type QuiztopiaStartConfigInput,
  QuiztopiaStartConfigSchema,
} from "./types.ts";

export const fixtureSource = createFixtureQuestionSource();
export const deps: EngineDeps = { source: fixtureSource };

export function newGame(input: Partial<QuiztopiaStartConfigInput> = {}): QuiztopiaGameState {
  const config = QuiztopiaStartConfigSchema.parse({ playerCount: 2, seed: 1, ...input });
  return createGame(config, deps);
}

export function play(
  gs: QuiztopiaGameState,
  seat: number,
  action: QuiztopiaAction,
): QuiztopiaGameState {
  return applyAction(gs, seat, action, deps);
}

export function buildingWith(gs: QuiztopiaGameState, status: BuildingStatus): number {
  const i = gs.buildings.indexOf(status);
  if (i === -1) throw new Error(`no ${status} building`);
  return i;
}

/** The active seat picks a building (default: first dark, else first bright) and reveals. */
export function ask(gs: QuiztopiaGameState, buildingIndex?: number): QuiztopiaGameState {
  const bi =
    buildingIndex ??
    (gs.buildings.includes("dark") ? buildingWith(gs, "dark") : buildingWith(gs, "bright"));
  const seat = gs.turn.activeSeat;
  const chosen = play(gs, seat, { kind: "choose-building", buildingIndex: bi });
  return play(chosen, seat, { kind: "reveal" });
}

export function judge(gs: QuiztopiaGameState, correct: boolean): QuiztopiaGameState {
  return play(gs, gs.turn.activeSeat, { kind: "judge", correct });
}

/** One full turn: pick, reveal, judge. */
export function answer(
  gs: QuiztopiaGameState,
  correct: boolean,
  buildingIndex?: number,
): QuiztopiaGameState {
  return judge(ask(gs, buildingIndex), correct);
}

/** Replace the help deck: `ids` in order, the first `helpOpen` face-up, `used` marked spent. */
export function withHelpDeck(
  gs: QuiztopiaGameState,
  ids: HelpCardId[],
  opts: { used?: HelpCardId[]; helpOpen?: number } = {},
): QuiztopiaGameState {
  const used = new Set(opts.used ?? []);
  return {
    ...gs,
    helpDeck: ids.map((id) => ({ id, used: used.has(id) })),
    helpOpen: opts.helpOpen ?? 1,
  };
}

export function withBuildings(
  gs: QuiztopiaGameState,
  buildings: BuildingStatus[],
): QuiztopiaGameState {
  return { ...gs, buildings: [...buildings] };
}

export function statuses(
  dark: number,
  bright: number,
  won: number,
  lost: number,
): BuildingStatus[] {
  const out: BuildingStatus[] = [];
  for (let i = 0; i < dark; i++) out.push("dark");
  for (let i = 0; i < bright; i++) out.push("bright");
  for (let i = 0; i < won; i++) out.push("won");
  for (let i = 0; i < lost; i++) out.push("lost");
  if (out.length !== 12) throw new Error("statuses must sum to 12");
  return out;
}

export interface RandomStep {
  seat: number;
  action: QuiztopiaAction;
}

/** Every (seat, action) pair legal right now, in enumeration order. */
export function allLegal(gs: QuiztopiaGameState): RandomStep[] {
  const out: RandomStep[] = [];
  for (const seat of gs.seats) {
    for (const action of getLegalActions(gs, seat)) out.push({ seat, action });
  }
  return out;
}

/** Drives random legal actions until the game ends; throws if it wedges. */
export function randomPlay(
  gs: QuiztopiaGameState,
  rng: Rng,
  maxSteps = 5000,
): { gs: QuiztopiaGameState; steps: number } {
  let state = gs;
  let steps = 0;
  while (state.outcome === null) {
    const options = allLegal(state);
    if (options.length === 0) throw new Error(`stuck in ${state.phase} with no legal actions`);
    const pick = options[Math.floor(rng() * options.length)];
    state = play(state, pick.seat, pick.action);
    steps += 1;
    if (steps > maxSteps) throw new Error(`random play did not terminate in ${maxSteps} steps`);
  }
  return { gs: state, steps };
}
