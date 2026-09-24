import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type ActorRefFrom, createActor } from "xstate";
import { createRng } from "../../lib/rng.ts";
import { quiztopiaMachine, quiztopiaSpec } from "./machine.ts";
import { createFixtureQuestionSource, setQuestionSource } from "./question-source.ts";
import { getLegalActions } from "./rules.ts";
import type { QuiztopiaAction, QuiztopiaStartConfigInput } from "./types.ts";

type Actor = ActorRefFrom<typeof quiztopiaMachine>;

beforeAll(() => setQuestionSource(createFixtureQuestionSource()));
afterAll(() => setQuestionSource(null));

function boot(): { actor: Actor; errors: unknown[] } {
  const actor = createActor(quiztopiaMachine);
  const errors: unknown[] = [];
  actor.subscribe({ next: () => {}, error: (err) => errors.push(err) });
  actor.start();
  return { actor, errors };
}

function start(actor: Actor, config: QuiztopiaStartConfigInput): void {
  actor.send({ type: "START", ...config });
}

/** Sends an action the way the server does: validated first, engine object forwarded. */
function drive(actor: Actor, seat: number, action: QuiztopiaAction): void {
  const raw = JSON.parse(JSON.stringify({ type: "PLAYER_ACTION", action }));
  const v = quiztopiaSpec.validateAction(actor.getSnapshot(), seat, raw);
  if (!v.ok) throw new Error(`rejected ${action.kind} for seat ${seat}: ${v.reason}`);
  actor.send(v.event);
}

describe("quiztopiaMachine — START", () => {
  it("boots idle with no game", () => {
    const { actor } = boot();
    const snap = actor.getSnapshot();
    expect(snap.value).toBe("idle");
    expect(snap.context.gameState).toBeNull();
    expect(quiztopiaSpec.getActivePlayer(snap)).toBe(0);
    expect(quiztopiaSpec.getResult(snap)).toBeNull();
    expect(quiztopiaSpec.getReplayLog?.(snap)).toBeNull();
    expect(quiztopiaSpec.isGameOver(snap)).toBe(false);
    expect(quiztopiaSpec.getLegalActions(snap, 0)).toEqual([]);
    expect(() => quiztopiaSpec.getPlayerView(snap, 0)).toThrow(/before/);
    actor.stop();
  });

  it.each([
    ["0 players", { playerCount: 0 }],
    ["7 players", { playerCount: 7 }],
    ["9999 players", { playerCount: 9999 }],
    ["a seat list of the wrong length", { playerCount: 2, seats: [0, 1, 2] }],
    ["duplicate seats", { playerCount: 2, seats: [1, 1] }],
    ["a seat out of range", { playerCount: 2, seats: [0, 6] }],
    ["a difficulty out of range", { playerCount: 2, difficulty: 4 }],
    ["an unknown deck", { playerCount: 2, deck: "bonus" }],
  ])("ignores START with %s", (_label, config) => {
    const { actor, errors } = boot();
    actor.send({ type: "START", ...(config as QuiztopiaStartConfigInput) });
    expect(actor.getSnapshot().value).toBe("idle");
    expect(actor.getSnapshot().context.gameState).toBeNull();
    expect(errors).toEqual([]);
    actor.stop();
  });

  it("ignores START when the source cannot deal 24 cards", () => {
    setQuestionSource(createFixtureQuestionSource(10));
    try {
      const { actor } = boot();
      start(actor, { playerCount: 2, seed: 1 });
      expect(actor.getSnapshot().value).toBe("idle");
      actor.stop();
    } finally {
      setQuestionSource(createFixtureQuestionSource());
    }
  });

  it("starts a valid game and captures the source", () => {
    const { actor } = boot();
    start(actor, { playerCount: 3, seats: [0, 2, 4], difficulty: 1, expert: true, seed: 5 });
    const snap = actor.getSnapshot();
    expect(snap.matches({ active: "chooseBuilding" })).toBe(true);
    expect(snap.context.source).not.toBeNull();
    const gs = snap.context.gameState;
    expect(gs).toMatchObject({
      playerCount: 3,
      seats: [0, 2, 4],
      difficulty: 1,
      expert: true,
      seed: 5,
      phase: "choose-building",
    });
    expect(quiztopiaSpec.getActivePlayer(snap)).toBe(-1);
    expect(quiztopiaSpec.getResult(snap)).toBeNull();
    expect(quiztopiaSpec.getReplayLog?.(snap)).toBeNull();
    expect(quiztopiaSpec.getPlayerView(snap, 2).you).toBe(2);
    expect(quiztopiaSpec.getLegalActions(snap, 0)).toHaveLength(12);
    expect(quiztopiaSpec.getLegalActions(snap, 1)).toEqual([]);
    actor.stop();
  });

  it("draws a random seed when none is given", () => {
    const { actor } = boot();
    start(actor, { playerCount: 2 });
    expect(typeof actor.getSnapshot().context.gameState?.seed).toBe("number");
    actor.stop();
  });

  it("keeps the running game when a swapped source disappears", () => {
    const { actor } = boot();
    start(actor, { playerCount: 2, seed: 1 });
    setQuestionSource(null);
    try {
      drive(actor, 0, { kind: "choose-building", buildingIndex: 0 });
      expect(actor.getSnapshot().context.gameState?.turn.question).not.toBeNull();
    } finally {
      setQuestionSource(createFixtureQuestionSource());
    }
    actor.stop();
  });
});

