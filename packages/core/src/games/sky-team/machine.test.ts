import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createActor } from "xstate";
import { placementsExhausted } from "./game-engine";
import { skyTeamMachine, skyTeamSpec } from "./machine";
import { getLegalActionsForPlayer } from "./rules";
import type { PlayerIndex, SkyTeamAction } from "./types";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

async function flush(): Promise<void> {
  // Has to cover at least one `aiStep` (the AI thinking pause) plus the
  // auto-progress timers — long enough to land at the next event waiting on
  // input. 1500ms gives one AI move + slack.
  await vi.advanceTimersByTimeAsync(1500);
}

describe("skyTeamMachine — boot", () => {
  it("starts in idle and transitions to active on START", async () => {
    const actor = createActor(skyTeamMachine);
    actor.start();
    expect(actor.getSnapshot().value).toBe("idle");
    actor.send({ type: "START", scenarioId: "yul-montreal", seed: 42, humanPlayers: [0, 1] });
    await flush();
    expect(actor.getSnapshot().context.gameState).not.toBeNull();
  });

  it("seeds the game state when START provides a seed", async () => {
    const a = createActor(skyTeamMachine);
    const b = createActor(skyTeamMachine);
    a.start();
    b.start();
    a.send({ type: "START", scenarioId: "yul-montreal", seed: 99, humanPlayers: [0, 1] });
    b.send({ type: "START", scenarioId: "yul-montreal", seed: 99, humanPlayers: [0, 1] });
    await flush();
    expect(a.getSnapshot().context.gameState?.unplacedDice[0].map((d) => d.value)).toEqual(
      b.getSnapshot().context.gameState?.unplacedDice[0].map((d) => d.value),
    );
  });
});

describe("skyTeamMachine — driving a game with two stub-AI seats", () => {
  it("plays to game-over with no human input (both seats AI)", async () => {
    const actor = createActor(skyTeamMachine);
    actor.start();
    actor.send({
      type: "START",
      scenarioId: "yul-montreal",
      seed: 7,
      humanPlayers: [],
      aiStrategy: "stub",
    });

    for (let i = 0; i < 200; i++) {
      await flush();
      if (actor.getSnapshot().matches("gameOver")) break;
    }

    expect(actor.getSnapshot().matches("gameOver")).toBe(true);
    expect(actor.getSnapshot().context.gameState?.outcome).not.toBeNull();
  });
});

describe("skyTeamMachine — human-driven flow", () => {
  function pickHumanAction(actor: ReturnType<typeof createActor<typeof skyTeamMachine>>): {
    player: PlayerIndex;
    action: SkyTeamAction;
  } | null {
    const ctx = actor.getSnapshot().context;
    const gs = ctx.gameState;
    if (!gs) return null;
    if (gs.outcome != null) {
      // Game ended — machine is in `awaitingGameOver`. Dispatch the ack so
      // the state-machine moves to its terminal `gameOver` state and the
      // test loop's `matches("gameOver")` check fires.
      return { player: gs.toPlace, action: { kind: "acknowledge-game-over" } };
    }
    if (gs.phase === "briefing") {
      for (const p of [0, 1] as PlayerIndex[]) {
        if (!gs.readyForRoll[p]) return { player: p, action: { kind: "ready-to-roll" } };
      }
      return null;
    }
    if (placementsExhausted(gs)) {
      return { player: gs.toPlace, action: { kind: "end-round" } };
    }
    if (gs.phase === "placement") {
      const player = gs.toPlace;
      const legal = getLegalActionsForPlayer(gs, player);
      const placement = legal.find((a) => a.kind === "place-die");
      if (!placement) return null;
      return { player, action: placement };
    }
    return null;
  }

  it("drives a full game with two human seats picking first legal", async () => {
    const actor = createActor(skyTeamMachine);
    actor.start();
    actor.send({
      type: "START",
      scenarioId: "yul-montreal",
      seed: 13,
      humanPlayers: [0, 1],
    });

    for (let i = 0; i < 500; i++) {
      await flush();
      if (actor.getSnapshot().matches("gameOver")) break;
      const next = pickHumanAction(actor);
      if (!next) {
        await flush();
        continue;
      }
      actor.send({ type: "PLAYER_ACTION", player: next.player, action: next.action });
    }

    expect(actor.getSnapshot().matches("gameOver")).toBe(true);
    expect(actor.getSnapshot().context.gameState?.outcome).not.toBeNull();
  });
});

