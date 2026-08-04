import { assign, fromPromise, type SnapshotFrom, setup } from "xstate";
import {
  type ActionValidation,
  acceptAction,
  parseActionSync,
  playerActionValidator,
  rejectAction,
  safeApply,
} from "../../machines/action-validation";
import type { GameMachineSpec } from "../../machines/types";
import { getStrategy } from "./ai-strategies";
import {
  applyAction,
  applyEndRound,
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
import {
  type PlayerIndex,
  type SkyTeamAction,
  SkyTeamActionSchema,
  type SkyTeamGameState,
  type SkyTeamPlayerView,
  type SkyTeamResult,
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
    // A deliberate beat before each AI placement so the human can read the
    // board / log after their own move (and between consecutive AI moves)
    // instead of seeing the state pop instantly. With no humans this still
    // applies but doesn't matter — AI-vs-AI tests just consume more fake
    // time, they don't deadlock.
    aiStep: 800,
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
    // "noHumans" auto-progresses past the awaitingEndRound state so AI-vs-AI
    // games (tournaments, simulations) don't deadlock waiting for input.
    noHumans: ({ context }) => context.humanPlayers.length === 0,
    isEndRoundAction: ({ event }) =>
      event.type === "PLAYER_ACTION" && event.action.kind === "end-round",
    isAcknowledgeGameOverAction: ({ event }) =>
      event.type === "PLAYER_ACTION" && event.action.kind === "acknowledge-game-over",
  },

  actions: {
    initGame: assign(({ event }) => {
      if (event.type !== "START") return {};
      return safeApply("sky-team", () => {
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
      });
    }),

    rollPhase: assign(({ context }) => {
      const gs = context.gameState;
      if (!gs) return {};
      return safeApply("sky-team", () => {
        const next = rollDice(gs, context.rng);
        return {
          gameState: next,
          replaySteps: [...context.replaySteps, makeAutomatedStep(context.replaySteps, next)],
        };
      });
    }),

    applyPlayerAction: assign(({ context, event }) => {
      if (event.type !== "PLAYER_ACTION") return {};
      const gs = context.gameState;
      if (!gs) return {};
      return safeApply("sky-team", () => {
        const next = applyAction(gs, event.player, event.action, { rng: context.rng });
        return {
          gameState: next,
          replaySteps: [
            ...context.replaySteps,
            makePlayerActionStep(context.replaySteps, event.player, event.action, next),
          ],
        };
      });
    }),

    applyEndRound: assign(({ context }) => {
      const gs = context.gameState;
      if (!gs) return {};
      return safeApply("sky-team", () => {
        const next = applyEndRound(gs);
        return {
          gameState: next,
          replaySteps: [...context.replaySteps, makeAutomatedStep(context.replaySteps, next)],
        };
      });
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
            { guard: "isGameOver", target: "awaitingGameOver" },
            { guard: "placementsExhausted", target: "awaitingEndRound" },
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
          // Pause before invoking the AI so the human has a beat to read
          // the board after the previous action (their own placement or a
          // prior AI placement) before this AI move resolves on top of it.
          after: {
            aiStep: { target: "aiActing" },
          },
        },

        aiActing: {
          invoke: {
            id: "computeAiAction",
            src: "computeAiAction",
            input: ({ context }) => {
              const player = aiPlayerForCurrentInput(context);
              if (player == null) {
                throw new Error("aiActing invoked without an AI input pending");
              }
              return { ctx: context, player };
            },
            onDone: {
              target: "routing",
              actions: assign(({ context, event }) => {
                const { player, action } = event.output;
                const gs = context.gameState;
                if (!gs) return {};
                return safeApply("sky-team", () => {
                  const next = applyAction(gs, player, action, { rng: context.rng });
                  return {
                    gameState: next,
                    replaySteps: [
                      ...context.replaySteps,
                      makePlayerActionStep(context.replaySteps, player, action, next),
                    ],
                  };
                });
              }),
            },
            onError: { target: "routing" },
          },
        },

        // All 8 dice placed. Wait for a human to dispatch `end-round`
        // before resolving the round so the team can inspect the final
        // board. In AI-vs-AI games (no humans), auto-progress via
        // `always: noHumans` so tournament tests don't deadlock.
        awaitingEndRound: {
          always: [{ guard: "noHumans", target: "endRound" }],
          on: {
            PLAYER_ACTION: { guard: "isEndRoundAction", target: "endRound" },
          },
        },

        endRound: {
          entry: "applyEndRound",
          after: { autoStep: { target: "routing" } },
        },

        // Game just ended (crash or victory). Hold the final board on
        // screen until a human dispatches `acknowledge-game-over`; the
        // server's `getResult` stays null until then so the client keeps
        // rendering the board instead of swapping in GameOverScreen.
        // AI-vs-AI games skip the wait via the `noHumans` guard.
        awaitingGameOver: {
          always: [{ guard: "noHumans", target: "#skyTeam.gameOver" }],
          on: {
            PLAYER_ACTION: {
              guard: "isAcknowledgeGameOverAction",
              target: "#skyTeam.gameOver",
            },
          },
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

type SkyTeamSnapshot = SnapshotFrom<typeof skyTeamMachine>;

function legalActionsFor(snapshot: SkyTeamSnapshot, player: number): SkyTeamAction[] {
  const gs = snapshot.context.gameState;
  if (!gs) return [];
  return getLegalActionsForPlayer(gs, player as PlayerIndex);
}

function toPlayerActionEvent(action: SkyTeamAction, player: number): SkyTeamMachineEvent {
  return { type: "PLAYER_ACTION", player: player as PlayerIndex, action };
}

const validateMatchedAction = playerActionValidator<
  typeof skyTeamMachine,
  SkyTeamAction,
  SkyTeamMachineEvent
>({
  legalActions: legalActionsFor,
  toEvent: toPlayerActionEvent,
});

/** The `spend-reroll` payload of an otherwise well-formed PLAYER_ACTION. */
function rerollPayload(raw: unknown): unknown {
  if (typeof raw !== "object" || raw === null) return null;
  if (!("type" in raw) || raw.type !== "PLAYER_ACTION") return null;
  if (!("action" in raw)) return null;
  const action = raw.action;
  if (typeof action !== "object" || action === null) return null;
  if (!("kind" in action) || action.kind !== "spend-reroll") return null;
  return action;
}

/**
 * `spend-reroll` is advertised with empty die lists that the client fills in,
 * so it is the one action that cannot be matched structurally. Its shape is
 * schema-checked here and the engine adjudicates which dice may be rerolled.
 */
const validateSkyTeamAction = (
  snapshot: SkyTeamSnapshot,
  player: number,
  raw: unknown,
): ActionValidation<SkyTeamMachineEvent> => {
  const matched = validateMatchedAction(snapshot, player, raw);
  if (matched.ok) return matched;

  const reroll = rerollPayload(raw);
  if (reroll === null) return matched;
  if (!legalActionsFor(snapshot, player).some((a) => a.kind === "spend-reroll")) return matched;

  const parsed = parseActionSync(SkyTeamActionSchema, reroll);
  if (!parsed.ok) return rejectAction(parsed.reason);
  return acceptAction(toPlayerActionEvent(parsed.value, player));
};

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
    return legalActionsFor(snapshot, player);
  },

  validateAction(snapshot, player, raw) {
    return validateSkyTeamAction(snapshot, player, raw);
  },

  getActivePlayer(snapshot) {
    const gs = snapshot.context.gameState;
    if (!gs) return 0;
    if (gs.phase === "briefing") return -1;
    // `awaitingGameOver` and `awaitingEndRound` are both "either-side
    // can advance" gates — return -1 so the server's turn-validation
    // falls into simultaneous-play mode and either human can click
    // through.
    if (gs.outcome != null) return -1;
    if (placementsExhausted(gs)) return -1;
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
