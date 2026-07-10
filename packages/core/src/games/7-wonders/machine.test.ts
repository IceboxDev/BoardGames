import { describe, expect, it } from "vitest";
import { createActor, waitFor } from "xstate";
import { buildPlayerView, sevenWondersMachine, sevenWondersSpec } from "./machine";
import { getActivePlayer } from "./rules";

const fastMachine = sevenWondersMachine.provide({
  delays: { revealDelay: 0 },
});

describe("sevenWondersMachine", () => {
  it("stays idle until START and deals a seeded game", () => {
    const actor = createActor(sevenWondersMachine);
    actor.start();
    expect(actor.getSnapshot().matches("idle")).toBe(true);

    actor.send({ type: "START", playerCount: 3, seed: 42, sideMode: "A" });
    const snapshot = actor.getSnapshot();
    expect(snapshot.matches("idle")).toBe(false);
    const view = sevenWondersSpec.getPlayerView(snapshot, 0);
    expect(view.players).toHaveLength(3);
    expect(view.me?.hand).toHaveLength(7);
    actor.stop();
  });

  it("is deterministic for a fixed seed", () => {
    const a = createActor(sevenWondersMachine);
    const b = createActor(sevenWondersMachine);
    a.start();
    b.start();
    a.send({ type: "START", playerCount: 4, seed: 7, sideMode: "A" });
    b.send({ type: "START", playerCount: 4, seed: 7, sideMode: "A" });
    expect(a.getSnapshot().context.gameState.hands).toEqual(
      b.getSnapshot().context.gameState.hands,
    );
    a.stop();
    b.stop();
  });

  it("hides other players' hands but exposes all public board state", () => {
    const actor = createActor(sevenWondersMachine);
    actor.start();
    actor.send({ type: "START", playerCount: 3, seed: 1, sideMode: "A" });
    const ctx = actor.getSnapshot().context;

    const view = buildPlayerView(ctx, 0);
    expect(view.me?.index).toBe(0);
    expect(view.me?.hand).toHaveLength(7);
    for (const p of view.players) {
      expect(p.handCount).toBe(7);
      expect(p.coins).toBe(3);
      expect(p.wonderId).toBeDefined();
    }
    // The view carries no hand contents outside `me`.
    expect(JSON.stringify(view.players)).not.toContain(view.me?.hand[0]);

    const spectator = buildPlayerView(ctx, -1);
    expect(spectator.me).toBeNull();
    expect(spectator.players).toHaveLength(3);
    actor.stop();
  });

  it("reports simultaneous play while selecting", () => {
    const actor = createActor(sevenWondersMachine);
    actor.start();
    actor.send({ type: "START", playerCount: 3, seed: 1, sideMode: "A" });
    const snapshot = actor.getSnapshot();
    expect(sevenWondersSpec.getActivePlayer(snapshot)).toBe(-1);
    expect(getActivePlayer(snapshot.context.gameState)).toBe(-1);
    expect(sevenWondersSpec.getLegalActions(snapshot, 0).length).toBeGreaterThan(0);
    expect(sevenWondersSpec.getResult(snapshot)).toBeNull();
    actor.stop();
  });

  it("advances a turn when all humans have selected", async () => {
    const actor = createActor(fastMachine);
    actor.start();
    actor.send({ type: "START", playerCount: 3, seed: 5, sideMode: "A", humanPlayers: [0, 1, 2] });
    const gs = actor.getSnapshot().context.gameState;
    for (let i = 0; i < 3; i++) {
      actor.send({
        type: "PLAYER_ACTION",
        playerIndex: i,
        action: { type: "discard", cardId: gs.hands[i][0] },
      });
    }
    await waitFor(actor, (s) => s.context.gameState.turn === 2, { timeout: 2000 });
    const next = actor.getSnapshot().context.gameState;
    expect(next.players.every((p) => p.coins === 6)).toBe(true);
    actor.stop();
  }, 10000);

  it("plays a full all-AI game to completion with a valid result", async () => {
    const actor = createActor(fastMachine);
    actor.start();
    actor.send({ type: "START", playerCount: 3, seed: 99, humanPlayers: [] });

    await waitFor(actor, (s) => s.matches("gameOver"), { timeout: 30000 });

    const snapshot = actor.getSnapshot();
    expect(sevenWondersSpec.isGameOver(snapshot)).toBe(true);
    const result = sevenWondersSpec.getResult(snapshot);
    expect(result).not.toBeNull();
    expect(result?.totals).toHaveLength(3);
    expect(result?.breakdowns[0].total).toBe(result?.totals[0]);
    expect(result?.winner).toBeGreaterThanOrEqual(0);
    expect(result?.winner).toBeLessThan(3);

    const gs = snapshot.context.gameState;
    expect(gs.age).toBe(3);
    // Every player resolved 18 cards' worth of turns.
    for (const p of gs.players) {
      expect(p.coins).toBeGreaterThanOrEqual(0);
    }
    actor.stop();
  }, 40000);

  it("plays a 7-player all-AI game to completion", async () => {
    const actor = createActor(fastMachine);
    actor.start();
    actor.send({ type: "START", playerCount: 7, seed: 123, humanPlayers: [] });
    await waitFor(actor, (s) => s.matches("gameOver"), { timeout: 30000 });
    const result = sevenWondersSpec.getResult(actor.getSnapshot());
    expect(result?.totals).toHaveLength(7);
    actor.stop();
  }, 40000);
});