describe("skyTeamSpec contract", () => {
  it("getActivePlayer returns -1 in briefing", async () => {
    const actor = createActor(skyTeamMachine);
    actor.start();
    actor.send({
      type: "START",
      scenarioId: "yul-montreal",
      seed: 1,
      humanPlayers: [0, 1],
    });
    await flush();
    expect(skyTeamSpec.getActivePlayer(actor.getSnapshot())).toBe(-1);
  });

  it("getPlayerView hides opponent unplaced dice", async () => {
    const actor = createActor(skyTeamMachine);
    actor.start();
    actor.send({
      type: "START",
      scenarioId: "yul-montreal",
      seed: 1,
      humanPlayers: [0, 1],
    });
    actor.send({ type: "PLAYER_ACTION", player: 0, action: { kind: "ready-to-roll" } });
    actor.send({ type: "PLAYER_ACTION", player: 1, action: { kind: "ready-to-roll" } });
    await flush();
    const v0 = skyTeamSpec.getPlayerView(actor.getSnapshot(), 0);
    expect(v0.myDice.length).toBe(4);
    expect(v0.opponentDiceCount).toBe(4);
    expect((v0 as { opponentDice?: unknown }).opponentDice).toBeUndefined();
  });

  it("getResult is null while game is in progress", async () => {
    const actor = createActor(skyTeamMachine);
    actor.start();
    actor.send({
      type: "START",
      scenarioId: "yul-montreal",
      seed: 1,
      humanPlayers: [0, 1],
    });
    await flush();
    expect(skyTeamSpec.getResult(actor.getSnapshot())).toBeNull();
  });

  it("getResult is non-null after game-over", async () => {
    const actor = createActor(skyTeamMachine);
    actor.start();
    actor.send({
      type: "START",
      scenarioId: "yul-montreal",
      seed: 7,
      humanPlayers: [],
      aiStrategy: "stub",
    });
    for (let i = 0; i < 200; i++) {
      await flush();
      if (actor.getSnapshot().matches("gameOver")) break;
    }
    const result = skyTeamSpec.getResult(actor.getSnapshot());
    expect(result).not.toBeNull();
    expect(result?.outcome).toBeDefined();
  });

  it("isGameOver follows the gameOver state", async () => {
    const actor = createActor(skyTeamMachine);
    actor.start();
    expect(skyTeamSpec.isGameOver(actor.getSnapshot())).toBe(false);
  });

  it("getReplayLog returns null in progress, structured log on game-over", async () => {
    const actor = createActor(skyTeamMachine);
    actor.start();
    actor.send({
      type: "START",
      scenarioId: "yul-montreal",
      seed: 7,
      humanPlayers: [],
      aiStrategy: "stub",
    });
    const getLog = skyTeamSpec.getReplayLog;
    if (!getLog) throw new Error("expected getReplayLog to be defined");
    expect(getLog(actor.getSnapshot())).toBeNull();
    for (let i = 0; i < 200; i++) {
      await flush();
      if (actor.getSnapshot().matches("gameOver")) break;
    }
    const log = getLog(actor.getSnapshot()) as {
      scenarioId: string;
      steps: unknown[];
    } | null;
    expect(log).not.toBeNull();
    expect(log?.scenarioId).toBe("yul-montreal");
    expect(log?.steps.length).toBeGreaterThan(0);
  });
});
