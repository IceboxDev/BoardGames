import { assign, fromPromise, setup } from "xstate";
import type { GameMachineSpec } from "../../machines/types";
import { getStrategy } from "./ai-strategies";
import {
  applyAction,
  applyEndRound,
  InvalidActionError,
  placementsExhausted,
  rollDice,
  shouldRollDice,
} from "./game-engine";
import { buildPlayerView } from "./player-view";
import {
  buildGameLog,
  makeAutomatedStep,
  makeInitialStep,
  makePlayerActionStep,
  type SkyTeamReplayLog,
  type SkyTeamReplayStep,
} from "./replay-log";
import { createRng, type Rng, randomSeed } from "./rng";
import { getLegalActionsForPlayer } from "./rules";
import { getScenario } from "./scenarios";
import { createGame } from "./setup";
import type {
  PlayerIndex,
  SkyTeamAction,
  SkyTeamGameState,
  SkyTeamPlayerView,
  SkyTeamResult,
} from "./types";

export interface SkyTeamContext {
  gameState: SkyTeamGameState | null;
  seed: number;
  rng: Rng;
  humanPlayers: number[];
  aiStrategy: string | null;
  replaySteps: SkyTeamReplayStep[];
}

export type SkyTeamMachineEvent =
  | {
      type: "START";
      scenarioId: string;
      humanPlayers?: number[];
      aiStrategy?: string;
      seed?: number;
    }
  | { type: "PLAYER_ACTION"; player: PlayerIndex; action: SkyTeamAction }
  | { type: "RESET" };

const PLACEHOLDER_RNG: Rng = () => 0;

function isAiSeat(ctx: SkyTeamContext, player: PlayerIndex): boolean {
  return !ctx.humanPlayers.includes(player);
}

function aiPlayerForCurrentInput(ctx: SkyTeamContext): PlayerIndex | null {
  const gs = ctx.gameState;
  if (!gs) return null;
  if (gs.outcome != null) return null;
  if (gs.phase === "briefing") {
    for (const p of [0, 1] as PlayerIndex[]) {
      if (!gs.readyForRoll[p] && isAiSeat(ctx, p)) return p;
    }
    return null;
  }
  if (gs.phase === "placement") {
    if (isAiSeat(ctx, gs.toPlace)) return gs.toPlace;
    return null;
  }
  return null;
}

/**
 * `spend-reroll` is advertised as a legal action with empty die lists (the UI
 * fills them in), but applying it with no dice selected throws. An AI must
 * therefore never emit it — that exact action would be rejected by the engine,
 * leaving the state unchanged and the machine re-entering `aiThinking` forever.
 */
function isApplicableAiAction(action: SkyTeamAction): boolean {
  if (action.kind !== "spend-reroll") return true;
  return action.pilotDieIds.length + action.copilotDieIds.length > 0;
}

function pickAiAction(ctx: SkyTeamContext, player: PlayerIndex): SkyTeamAction {
  const gs = ctx.gameState;
  if (!gs) throw new Error("pickAiAction called with null gameState");
  const view = buildPlayerView(gs, player);
  const legal = getLegalActionsForPlayer(gs, player);
  const strategy = getStrategy(ctx.aiStrategy ?? "stub");

  // A guaranteed-applicable fallback so a strategy bug can never wedge the game:
  // prefer a placement, then any other applicable action.
  const fallback =
    legal.find((a) => a.kind === "place-die") ?? legal.find(isApplicableAiAction) ?? null;

  let chosen: SkyTeamAction;
  try {
    chosen = strategy.pickAction(view, legal, player);
  } catch (err) {
    if (typeof console !== "undefined") {
      console.error("[sky-team] AI strategy threw; using fallback action:", err);
    }
    if (fallback) return fallback;
    throw err; // genuinely no applicable action — let the caller surface it
  }

  if (!isApplicableAiAction(chosen) && fallback) {
    if (typeof console !== "undefined") {
      console.error("[sky-team] AI chose an inapplicable action; using fallback:", chosen);
    }
    return fallback;
  }
  return chosen;
}