describe("quiztopiaMachine — validateAction", () => {
  it("rejects malformed envelopes, smuggled events and other seats' moves", () => {
    const { actor } = boot();
    start(actor, { playerCount: 2, seed: 1 });
    const snap = actor.getSnapshot();
    expect(quiztopiaSpec.validateAction(snap, 0, null).ok).toBe(false);
    expect(quiztopiaSpec.validateAction(snap, 0, { type: "START", playerCount: 9999 }).ok).toBe(
      false,
    );
    expect(quiztopiaSpec.validateAction(snap, 0, { type: "RESET" }).ok).toBe(false);
    expect(quiztopiaSpec.validateAction(snap, 0, { type: "PLAYER_ACTION" }).ok).toBe(false);
    const pick = { type: "PLAYER_ACTION", action: { kind: "choose-building", buildingIndex: 0 } };
    expect(quiztopiaSpec.validateAction(snap, 1, pick).ok).toBe(false);
    expect(quiztopiaSpec.validateAction(snap, 999, pick).ok).toBe(false);
    const ok = quiztopiaSpec.validateAction(snap, 0, pick);
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.event).toEqual({ type: "PLAYER_ACTION", player: 0, action: pick.action });
    const smuggled = {
      type: "PLAYER_ACTION",
      action: { kind: "choose-building", buildingIndex: 0, extra: 1 },
    };
    expect(quiztopiaSpec.validateAction(snap, 0, smuggled).ok).toBe(false);
    actor.stop();
  });

  it("an illegal event sent straight to the actor changes nothing and kills nothing", () => {
    const { actor, errors } = boot();
    start(actor, { playerCount: 2, seed: 1 });
    const before = actor.getSnapshot().context.gameState;
    actor.send({ type: "PLAYER_ACTION", player: 1, action: { kind: "reveal" } });
    expect(actor.getSnapshot().context.gameState).toBe(before);
    expect(actor.getSnapshot().matches({ active: "chooseBuilding" })).toBe(true);
    expect(errors).toEqual([]);
    expect(actor.getSnapshot().status).toBe("active");
    actor.stop();
  });
});

