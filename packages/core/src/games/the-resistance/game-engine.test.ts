import { describe, expect, it } from "vitest";
import { createRng } from "../../lib/rng";
import { decideAction } from "./ai-strategies";
import { applyAction, createInitialState, getLegalActions, pendingSeats } from "./game-engine";
import { buildPlayerView } from "./player-view";
import { ResistanceReplayLogSchema } from "./record";
import { failsNeeded, openMissions, spyCount, tablePosition, teamSize } from "./rules";
import type { AIStrategyId, GameState } from "./types";

function start(n: number, seed = 1, strategies?: (AIStrategyId | null)[]) {
  return createInitialState({
    playerCount: n,
    strategies: strategies ?? Array(n).fill("analyst"),
    variants: { targeting: false, blindSpies: false },
    seed,
  });
}

/** Every seat played by a bot through its own view, to the end. */
function playOut(state: GameState, seed: number): GameState {
  const rng = createRng(seed);
  let gs = state;
  for (let guard = 0; guard < 500 && gs.phase !== "game-over"; guard++) {
    const seats = gs.phase === "proposing" ? [tablePosition(gs.record).leader] : pendingSeats(gs);
    const seat = seats[0];
    if (seat === undefined) throw new Error(`Stuck in ${gs.phase}`);
    const strategy = gs.strategies[seat] ?? "random";
    const action = decideAction(
      strategy,
      buildPlayerView(gs, seat),
      getLegalActions(gs, seat),
      rng,
    );
    gs = applyAction(gs, seat, action);
  }
  return gs;
}

describe("tables", () => {
  it("matches the rulebook", () => {
    expect([5, 6, 7, 8, 9, 10].map(spyCount)).toEqual([2, 2, 3, 3, 3, 4]);
    expect([0, 1, 2, 3, 4].map((m) => teamSize(5, m))).toEqual([2, 3, 2, 3, 3]);
    expect([0, 1, 2, 3, 4].map((m) => teamSize(8, m))).toEqual([3, 4, 4, 5, 5]);
    expect(failsNeeded(6, 3)).toBe(1);
    expect(failsNeeded(7, 3)).toBe(2);
    expect(failsNeeded(7, 2)).toBe(1);
  });

  it("locks mission 5 under Targeting until two successes", () => {
    expect(openMissions([null, null, null, null, null], 0, true)).toEqual([0, 1, 2, 3]);
    expect(openMissions([true, true, null, null, null], 2, true)).toEqual([2, 3, 4]);
    expect(openMissions([true, null, null, null, null], 1, false)).toEqual([1]);
  });
});

describe("engine", () => {
  it("deals the right number of spies", () => {
    for (const n of [5, 7, 10]) {
      expect(start(n).record.roles.filter((r) => r === "spy")).toHaveLength(spyCount(n));
    }
  });

  it("never offers a Resistance operative a Fail", () => {
    let gs = start(5, 3);
    const leader = tablePosition(gs.record).leader;
    const team = [0, 1, 2, 3, 4].slice(0, 2);
    gs = applyAction(gs, leader, { type: "propose", mission: 0, team });
    for (let s = 0; s < 5; s++) gs = applyAction(gs, s, { type: "vote", approve: true });
    expect(gs.phase).toBe("mission");
    for (const seat of team) {
      const cards = getLegalActions(gs, seat).map((a) => (a.type === "play" ? a.card : null));
      expect(cards.includes("fail")).toBe(gs.record.roles[seat] === "spy");
    }
  });

  it("gives the Spies the game on the fifth rejection", () => {
    let gs = start(5, 4);
    for (let i = 0; i < 5; i++) {
      const leader = tablePosition(gs.record).leader;
      gs = applyAction(gs, leader, { type: "propose", mission: 0, team: [0, 1] });
      for (let s = 0; s < 5; s++) gs = applyAction(gs, s, { type: "vote", approve: false });
    }
    expect(gs.phase).toBe("game-over");
    expect(gs.record.winner).toBe("spy");
    expect(gs.record.winReason).toBe("five-rejections");
  });

  it("rejects on a tie and passes the lead clockwise", () => {
    let gs = start(6, 5);
    const leader = tablePosition(gs.record).leader;
    gs = applyAction(gs, leader, { type: "propose", mission: 0, team: [0, 1] });
    for (let s = 0; s < 6; s++) gs = applyAction(gs, s, { type: "vote", approve: s < 3 });
    expect(gs.phase).toBe("proposing");
    expect(tablePosition(gs.record).leader).toBe((leader + 1) % 6);
    expect(tablePosition(gs.record).rejections).toBe(1);
  });

  it("plays whole bot games to a legal end at every table size", () => {
    for (const n of [5, 6, 7, 8, 9, 10]) {
      for (let seed = 1; seed <= 2; seed++) {
        const end = playOut(start(n, seed), seed);
        expect(end.phase).toBe("game-over");
        expect(
          ResistanceReplayLogSchema.safeParse({ formatVersion: 1, seed, ...end.record }).success,
        ).toBe(true);
      }
    }
  }, 60_000);
});

describe("player view", () => {
  it("shows roles and cards to nobody until the game ends", () => {
    let gs = start(7, 9);
    const leader = tablePosition(gs.record).leader;
    gs = applyAction(gs, leader, { type: "propose", mission: 0, team: [0, 1] });
    for (let s = 0; s < 7; s++) gs = applyAction(gs, s, { type: "vote", approve: true });
    gs = applyAction(gs, 0, { type: "play", card: "success" });
    gs = applyAction(gs, 1, { type: "play", card: "success" });
    for (let seat = -1; seat < 7; seat++) {
      const view = buildPlayerView(gs, seat);
      expect(view.record.roles).toBeNull();
      expect(view.record.rounds[0]?.result?.cards).toBeUndefined();
      expect(JSON.stringify(view)).not.toContain('"cards"');
    }
  });

  it("tells spies about each other, except under Blind Spies", () => {
    const gs = start(8, 11);
    const spies = gs.record.roles.flatMap((r, i) => (r === "spy" ? [i] : []));
    const resistance = gs.record.roles.indexOf("resistance");
    expect(buildPlayerView(gs, spies[0] ?? 0).knownSpies).toEqual(spies);
    expect(buildPlayerView(gs, resistance).knownSpies).toEqual([]);
    const blind = {
      ...gs,
      record: { ...gs.record, variants: { targeting: false, blindSpies: true } },
    };
    expect(buildPlayerView(blind, spies[0] ?? 0).knownSpies).toEqual([spies[0]]);
  });
});
