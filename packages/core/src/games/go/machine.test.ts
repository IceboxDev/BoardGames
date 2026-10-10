import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createActor } from "xstate";
import { GameOutcomeSchema } from "../../machines/outcome";
import type { StartSeat } from "../../machines/seats";
import { fromGtp } from "./coords";
import { goSpec } from "./machine";
import { type GoConfigInput, GoConfigSchema } from "./manifest";
import { GoReplayLogSchema } from "./replay-log";
import type { GoAction } from "./view";

const human: StartSeat = { kind: "human" };

function start(seats: StartSeat[], config: GoConfigInput = { size: 9 }) {
  const actor = createActor(goSpec.machine);
  actor.start();
  actor.send(goSpec.buildStart({ seats, config: GoConfigSchema.parse(config), seed: 7 }));
  return actor;
}

type Actor = ReturnType<typeof start>;

function act(actor: Actor, seat: number, action: GoAction) {
  const v = goSpec.validateAction(actor.getSnapshot(), seat, { type: "PLAYER_ACTION", action });
  if (!v.ok) throw new Error(v.reason);
  actor.send(v.event);
}

const pt = (v: string) => fromGtp(9, v) as number;

describe("go machine", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("two passes lead to scoring; both accepting counts the board", async () => {
    const a = start([human, human]);
    act(a, 0, { type: "play", point: pt("E5") });
    act(a, 1, { type: "pass" });
    act(a, 0, { type: "pass" });
    await vi.advanceTimersByTimeAsync(10);
    let view = goSpec.getPlayerView(a.getSnapshot(), 0);
    expect(view.scoring?.proposing).toBe(false);
    expect(goSpec.getActivePlayer(a.getSnapshot())).toBe(-1);
    const key = view.scoring?.key as string;
    act(a, 0, { type: "accept-score", key });
    act(a, 1, { type: "accept-score", key });
    expect(goSpec.isGameOver(a.getSnapshot())).toBe(true);
    view = goSpec.getPlayerView(a.getSnapshot(), 0);
    expect(view.result?.result).toBe("B+73.5");
    const outcome = GameOutcomeSchema.parse(goSpec.getOutcome(a.getSnapshot()));
    expect(outcome).toMatchObject({ kind: "ranked", placements: [1, 2] });
    expect(GoReplayLogSchema.parse(goSpec.getReplayLog(a.getSnapshot())).moves).toHaveLength(3);
  });

  it("a toggle clears acceptance and a stale accept is refused", async () => {
    const a = start([human, human]);
    act(a, 0, { type: "play", point: pt("E5") });
    act(a, 1, { type: "pass" });
    act(a, 0, { type: "pass" });
    await vi.advanceTimersByTimeAsync(10);
    const key = goSpec.getPlayerView(a.getSnapshot(), 0).scoring?.key as string;
    act(a, 0, { type: "accept-score", key });
    act(a, 1, { type: "toggle-dead", point: pt("E5") });
    const view = goSpec.getPlayerView(a.getSnapshot(), 0);
    expect(view.scoring?.accepted).toEqual([false, false]);
    expect(view.scoring?.dead).toEqual([pt("E5")]);
    expect(() => act(a, 1, { type: "accept-score", key })).toThrow();
  });

  it("lets the waiting side resign and answer a take-back", () => {
    const a = start([human, human]);
    act(a, 0, { type: "play", point: pt("E5") });
    act(a, 0, { type: "undo" });
    expect(goSpec.getPlayerView(a.getSnapshot(), 1).undoRequest).toEqual({ by: 0 });
    act(a, 1, { type: "undo-accept" });
    expect(goSpec.getPlayerView(a.getSnapshot(), 0).moves).toHaveLength(0);
    act(a, 1, { type: "resign" });
    expect(goSpec.getResult(a.getSnapshot())?.result).toBe("B+R");
  });

  it("takes back to the human's previous move against the AI", async () => {
    const a = start([human, { kind: "ai", strategy: "heuristic" }]);
    act(a, 0, { type: "play", point: pt("E5") });
    await vi.advanceTimersByTimeAsync(1000);
    expect(goSpec.getPlayerView(a.getSnapshot(), 0).moves).toHaveLength(2);
    act(a, 0, { type: "undo" });
    const view = goSpec.getPlayerView(a.getSnapshot(), 0);
    expect(view.moves).toHaveLength(0);
    expect(view.toMove).toBe(0);
  });

  it("flags a player whose clock runs out", async () => {
    const a = start([human, human], {
      size: 9,
      timeControl: { kind: "byoyomi", mainSec: 0, periods: 1, periodSec: 5 },
    });
    act(a, 0, { type: "play", point: pt("E5") });
    await vi.advanceTimersByTimeAsync(5_100);
    expect(goSpec.getResult(a.getSnapshot())?.result).toBe("B+T");
  });

  it("starts White first with handicap stones and half-point komi", () => {
    const a = start([human, human], { size: 19, handicap: 4 });
    const view = goSpec.getPlayerView(a.getSnapshot(), 1);
    expect(view.toMove).toBe(1);
    expect(view.komi).toBe(0.5);
    expect(view.handicapStones).toHaveLength(4);
  });
});