export const skyTeamMachine = setup({
  types: {} as {
    context: SkyTeamContext;
    events: SkyTeamMachineEvent;
  },

  delays: {
    autoStep: 200,
    aiStep: 250,
  },

  actors: {
    computeAiAction: fromPromise(
      async ({
        input,
      }: {
        input: { ctx: SkyTeamContext; player: PlayerIndex };
      }): Promise<{ player: PlayerIndex; action: SkyTeamAction }> => {
        await new Promise((resolve) => setTimeout(resolve, 0));
        const action = pickAiAction(input.ctx, input.player);
        return { player: input.player, action };
      },
    ),
  },

  guards: {
    isGameOver: ({ context }) => context.gameState?.outcome != null,
    needsRoll: ({ context }) => context.gameState != null && shouldRollDice(context.gameState),
    placementsExhausted: ({ context }) =>
      context.gameState != null && placementsExhausted(context.gameState),
    hasAiInput: ({ context }) => aiPlayerForCurrentInput(context) != null,
    inBriefing: ({ context }) => context.gameState?.phase === "briefing",
    inPlacement: ({ context }) => context.gameState?.phase === "placement",
  },

  actions: {
    initGame: assign(({ event }) => {
      if (event.type !== "START") return {};
      const scenario = getScenario(event.scenarioId);
      const seed = event.seed ?? randomSeed();
      const rng = createRng(seed);
      const gs = createGame({ scenario, seed }, rng);
      return {
        gameState: gs,
        seed,
        rng,
        humanPlayers: event.humanPlayers ?? [0, 1],
        aiStrategy: event.aiStrategy ?? null,
        replaySteps: [makeInitialStep(gs)],
      };
    }),

    rollPhase: assign(({ context }) => {
      if (!context.gameState) return {};
      const next = rollDice(context.gameState, context.rng);
      return {
        gameState: next,
        replaySteps: [...context.replaySteps, makeAutomatedStep(context.replaySteps, next)],
      };
    }),

    applyPlayerAction: assign(({ context, event }) => {
      if (event.type !== "PLAYER_ACTION") return {};
      if (!context.gameState) return {};
      try {
        const next = applyAction(context.gameState, event.player, event.action, {
          rng: context.rng,
        });
        return {
          gameState: next,
          replaySteps: [
            ...context.replaySteps,
            makePlayerActionStep(context.replaySteps, event.player, event.action, next),
          ],
        };
      } catch (err) {
        if (err instanceof InvalidActionError) {
          if (typeof console !== "undefined") {
            console.error("Sky Team illegal action:", err.message);
          }
          return {};
        }
        throw err;
      }
    }),

    applyEndRound: assign(({ context }) => {
      if (!context.gameState) return {};
      const next = applyEndRound(context.gameState);
      return {
        gameState: next,
        replaySteps: [...context.replaySteps, makeAutomatedStep(context.replaySteps, next)],
      };
    }),
  },
}).createMachine({
  id: "skyTeam",
  initial: "idle",
  context: {
    gameState: null,
    seed: 0,
    rng: PLACEHOLDER_RNG,
    humanPlayers: [0, 1],
    aiStrategy: null,
    replaySteps: [],
  },

  states: {
    idle: {
      on: { START: { target: "active", actions: "initGame" } },
    },

    active: {
      initial: "routing",

      states: {
        routing: {
          always: [
            { guard: "isGameOver", target: "#skyTeam.gameOver" },
            { guard: "placementsExhausted", target: "endRound" },
            { guard: "needsRoll", target: "rolling" },
            { guard: "hasAiInput", target: "aiThinking" },
            { guard: "inBriefing", target: "briefing" },
            { guard: "inPlacement", target: "placement" },
          ],
        },

        rolling: {
          entry: "rollPhase",
          after: { autoStep: { target: "routing" } },
        },

        placement: {
          on: {
            PLAYER_ACTION: { target: "routing", actions: "applyPlayerAction" },
          },
        },

        briefing: {
          on: {
            PLAYER_ACTION: { target: "routing", actions: "applyPlayerAction" },
          },
        },

        aiThinking: {
          invoke: {
            id: "computeAiAction",
            src: "computeAiAction",
            input: ({ context }) => {
              const player = aiPlayerForCurrentInput(context);
              if (player == null) {
                throw new Error("aiThinking invoked without an AI input pending");
              }
              return { ctx: context, player };
            },
            onDone: {
              target: "routing",
              actions: assign(({ context, event }) => {
                const { player, action } = event.output;
                if (!context.gameState) return {};
                try {
                  const next = applyAction(context.gameState, player, action, {
                    rng: context.rng,
                  });
                  return {
                    gameState: next,
                    replaySteps: [
                      ...context.replaySteps,
                      makePlayerActionStep(context.replaySteps, player, action, next),
                    ],
                  };
                } catch (err) {
                  if (err instanceof InvalidActionError) {
                    if (typeof console !== "undefined") {
                      console.error("Sky Team AI illegal action:", err.message);
                    }
                    return {};
                  }
                  throw err;
                }
              }),
            },
            onError: { target: "routing" },
          },
        },

        endRound: {
          entry: "applyEndRound",
          after: { autoStep: { target: "routing" } },
        },
      },

      on: {
        START: { target: "active", actions: "initGame" },
        RESET: { target: "idle" },
      },
    },

    gameOver: {
      on: {
        START: { target: "active", actions: "initGame" },
        RESET: { target: "idle" },
      },
    },
  },
});

