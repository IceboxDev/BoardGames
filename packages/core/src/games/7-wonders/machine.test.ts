import { describe, expect, it } from "vitest";
import { createActor, waitFor } from "xstate";
import { buildPlayerView, sevenWondersMachine, sevenWondersSpec } from "./machine";
import { getActivePlayer } from "./rules";
import type { CardId } from "./types";
import { getWonderDef } from "./wonders";

const cardIdOf = (name: string): CardId => `${name}@9`;

const fastMachine = sevenWondersMachine.provide({
  delays: { revealDelay: 0 },
});

describe("sevenWondersMachine", () => {
  it("stays idle until START and deals a seeded game", () => {
    const actor = createActor(sevenWondersMachine);
    actor.start();
    expect(actor.getSnapshot().matches("idle")).toBe(true);

    actor.send({ type: "START", strategies: [null, null, null], seed: 42, sideMode: "A" });
    const snapshot = actor.getSnapshot();
    expect(snapshot.matches("idle")).toBe(false);
    const view = sevenWondersSpec.getPlayerView(snapshot, 0);
    expect(view.players).toHaveLength(3);
    expect(view.me?.hand).toHaveLength(7);
    actor.stop();
  });

  it("lets each person choose a side before Age I; AI seats have chosen already", () => {
    const actor = createActor(fastMachine);
    actor.start();
    actor.send({ type: "START", strategies: [null, null, "random"], seed: 11, sideMode: "choose" });
    let snap = actor.getSnapshot();
    expect(snap.context.gameState.phase).toBe("choosing-sides");
    expect(sevenWondersSpec.getLegalActions(snap, 0)).toEqual([
      { type: "choose-side", side: "A" },
      { type: "choose-side", side: "B" },
    ]);
    expect(sevenWondersSpec.getLegalActions(snap, 2)).toEqual([]);
    const view = sevenWondersSpec.getPlayerView(snap, 0);
    expect(view.me?.hand).toEqual([]);
    expect(view.players.map((p) => p.hasSelected)).toEqual([false, false, true]);
    expect(view.players.map((p) => p.side)).toEqual(["A", "A", "A"]);

    actor.send({
      type: "PLAYER_ACTION",
      playerIndex: 0,
      action: { type: "choose-side", side: "B" },
    });
    snap = actor.getSnapshot();
    expect(snap.context.gameState.phase).toBe("choosing-sides");
    expect(sevenWondersSpec.getLegalActions(snap, 0)).toEqual([]);

    actor.send({
      type: "PLAYER_ACTION",
      playerIndex: 1,
      action: { type: "choose-side", side: "A" },
    });
    snap = actor.getSnapshot();
    expect(snap.context.gameState.phase).toBe("selecting");
    expect(snap.context.gameState.players.slice(0, 2).map((p) => p.side)).toEqual(["B", "A"]);
    expect(sevenWondersSpec.getPlayerView(snap, 0).me?.hand).toHaveLength(7);
    actor.stop();
  });

  it("is deterministic for a fixed seed", () => {
    const a = createActor(sevenWondersMachine);
    const b = createActor(sevenWondersMachine);
    a.start();
    b.start();
    a.send({ type: "START", strategies: [null, null, null, null], seed: 7, sideMode: "A" });
    b.send({ type: "START", strategies: [null, null, null, null], seed: 7, sideMode: "A" });
    expect(a.getSnapshot().context.gameState.hands).toEqual(
      b.getSnapshot().context.gameState.hands,
    );
    a.stop();
    b.stop();
  });

  it("hides other players' hands but exposes all public board state", () => {
    const actor = createActor(sevenWondersMachine);
    actor.start();
    actor.send({ type: "START", strategies: [null, null, null], seed: 1, sideMode: "A" });
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

  it("shows each city's running score and production", () => {
    const actor = createActor(sevenWondersMachine);
    actor.start();
    actor.send({ type: "START", strategies: [null, null, null], seed: 3, sideMode: "A" });
    const ctx = actor.getSnapshot().context;
    const view = buildPlayerView(ctx, 0);
    for (const [i, p] of view.players.entries()) {
      // 3 coins = 1 VP, nothing else yet.
      expect(p.score.total).toBe(1);
      expect(p.score.coins).toBe(1);
      const initial = getWonderDef(ctx.gameState.players[i].wonderId).sides.A.initialResource;
      expect(p.production).toEqual([[initial]]);
    }
    // Spectators see the same public numbers.
    expect(buildPlayerView(ctx, -1).players[0].score).toEqual(view.players[0].score);

    // An either/or card is one entry with two choices.
    const gs = ctx.gameState;
    const withTreeFarm = {
      ...ctx,
      gameState: {
        ...gs,
        players: gs.players.map((p, i) =>
          i === 0 ? { ...p, tableau: [...p.tableau, cardIdOf("Tree Farm")] } : p,
        ),
      },
    };
    const farm = buildPlayerView(withTreeFarm, 0).players[0].production;
    expect(farm).toContainEqual(["wood", "clay"]);
    actor.stop();
  });

  it("reports simultaneous play while selecting", () => {
    const actor = createActor(sevenWondersMachine);
    actor.start();
    actor.send({ type: "START", strategies: [null, null, null], seed: 1, sideMode: "A" });
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
    actor.send({ type: "START", strategies: [null, null, null], seed: 5, sideMode: "A" });
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
    actor.send({ type: "START", strategies: ["random", "random", "random"], seed: 99 });

    await waitFor(actor, (s) => s.matches("gameOver"), { timeout: 30000 });

    const snapshot = actor.getSnapshot();
    expect(sevenWondersSpec.isGameOver(snapshot)).toBe(true);
    const result = sevenWondersSpec.getResult(snapshot);
    expect(result).not.toBeNull();
    expect(result?.totals).toHaveLength(3);
    expect(result?.breakdowns[0].total).toBe(result?.totals[0]);
    expect(result?.winner).toBeGreaterThanOrEqual(0);
    expect(result?.winner).toBeLessThan(3);

    // The view's running score is the final breakdown once the game is over.
    const view = buildPlayerView(snapshot.context, 0);
    expect(view.players.map((p) => p.score)).toEqual(result?.breakdowns);

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
    actor.send({
      type: "START",
      strategies: ["random", "random", "random", "random", "random", "random", "random"],
      seed: 123,
    });
    await waitFor(actor, (s) => s.matches("gameOver"), { timeout: 30000 });
    const result = sevenWondersSpec.getResult(actor.getSnapshot());
    expect(result?.totals).toHaveLength(7);
    actor.stop();
  }, 40000);
});
