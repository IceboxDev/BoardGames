import { afterEach, describe, expect, it, vi } from "vitest";
import { type ActorRefFrom, createActor, waitFor } from "xstate";
import { duetMachine, duetPhaseOf, duetSpec } from "./machine";
import { HANDOVER_AFTER_MS, handOver, handOverProblem, markAway, markBack } from "./presence";
import { createDuet } from "./rules";
import type { DuetState } from "./types";

function game(timer = 0): DuetState {
  return createDuet({
    seed: 7,
    ai: [null, null],
    language: "en",
    timerTokens: 9,
    clueTimerSec: timer,
    guessTimerSec: 0,
  });
}

describe("duet presence rules", () => {
  it("only the partner may hand the seat over, and only after the wait", () => {
    const state = markAway(game(), 0, 0);
    expect(handOverProblem(state, 1, 0, HANDOVER_AFTER_MS - 1)).toMatch(/more to come back/);
    expect(handOverProblem(state, 0, 0, HANDOVER_AFTER_MS)).not.toBeNull();
    expect(handOverProblem(state, 1, 0, HANDOVER_AFTER_MS)).toBeNull();
    const handed = handOver(state, 0);
    expect(handed.ai[0]).toBe("codenames-expert");
    expect(handOverProblem(handed, 1, 0, HANDOVER_AFTER_MS)).toMatch(/already/);
  });

  it("handing over the seat being waited on stops its clock", () => {
    const state = { ...markAway(game(60), 0, 0), deadlineTs: 123 };
    const waited = state.giver;
    expect(handOver(state, waited).deadlineTs).toBeNull();
    expect(handOver(state, 1 - waited).deadlineTs).toBe(123);
  });

  it("the person takes the seat back at once — unless the stand-in is mid-move", () => {
    const handed = handOver(markAway(game(), 1, 0), 1);
    expect(markBack(handed, 1).ai[1]).toBeNull();
    const busy = markBack({ ...handed, aiThinking: 1 }, 1);
    expect(busy.ai[1]).toBe("codenames-expert");
    expect(busy.reclaims).toEqual([1]);
  });
});

type Actor = ActorRefFrom<typeof duetMachine>;

function start(): Actor {
  const actor = createActor(duetMachine);
  actor.start();
  actor.send({
    type: "START",
    seed: 3,
    ai: [null, null],
    language: "en",
    timerTokens: 9,
    clueTimerSec: 0,
    guessTimerSec: 0,
    beats: { aiStart: 1, aiGuess: 1 },
  });
  return actor;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("duet presence in the machine", () => {
  it("a partner gone past the wait is handed to the AI, which plays their clue", async () => {
    const actor = start();
    const giver = actor.getSnapshot().context.game.giver;
    const partner = 1 - giver;
    const now = Date.now();
    actor.send({ type: "SEAT_CONNECTION", seat: giver, connected: false });
    const seen = duetSpec.getPlayerView(actor.getSnapshot(), partner).seats[giver];
    expect(seen.awaySince).not.toBeNull();
    expect(seen.handoverAt).toBe((seen.awaySince ?? 0) + HANDOVER_AFTER_MS);
    vi.spyOn(Date, "now").mockReturnValue(now + HANDOVER_AFTER_MS + 1000);

    const validated = duetSpec.validateAction(actor.getSnapshot(), partner, {
      type: "PLAYER_ACTION",
      action: { kind: "hand-over", seat: giver },
    });
    expect(validated.ok).toBe(true);
    if (validated.ok) actor.send(validated.event);
    expect(actor.getSnapshot().context.game.aiThinking).toBe(giver);

    // Back while the stand-in still weighs the clue: the seat returns after it.
    actor.send({ type: "SEAT_CONNECTION", seat: giver, connected: true });
    expect(duetSpec.getPlayerView(actor.getSnapshot(), partner).seats[giver]).toMatchObject({
      standIn: true,
      returning: true,
    });
    await waitFor(actor, (s) => duetPhaseOf(s) === "guessing");
    const state = actor.getSnapshot().context.game;
    expect(state.ai[giver]).toBeNull();
    expect(state.standIns).toEqual([]);
    expect(duetSpec.getPlayerView(actor.getSnapshot(), partner).clue).not.toBeNull();
  });

  it("a hand-over is refused before the wait", () => {
    const actor = start();
    const giver = actor.getSnapshot().context.game.giver;
    actor.send({ type: "SEAT_CONNECTION", seat: giver, connected: false });
    const early = duetSpec.validateAction(actor.getSnapshot(), 1 - giver, {
      type: "PLAYER_ACTION",
      action: { kind: "hand-over", seat: giver },
    });
    expect(early.ok).toBe(false);
    expect(actor.getSnapshot().context.game.standIns).toEqual([]);
  });
});
