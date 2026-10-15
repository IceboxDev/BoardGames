import { afterEach, describe, expect, it, vi } from "vitest";
import { type ActorRefFrom, createActor, waitFor } from "xstate";
import { codenamesMachine, codenamesSpec, phaseOf } from "./machine";
import {
  HANDOVER_AFTER_MS,
  handOver,
  handOverProblem,
  markAway,
  markBack,
  standInTier,
} from "./presence";
import { createGame } from "./rules";
import type { CodenamesState } from "./types";

const AI = "codenames-medium";

function game(ai: (string | null)[] = [null, null, null, null]): CodenamesState {
  return createGame({ seed: 7, ai, language: "en", clueTimerSec: 0, guessTimerSec: 0 });
}

describe("presence rules", () => {
  it("a person goes away and comes back; AI seats can't", () => {
    let state = markAway(game([null, AI, null, AI]), 0, 1000);
    expect(state.away).toEqual([{ seat: 0, since: 1000 }]);
    expect(markAway(state, 1, 1000).away).toHaveLength(1);
    expect(markAway(state, 0, 5000).away).toEqual([{ seat: 0, since: 1000 }]);
    state = markBack(state, 0);
    expect(state.away).toEqual([]);
  });

  it("the seat can be handed over only after the wait, by someone else at the table", () => {
    const state = markAway(game([null, AI, null, AI]), 0, 0);
    expect(handOverProblem(state, 2, 0, HANDOVER_AFTER_MS - 1)).toMatch(/more to come back/);
    expect(handOverProblem(state, 0, 0, HANDOVER_AFTER_MS)).not.toBeNull();
    expect(handOverProblem(state, 1, 0, HANDOVER_AFTER_MS)).toMatch(/person/);
    expect(handOverProblem(state, 2, 2, HANDOVER_AFTER_MS)).not.toBeNull();
    expect(handOverProblem(state, 2, 0, HANDOVER_AFTER_MS)).toBeNull();
    const handed = handOver(state, 0);
    expect(handed.ai[0]).toBe(AI); // the table's own level
    expect(handOverProblem(handed, 2, 0, HANDOVER_AFTER_MS)).toMatch(/already/);
  });

  it("a stand-in plays at the default level at an all-human table", () => {
    expect(standInTier(game())).toBe("codenames-expert");
  });

  it("the person takes the seat back at once — unless the stand-in is mid-move", () => {
    const handed = handOver(markAway(game(), 2, 0), 2);
    expect(markBack(handed, 2).ai[2]).toBeNull();
    const busy = markBack({ ...handed, aiThinking: 2 }, 2);
    expect(busy.ai[2]).toBe("codenames-expert");
    expect(busy.reclaims).toEqual([2]);
    expect(busy.away).toEqual([]);
  });
});

type Actor = ActorRefFrom<typeof codenamesMachine>;

function start(ai: (string | null)[]): Actor {
  const actor = createActor(codenamesMachine);
  actor.start();
  actor.send({
    type: "START",
    seed: 99,
    ai,
    language: "en",
    clueTimerSec: 0,
    guessTimerSec: 0,
    beats: { aiStart: 1, aiGuess: 1 },
  });
  return actor;
}

/** The person leaves, and the clock moves past the hand-over wait. */
function goneLongAgo(actor: Actor, seat: number): void {
  const now = Date.now();
  actor.send({ type: "SEAT_CONNECTION", seat, connected: false });
  vi.spyOn(Date, "now").mockReturnValue(now + HANDOVER_AFTER_MS + 1000);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("presence in the machine", () => {
  it("handing over the spymaster everyone waits on lets the AI give the clue", async () => {
    const team = start([null, null, null, null]).getSnapshot().context.game.currentTeam;
    const actor = start([null, null, null, null]);
    goneLongAgo(actor, team);
    const other = 2 + team;
    const seen = codenamesSpec.getPlayerView(actor.getSnapshot(), other).seats[team];
    expect(seen?.standIn).toBe(false);
    expect(seen?.handoverAt).toBe((seen?.awaySince ?? 0) + HANDOVER_AFTER_MS);
    const validated = codenamesSpec.validateAction(actor.getSnapshot(), other, {
      type: "PLAYER_ACTION",
      action: { kind: "hand-over", seat: team },
    });
    expect(validated.ok).toBe(true);
    if (validated.ok) actor.send(validated.event);
    await waitFor(actor, (s) => phaseOf(s) === "guessing", { timeout: 2000 });
    const view = codenamesSpec.getPlayerView(actor.getSnapshot(), other);
    expect(view.seats[team]).toMatchObject({ standIn: true, ai: true });
    expect(view.clue).not.toBeNull();
  });

  it("a person back mid-move gets the seat when the move is done; replays keep them human", async () => {
    const actor = start([null, null, null, null]);
    const team = actor.getSnapshot().context.game.currentTeam;
    goneLongAgo(actor, team);
    const validated = codenamesSpec.validateAction(actor.getSnapshot(), 2 + team, {
      type: "PLAYER_ACTION",
      action: { kind: "hand-over", seat: team },
    });
    if (validated.ok) actor.send(validated.event);
    // Back while the stand-in is still weighing its clue.
    expect(actor.getSnapshot().context.game.aiThinking).toBe(team);
    actor.send({ type: "SEAT_CONNECTION", seat: team, connected: true });
    expect(actor.getSnapshot().context.game.reclaims).toEqual([team]);
    await waitFor(actor, (s) => phaseOf(s) === "guessing", { timeout: 2000 });
    const game = actor.getSnapshot().context.game;
    expect(game.ai[team]).toBeNull();
    expect(game.standIns).toEqual([]);
  });
});