describe("quiztopiaMachine — a full game", () => {
  it("plays to the bakery offer, declines and persists a p0 win", () => {
    const { actor, errors } = boot();
    start(actor, { playerCount: 2, difficulty: 0, seed: 3 });
    let guard = 0;
    while (!quiztopiaSpec.isGameOver(actor.getSnapshot())) {
      const snap = actor.getSnapshot();
      const gs = snap.context.gameState;
      if (!gs) throw new Error("no game");
      const seat = gs.turn.activeSeat;
      const legal = quiztopiaSpec.getLegalActions(snap, seat);
      const pick =
        legal.find(
          (a) => a.kind === "choose-building" && gs.buildings[a.buildingIndex] === "bright",
        ) ??
        legal.find((a) => a.kind === "choose-building") ??
        legal.find((a) => a.kind === "reveal") ??
        legal.find((a) => a.kind === "judge" && a.correct) ??
        legal.find((a) => a.kind === "bakery" && !a.accept);
      if (!pick) throw new Error(`nothing to do in ${gs.phase}`);
      expect(quiztopiaSpec.getActivePlayer(snap)).toBe(-1);
      drive(actor, seat, pick);
      if (++guard > 200) throw new Error("did not finish");
    }
    const snap = actor.getSnapshot();
    expect(snap.value).toBe("gameOver");
    expect(errors).toEqual([]);
    const result = quiztopiaSpec.getResult(snap);
    expect(result).toMatchObject({
      outcome: "win",
      won: 8,
      lost: 0,
      bakery: false,
      questionsAsked: 8,
    });
    const replay = quiztopiaSpec.getReplayLog?.(snap);
    expect(replay).toMatchObject({ slug: "quiztopia", scoreA: 8, scoreB: 0, playerCount: 2 });
    expect(quiztopiaSpec.getLegalActions(snap, 0)).toEqual([]);
    expect(quiztopiaSpec.getPlayerView(snap, 1).outcome).toBe("win");
    actor.stop();
  });

  it("restarts from active and from gameOver, and RESET returns to idle", () => {
    const { actor } = boot();
    start(actor, { playerCount: 2, seed: 1 });
    drive(actor, 0, { kind: "choose-building", buildingIndex: 0 });
    expect(actor.getSnapshot().matches({ active: "question" })).toBe(true);

    start(actor, { playerCount: 3, seed: 2 });
    let snap = actor.getSnapshot();
    expect(snap.matches({ active: "chooseBuilding" })).toBe(true);
    expect(snap.context.gameState).toMatchObject({
      playerCount: 3,
      seed: 2,
      phase: "choose-building",
    });
    expect(snap.context.gameState?.turn.index).toBe(1);

    // An invalid restart mid-game is ignored outright.
    actor.send({ type: "START", playerCount: 9 });
    expect(actor.getSnapshot().context.gameState?.seed).toBe(2);

    actor.send({ type: "RESET" });
    snap = actor.getSnapshot();
    expect(snap.value).toBe("idle");
    expect(snap.context.gameState).toBeNull();
    expect(quiztopiaSpec.getActivePlayer(snap)).toBe(0);

    start(actor, { playerCount: 1, seed: 4 });
    expect(actor.getSnapshot().matches({ active: "chooseBuilding" })).toBe(true);
    actor.stop();
  });
});

describe("quiztopiaMachine — random play through the validator", () => {
  const configs: QuiztopiaStartConfigInput[] = [
    { playerCount: 1, difficulty: 0 },
    { playerCount: 2, expert: true, difficulty: 3 },
    { playerCount: 4, seats: [1, 3, 4, 5], difficulty: 1 },
    { playerCount: 6, expert: true, difficulty: 2, deck: "extended" },
  ];

  it.each(configs)("never throws, accepts every enumerated action and ends for %o", (config) => {
    for (let seed = 1; seed <= 5; seed++) {
      const rng = createRng(seed * 104729 + (config.playerCount ?? 0));
      const { actor, errors } = boot();
      start(actor, { ...config, seed });
      let steps = 0;
      while (!quiztopiaSpec.isGameOver(actor.getSnapshot())) {
        const snap = actor.getSnapshot();
        const gs = snap.context.gameState;
        if (!gs) throw new Error("no game");
        const options: { seat: number; action: QuiztopiaAction }[] = [];
        for (const seat of gs.seats) {
          for (const action of getLegalActions(gs, seat)) {
            const raw = JSON.parse(JSON.stringify({ type: "PLAYER_ACTION", action }));
            expect(quiztopiaSpec.validateAction(snap, seat, raw).ok).toBe(true);
            options.push({ seat, action });
          }
        }
        expect(options.length).toBeGreaterThan(0);
        const pick = options[Math.floor(rng() * options.length)];
        drive(actor, pick.seat, pick.action);
        expect(actor.getSnapshot().status).toBe("active");
        if (++steps > 5000) throw new Error("random game did not end");
      }
      expect(errors).toEqual([]);
      const snap = actor.getSnapshot();
      const replay = quiztopiaSpec.getReplayLog?.(snap) as {
        scoreA: number;
        scoreB: number;
      } | null;
      expect(replay).not.toBeNull();
      if (replay) expect(replay.scoreA + replay.scoreB).toBeLessThanOrEqual(12);
      expect(quiztopiaSpec.getResult(snap)?.outcome).toBeTruthy();
      actor.stop();
    }
  });
});
