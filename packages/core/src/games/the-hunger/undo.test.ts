import { describe, expect, it } from "vitest";
import { createActor } from "xstate";
import { theHungerMachine, theHungerSpec } from "./machine";
import { graph } from "./rules";
import { act, afterSetup, emptyTrack, legal as legalOf, rigTurn } from "./test-helpers";
import type { Action } from "./types";
import { isUndoable } from "./undo";

const speedy = ["vampiric-speed-3#0", "vampiric-speed-3#1", "vampire-speed-2#0-0"];
const base = afterSetup(2, 7);
const check = (s: ReturnType<typeof rigTurn>, a: Action) => isUndoable(s, act(s, a), a);

describe("what can be undone", () => {
  it("movement, staying put and pushes are undoable", () => {
    const s = rigTurn(base, 0, { hand: speedy, pos: "road-3" });
    expect(check(s, { type: "move", to: "road-5", spent: 2 })).toBe(true);
    expect(check(s, { type: "stay" })).toBe(true);
  });

  it("hunting face-up piles and Roses is undoable; a Gregarious draw is not", () => {
    const track = emptyTrack();
    track[0][0] = ["o-nel#0"];
    track[1][0] = ["wilma#0"];
    let s = rigTurn(base, 0, { hand: speedy, pos: "road-3", track });
    s = act(s, { type: "move", to: "road-4", spent: 1 });
    expect(check(s, { type: "hunt", row: 0, col: 0 })).toBe(true);
    // Wilma is Gregarious: her companion comes off the Hunt deck, unseen.
    expect(check(s, { type: "hunt", row: 1, col: 0 })).toBe(false);
  });

  it("drawing, face-down Chests and Crypts are not", () => {
    // road-4 is a Chest (face down): taking it reveals the token.
    let chest = rigTurn(base, 0, { hand: speedy, pos: "road-3" });
    chest = act(chest, { type: "move", to: "road-4", spent: 1 });
    expect(check(chest, { type: "space" })).toBe(false);
    const dee = rigTurn(base, 0, { hand: ["dee#0", ...speedy.slice(1)], pos: "road-4" });
    expect(check(dee, { type: "resolve", card: "dee#0" })).toBe(false);
    let crypt = rigTurn(base, 0, { hand: speedy, pos: "road-1" });
    crypt = act(crypt, { type: "move", to: "road-2", spent: 1 });
    expect(check(crypt, { type: "space" })).toBe(false);
  });

  it("taking a face-up Chest's token is undoable, and so is spending its Speed", () => {
    const open = graph(base).def.spaces.find(
      (sp) => sp.effect === "chest-open" && base.chests[sp.id],
    );
    if (!open) throw new Error("no face-up Chest with a token");
    const b = structuredClone(base);
    b.chests[open.id] = "speed-1#0";
    // Arrive on it: a space only works for a Vampire who moved there.
    const from = graph(b).adj.get(open.id)?.[0];
    if (!from) throw new Error("no neighbour");
    let s = rigTurn(b, 0, { hand: speedy, pos: from });
    const onto = legalOf(s).find((a) => a.type === "move" && a.to === open.id);
    if (!onto) throw new Error("cannot step onto the Chest");
    s = act(s, onto);
    expect(check(s, { type: "space" })).toBe(true);
    s = act(s, { type: "space" });
    expect(s.players[0].bonus.map((t) => t.id)).toContain("speed-1#0");
    expect(check(s, { type: "use-bonus", token: "speed-1#0" })).toBe(true);
  });

  it("ending the turn is never undoable", () => {
    const s = act(rigTurn(base, 0, { hand: speedy, pos: "road-4" }), { type: "stay" });
    expect(check(s, { type: "end-turn" })).toBe(false);
  });
});

describe("undo through the machine", () => {
  const start = () => {
    const actor = createActor(theHungerMachine);
    actor.start();
    actor.send({ type: "START", playerCount: 2, strategies: [null, null], seed: 3 });
    const legal = (seat: number) => theHungerSpec.getLegalActions(actor.getSnapshot(), seat);
    const active = () => theHungerSpec.getActivePlayer(actor.getSnapshot());
    const send = (a: Action) => {
      const v = theHungerSpec.validateAction(actor.getSnapshot(), active(), {
        type: "PLAYER_ACTION",
        action: a,
      });
      if (!v.ok) throw new Error(v.reason);
      actor.send(v.event);
    };
    // Setup Missions, then clear step 1.
    while (actor.getSnapshot().context.gameState.phase === "setup") send(legal(active())[0]);
    for (let i = 0; i < 20 && actor.getSnapshot().context.gameState.current?.step !== "move"; i++) {
      const options = legal(active());
      send(options.find((a) => a.type === "end-manipulation") ?? options[0]);
    }
    return { actor, legal, active, send };
  };

  it("offers Undo after a move, only to the mover, and restores the position", () => {
    const { actor, legal, active, send } = start();
    const seat = active();
    const from = actor.getSnapshot().context.gameState.players[seat].pos;
    expect(legal(seat).some((a) => a.type === "undo")).toBe(false);
    const move = legal(seat).find((a) => a.type === "move");
    if (!move) throw new Error("no move");
    send(move);
    expect(legal(seat)).toContainEqual({ type: "undo" });
    expect(legal(1 - seat).some((a) => a.type === "undo")).toBe(false);
    send({ type: "undo" });
    expect(actor.getSnapshot().context.gameState.players[seat].pos).toBe(from);
    expect(actor.getSnapshot().context.gameState.current?.step).toBe("move");
    expect(legal(seat).some((a) => a.type === "undo")).toBe(false);
    actor.stop();
  });

  it("a revealing action clears the Undo stack", () => {
    const { actor, legal, active, send } = start();
    const seat = active();
    send({ type: "stay" });
    expect(legal(seat)).toContainEqual({ type: "undo" });
    send({ type: "end-turn" });
    expect(legal(seat).some((a) => a.type === "undo")).toBe(false);
    expect(legal(active()).some((a) => a.type === "undo")).toBe(false);
    actor.stop();
  });
});
