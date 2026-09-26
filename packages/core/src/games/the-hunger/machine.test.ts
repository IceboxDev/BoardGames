import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createActor } from "xstate";
import { BOARDS } from "./content/boards";
import { theHungerMachine, theHungerSpec } from "./machine";
import type { AIStrategyId } from "./types";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function start(strategies: (AIStrategyId | null)[], seed: number) {
  const actor = createActor(theHungerMachine);
  actor.start();
  actor.send({
    type: "START",
    playerCount: strategies.length,
    strategies,
    seed,
    beats: { ai: 1 },
  });
  return actor;
}

describe("theHungerMachine", () => {
  it("stays idle until START, then waits for the setup Mission pick", () => {
    const actor = createActor(theHungerMachine);
    actor.start();
    expect(theHungerSpec.getActivePlayer(actor.getSnapshot())).toBe(-1);
    expect(theHungerSpec.getLegalActions(actor.getSnapshot(), 0)).toEqual([]);
    actor.send({ type: "START", playerCount: 3, strategies: [null, null, null], seed: 4 });
    const view = theHungerSpec.getPlayerView(actor.getSnapshot(), 0);
    expect(view.phase).toBe("setup");
    expect(view.current?.step).toBe("missions");
    expect(view.current?.missionPick?.offered).toHaveLength(2);
    actor.stop();
  });

  it("returns to idle on an impossible config", () => {
    const actor = createActor(theHungerMachine);
    actor.start();
    actor.send({ type: "START", playerCount: 9, strategies: [], seed: 1 });
    expect(actor.getSnapshot().matches("idle")).toBe(true);
    actor.stop();
  });

  it("plays an all-AI game to the end", async () => {
    const actor = start(["heuristic-v1", "heuristic-v1", "random"], 21);
    for (let i = 0; i < 3000 && !actor.getSnapshot().matches("gameOver"); i++) {
      await vi.advanceTimersByTimeAsync(5);
    }
    const snap = actor.getSnapshot();
    expect(snap.matches("gameOver")).toBe(true);
    const result = theHungerSpec.getResult(snap);
    expect(result?.scores).toHaveLength(3);
    const replay = theHungerSpec.getReplayLog?.(snap) as { playerCount: number } | null;
    expect(replay?.playerCount).toBe(3);
    actor.stop();
  });

  it("validates untrusted actions against the legal list", () => {
    const actor = start([null, "heuristic-v1"], 3);
    const snap = actor.getSnapshot();
    const seat = theHungerSpec.getActivePlayer(snap);
    const [first] = theHungerSpec.getLegalActions(snap, seat);
    expect(
      theHungerSpec.validateAction(snap, seat, { type: "PLAYER_ACTION", action: first }).ok,
    ).toBe(true);
    expect(
      theHungerSpec.validateAction(snap, seat, {
        type: "PLAYER_ACTION",
        action: { type: "keep-missions", keep: ["strategist", "royal"] },
      }).ok,
    ).toBe(false);
    expect(
      theHungerSpec.validateAction(snap, 1 - seat, { type: "PLAYER_ACTION", action: first }).ok,
    ).toBe(false);
    actor.stop();
  });

  it("hides hands, decks, Missions and the Tavern from other seats", () => {
    const actor = start([null, null], 3);
    const snap = actor.getSnapshot();
    const gs = snap.context.gameState;
    const view = theHungerSpec.getPlayerView(snap, 1);
    expect(view.hand).toEqual(gs.players[1].hand);
    expect(JSON.stringify(view)).not.toContain(gs.players[0].hand[0]);
    expect(view.tavernCount).toBe(3);
    expect(JSON.stringify(view)).not.toContain(gs.tavern[0]);
    expect(view.current?.missionPick).toBeNull();
    for (const sp of BOARDS.B.spaces) {
      if (sp.effect === "chest") expect(view.chests[sp.id]).toBe("hidden");
      if (sp.effect === "chest-open") expect(view.chests[sp.id]).toBe(gs.chests[sp.id]);
    }
    actor.stop();
  });
});
