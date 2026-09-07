import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createActor } from "xstate";
import { cubesOnMap, isContiguous } from "./board";
import { sensoMachine, sensoSpec } from "./machine";
import type { AIStrategyId } from "./types";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

const BEATS = { ai: 1, trickSettle: 1 };

async function flush(): Promise<void> {
  await vi.advanceTimersByTimeAsync(5);
}

function start(strategies: (AIStrategyId | null)[], seed: number) {
  const actor = createActor(sensoMachine);
  actor.start();
  actor.send({ type: "START", playerCount: strategies.length, strategies, seed, beats: BEATS });
  return actor;
}

async function runToEnd(actor: ReturnType<typeof start>, maxTicks = 4000): Promise<void> {
  for (let i = 0; i < maxTicks; i++) {
    await flush();
    const snapshot = actor.getSnapshot();
    if (snapshot.matches("gameOver")) return;
    const gs = snapshot.context.gameState;
    if (gs) {
      for (const squares of gs.board) expect(isContiguous(squares)).toBe(true);
      for (const clan of gs.seatedClans) {
        expect(cubesOnMap(gs.board, clan) + gs.supply[clan]).toBe(8);
      }
    }
  }
}

describe("sensoMachine — boot", () => {
  it("stays idle until START, then deals a seeded game", async () => {
    const actor = createActor(sensoMachine);
    actor.start();
    expect(actor.getSnapshot().matches("idle")).toBe(true);
    expect(sensoSpec.getActivePlayer(actor.getSnapshot())).toBe(-1);
    expect(sensoSpec.getLegalActions(actor.getSnapshot(), 0)).toEqual([]);
    actor.send({ type: "START", playerCount: 3, strategies: [null, null, null], seed: 4 });
    const view = sensoSpec.getPlayerView(actor.getSnapshot(), 0);
    expect(view.players).toHaveLength(3);
    expect(view.hand).toHaveLength(6);
    expect(view.round).toBe(1);
    actor.stop();
  });

  it("returns to idle when START carries an impossible config", () => {
    const actor = createActor(sensoMachine);
    actor.start();
    actor.send({ type: "START", playerCount: 9, strategies: [], seed: 1 });
    expect(actor.getSnapshot().matches("idle")).toBe(true);
    expect(actor.getSnapshot().status).not.toBe("error");
    actor.stop();
  });
});

describe("sensoMachine — all-AI games", () => {
  it("plays a 2-player game to gameOver with a valid result", async () => {
    const actor = start(["random", "random"], 7);
    await runToEnd(actor);
    const snapshot = actor.getSnapshot();
    expect(snapshot.matches("gameOver")).toBe(true);
    expect(sensoSpec.isGameOver(snapshot)).toBe(true);
    const result = sensoSpec.getResult(snapshot);
    expect(result?.scores).toHaveLength(2);
    expect(result?.placements).toHaveLength(2);
    actor.stop();
  }, 30_000);

  it("plays a 5-player game with an Emperor seat whose rewards name a clan", async () => {
    const actor = start(["heuristic-v1", "aggressive", "random", "random", "heuristic-v1"], 8);
    await runToEnd(actor);
    const snapshot = actor.getSnapshot();
    expect(snapshot.matches("gameOver")).toBe(true);
    const gs = snapshot.context.gameState;
    expect(gs.emperorSeat).not.toBeNull();
    const emperorRewards = gs.log.filter((e) => e.kind === "reward" && e.player === gs.emperorSeat);
    for (const e of emperorRewards) if (e.kind === "reward") expect(e.action.as).toBeDefined();
    expect(sensoSpec.getResult(snapshot)?.scores).toHaveLength(5);
    actor.stop();
  }, 30_000);

  it("produces the same final board for the same seed", async () => {
    const a = start(["heuristic-v1", "aggressive", "random"], 99);
    const b = start(["heuristic-v1", "aggressive", "random"], 99);
    await runToEnd(a);
    await runToEnd(b);
    expect(a.getSnapshot().context.gameState.board).toEqual(
      b.getSnapshot().context.gameState.board,
    );
    expect(sensoSpec.getResult(a.getSnapshot())).toEqual(sensoSpec.getResult(b.getSnapshot()));
    a.stop();
    b.stop();
  }, 30_000);
});

describe("sensoMachine — a human seat", () => {
  it("accepts only the active seat's legal actions and blocks plays during the settle beat", async () => {
    const actor = start([null, "random"], 12);
    await flush();
    let snapshot = actor.getSnapshot();
    expect(sensoSpec.getActivePlayer(snapshot)).toBe(0);
    expect(sensoSpec.getLegalActions(snapshot, 1)).toEqual([]);
    const legal = sensoSpec.getLegalActions(snapshot, 0);
    expect(legal.length).toBeGreaterThan(0);

    const wrongSeat = sensoSpec.validateAction(snapshot, 1, {
      type: "PLAYER_ACTION",
      action: legal[0],
    });
    expect(wrongSeat.ok).toBe(false);
    const bogus = sensoSpec.validateAction(snapshot, 0, {
      type: "PLAYER_ACTION",
      action: { type: "play", card: "ninja-jade", extra: 1 },
    });
    expect(bogus.ok).toBe(false);

    const ok = sensoSpec.validateAction(snapshot, 0, { type: "PLAYER_ACTION", action: legal[0] });
    expect(ok.ok).toBe(true);
    if (ok.ok) actor.send(ok.event);
    // The AI answers after its beat; the trick then sits in the settle state.
    await vi.advanceTimersByTimeAsync(3);
    snapshot = actor.getSnapshot();
    const gs = snapshot.context.gameState;
    if (gs.phase === "trick-settle") {
      expect(sensoSpec.getLegalActions(snapshot, 0)).toEqual([]);
      expect(sensoSpec.getLegalActions(snapshot, 1)).toEqual([]);
    }
    await flush();
    expect(actor.getSnapshot().context.gameState.phase).toBe("trick");
    actor.stop();
  });

  it("drives a human seat through a whole game by always picking the first legal action", async () => {
    const actor = start([null, "heuristic-v1", "random"], 33);
    for (let i = 0; i < 4000; i++) {
      await flush();
      const snapshot = actor.getSnapshot();
      if (snapshot.matches("gameOver")) break;
      const legal = sensoSpec.getLegalActions(snapshot, 0);
      if (legal.length === 0) continue;
      const validated = sensoSpec.validateAction(snapshot, 0, {
        type: "PLAYER_ACTION",
        action: legal[0],
      });
      expect(validated.ok).toBe(true);
      if (validated.ok) actor.send(validated.event);
    }
    expect(actor.getSnapshot().matches("gameOver")).toBe(true);
    actor.stop();
  }, 30_000);
});

describe("sensoSpec — replay log", () => {
  it("is null in progress and structured (without a `durak` key) after the game", async () => {
    const actor = start(["random", "random"], 5);
    const getLog = sensoSpec.getReplayLog;
    if (!getLog) throw new Error("expected getReplayLog");
    expect(getLog(actor.getSnapshot())).toBeNull();
    await runToEnd(actor);
    const log = getLog(actor.getSnapshot()) as Record<string, unknown> | null;
    expect(log).not.toBeNull();
    expect(log?.playerCount).toBe(2);
    expect((log?.scores as number[]).length).toBe(2);
    expect(log).not.toHaveProperty("durak");
    expect(typeof log?.scoreA).toBe("number");
    actor.stop();
  }, 30_000);
});
