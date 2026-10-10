import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createActor } from "xstate";
import { BETWEEN_GAMES_MS, connect4Spec, withConnect4AiOffload } from "./machine";
import { Connect4ReplayLogSchema } from "./replay-log";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function start(seats: ("human" | string)[], config: Record<string, unknown> = {}, seed = 7) {
  const actor = createActor(connect4Spec.machine);
  actor.start();
  actor.send(
    connect4Spec.buildStart({
      seats: seats.map((s) => (s === "human" ? { kind: "human" } : { kind: "ai", strategy: s })),
      config: connect4Spec.manifest.config.parse(config),
      seed,
    }),
  );
  return actor;
}

function act(actor: ReturnType<typeof start>, player: number, action: unknown) {
  const v = connect4Spec.validateAction(actor.getSnapshot(), player, {
    type: "PLAYER_ACTION",
    action,
  });
  if (!v.ok) throw new Error(v.reason);
  actor.send(v.event);
}

describe("connect4 machine", () => {
  it("plays a person against the AI to the end", async () => {
    const actor = start(["human", "blocker"]);
    for (let turn = 0; turn < 60 && !connect4Spec.isGameOver(actor.getSnapshot()); turn++) {
      const snap = actor.getSnapshot();
      if (connect4Spec.getActivePlayer(snap) === 0) {
        const drop = connect4Spec.getLegalActions(snap, 0).find((a) => a.type === "drop");
        if (drop) act(actor, 0, drop);
      }
      await vi.advanceTimersByTimeAsync(500);
    }
    const snap = actor.getSnapshot();
    expect(connect4Spec.isGameOver(snap)).toBe(true);
    expect(connect4Spec.getOutcome(snap)?.kind).toBe("ranked");
    const log = Connect4ReplayLogSchema.parse(connect4Spec.getReplayLog(snap));
    expect(log.games).toHaveLength(1);
    expect(JSON.parse(JSON.stringify(connect4Spec.getPlayerView(snap, 0)))).toBeTruthy();
  });

  it("rejects a move out of turn, a full column and junk", () => {
    const actor = start(["human", "human"]);
    for (let i = 0; i < 6; i++) act(actor, i % 2, { type: "drop", column: 0 });
    const snap = actor.getSnapshot();
    expect(
      connect4Spec.validateAction(snap, 1, {
        type: "PLAYER_ACTION",
        action: { type: "drop", column: 1 },
      }).ok,
    ).toBe(false);
    expect(
      connect4Spec.validateAction(snap, 0, {
        type: "PLAYER_ACTION",
        action: { type: "drop", column: 0 },
      }).ok,
    ).toBe(false);
    expect(
      connect4Spec.validateAction(snap, 0, {
        type: "PLAYER_ACTION",
        action: { type: "drop", column: 99 },
      }).ok,
    ).toBe(false);
    expect(connect4Spec.acceptsOffTurn?.(snap, 1, {})).toBe(true); // resigning
  });

  it("lets a person resign while the AI thinks", async () => {
    const offload = vi.fn(() => new Promise<never>(() => {}));
    const actor = createActor(withConnect4AiOffload(offload));
    actor.start();
    actor.send(
      connect4Spec.buildStart({
        seats: [{ kind: "human" }, { kind: "ai", strategy: "perfect" }],
        config: connect4Spec.manifest.config.parse({ firstPlayer: "seat1" }),
        seed: 1,
      }),
    );
    await vi.advanceTimersByTimeAsync(10);
    expect(offload).toHaveBeenCalledOnce();
    act(actor, 0, { type: "resign" });
    expect(connect4Spec.getResult(actor.getSnapshot())).toEqual({
      seriesWinner: 1,
      wins: [0, 1],
      gamesPlayed: 1,
    });
  });

  it("falls back to an inline move when the offload fails", async () => {
    const offload = vi.fn(() => Promise.reject(new Error("pool down")));
    const actor = createActor(withConnect4AiOffload(offload));
    actor.start();
    actor.send(
      connect4Spec.buildStart({
        seats: [{ kind: "human" }, { kind: "ai", strategy: "deep" }],
        config: connect4Spec.manifest.config.parse({ firstPlayer: "seat1" }),
        seed: 1,
      }),
    );
    await vi.advanceTimersByTimeAsync(1000);
    expect(actor.getSnapshot().context.gameState.moves).toHaveLength(1);
  });

  it("starts the next game of a series by itself", async () => {
    const actor = start(["human", "human"], { bestOf: 3 });
    act(actor, 0, { type: "resign" });
    expect(actor.getSnapshot().context.gameState.phase).toBe("between-games");
    await vi.advanceTimersByTimeAsync(BETWEEN_GAMES_MS + 10);
    const gs = actor.getSnapshot().context.gameState;
    expect([gs.phase, gs.gameIndex, gs.currentPlayer]).toEqual(["playing", 1, 1]);
  });

  it("replays the same game from the same seed", async () => {
    const play = async (seed: number) => {
      const actor = start(["human", "lookahead"], { firstPlayer: "seat1" }, seed);
      for (let i = 0; i < 40 && !connect4Spec.isGameOver(actor.getSnapshot()); i++) {
        const snap = actor.getSnapshot();
        if (connect4Spec.getActivePlayer(snap) === 0)
          act(actor, 0, connect4Spec.getLegalActions(snap, 0)[0]);
        await vi.advanceTimersByTimeAsync(500);
      }
      return actor.getSnapshot().context.gameState.moves.map((m) => m.column);
    };
    expect(await play(3)).toEqual(await play(3));
  });
});