function toResult(gs: SkyTeamGameState): SkyTeamResult {
  const gearGreen = (["landing-gear-1", "landing-gear-2", "landing-gear-3"] as const).every(
    (id) => gs.slots[id].switchOn === true,
  );
  const flapsGreen = (["flaps-1", "flaps-2", "flaps-3", "flaps-4"] as const).every(
    (id) => gs.slots[id].switchOn === true,
  );
  const brakesDeployed = (["brakes-2", "brakes-4", "brakes-6"] as const).filter(
    (id) => gs.slots[id].switchOn === true,
  ).length;
  return {
    outcome: gs.outcome ?? "loss-mandatory",
    scenarioId: gs.scenario.id,
    finalAxis: gs.axis.position,
    finalApproach: gs.approach.current,
    rounds: gs.round,
    brakesDeployed,
    gearGreen,
    flapsGreen,
    airlinersRemaining: gs.approach.airliners.reduce((a, b) => a + b, 0),
  };
}

export const skyTeamSpec: GameMachineSpec<
  typeof skyTeamMachine,
  SkyTeamPlayerView,
  SkyTeamAction,
  SkyTeamResult
> = {
  machine: skyTeamMachine,

  getPlayerView(snapshot, player) {
    const gs = snapshot.context.gameState;
    if (!gs) {
      throw new Error("skyTeamSpec.getPlayerView called before game started");
    }
    return buildPlayerView(gs, player as PlayerIndex);
  },

  getLegalActions(snapshot, player) {
    const gs = snapshot.context.gameState;
    if (!gs) return [];
    return getLegalActionsForPlayer(gs, player as PlayerIndex);
  },

  getActivePlayer(snapshot) {
    const gs = snapshot.context.gameState;
    if (!gs) return 0;
    if (gs.phase === "briefing") return -1;
    return gs.toPlace;
  },

  getResult(snapshot) {
    const gs = snapshot.context.gameState;
    if (!gs || gs.outcome == null) return null;
    return toResult(gs);
  },

  isGameOver(snapshot) {
    return snapshot.matches("gameOver");
  },

  getReplayLog(snapshot): SkyTeamReplayLog | null {
    const ctx = snapshot.context;
    if (!ctx.gameState || ctx.gameState.outcome == null) return null;
    return buildGameLog({ finalState: ctx.gameState, steps: ctx.replaySteps });
  },
};
