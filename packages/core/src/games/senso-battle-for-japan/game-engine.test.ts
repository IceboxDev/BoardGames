import { describe, expect, it } from "vitest";
import { pickAiAction } from "./ai-strategies";
import { cubesOnMap, isContiguous } from "./board";
import {
  applyAction,
  applyActionPure,
  buildBonusQueue,
  buildRewardQueue,
  createInitialState,
  settleTrick,
  startRound,
} from "./game-engine";
import { cardsPerRound } from "./map";
import { getActivePlayer, getLegalActions } from "./rules";
import { baseState, lettersFromBoard, setBoard, setFactions } from "./test-helpers";
import type { AIStrategyId, GameState } from "./types";

function assertInvariants(state: GameState, where: string): void {
  state.board.forEach((squares, r) => {
    expect(isContiguous(squares), `${where}: region ${r + 1} has a hole`).toBe(true);
  });
  for (const clan of state.seatedClans) {
    expect(cubesOnMap(state.board, clan) + state.supply[clan], `${where}: ${clan} cubes`).toBe(8);
  }
}

function playOut(state: GameState, strategies: (AIStrategyId | null)[]): void {
  let steps = 0;
  while (state.phase !== "game-over" && steps < 6000) {
    if (state.phase === "trick-settle") settleTrick(state);
    else {
      const seat = getActivePlayer(state);
      applyAction(state, pickAiAction(state, seat, strategies[seat] ?? "random"));
    }
    assertInvariants(state, `step ${steps}`);
    steps++;
  }
  expect(state.phase).toBe("game-over");
}

describe("setup", () => {
  it("places the Game Setup cubes and derives the supply (unseated clans get none)", () => {
    const four = setFactions(baseState(4), ["takeda", "uesugi", "oda", "mori"]);
    expect(four.supply).toEqual({ takeda: 5, uesugi: 5, oda: 4, mori: 5 });
    expect(lettersFromBoard(four.board)).toEqual([
      "m..",
      "m.",
      "m.",
      ".",
      "o..",
      "oo",
      "tto",
      ".",
      "utu",
      "u..",
    ]);
    const two = setFactions(baseState(2), ["oda", "mori"]);
    expect(two.supply).toEqual({ takeda: 0, uesugi: 0, oda: 4, mori: 5 });
    expect(two.emperorSeat).toBeNull();
  });

  it("seats exactly one Emperor in a 5-player game and none otherwise", () => {
    for (let seed = 0; seed < 10; seed++) {
      const five = createInitialState(5, [null, null, null, null, null], seed);
      expect(five.players.filter((p) => p.clan === null)).toHaveLength(1);
      expect(five.emperorSeat).toBe(five.players.findIndex((p) => p.clan === null));
      const four = createInitialState(4, [null, null, null, null], seed);
      expect(four.players.every((p) => p.clan !== null)).toBe(true);
      expect(new Set(four.players.map((p) => p.clan)).size).toBe(4);
    }
  });

  it("rejects bad player counts and mismatched strategy lists", () => {
    expect(() => createInitialState(1, [null], 1)).toThrow();
    expect(() => createInitialState(6, [null, null, null, null, null, null], 1)).toThrow();
    expect(() => createInitialState(3, [null, null], 1)).toThrow();
  });

  it("is deterministic for a seed", () => {
    const a = createInitialState(4, [null, "random", null, "random"], 77);
    const b = createInitialState(4, [null, "random", null, "random"], 77);
    expect(a.players.map((p) => p.hand)).toEqual(b.players.map((p) => p.hand));
    expect(a.players.map((p) => p.clan)).toEqual(b.players.map((p) => p.clan));
    expect(a.advantageRow).toEqual(b.advantageRow);
  });
});

describe("deals and the advantage row", () => {
  it("deals the rulebook hand sizes with disjoint hands, capped at 10 for five players", () => {
    for (const n of [2, 3, 4, 5]) {
      const state = baseState(n, 5);
      for (let round = 1; round <= 8; round++) {
        startRound(state, round);
        const expected = cardsPerRound(n, round);
        expect(expected).toBe(n === 5 && round > 5 ? 10 : 5 + round);
        const all = state.players.flatMap((p) => p.hand);
        expect(all).toHaveLength(n * expected);
        expect(new Set(all).size).toBe(all.length);
        expect(state.trumpSuit).toBe(state.advantageRow[(round - 1) % 4]);
      }
    }
  });

  it("uses one face-up row for rounds 1–4 and a fresh one from round 5, never before", () => {
    const state = baseState(3, 11);
    const first = [...state.advantageRow];
    expect(state.log.filter((e) => e.kind === "advantage-row")).toHaveLength(1);
    for (let round = 2; round <= 4; round++) {
      startRound(state, round);
      expect(state.advantageRow).toEqual(first);
    }
    expect(JSON.stringify(state)).not.toContain('"half":2');
    startRound(state, 5);
    const second = state.advantageRow;
    expect(second).toHaveLength(4);
    expect(new Set(second).size).toBe(4);
    expect(state.log.filter((e) => e.kind === "advantage-row")).toHaveLength(2);
    // Independent of the first row and not simply the first row again (seed 11 differs).
    expect(second).not.toEqual(first);
    for (let round = 6; round <= 8; round++) {
      startRound(state, round);
      expect(state.advantageRow).toEqual(second);
      expect(state.trumpSuit).toBe(second[(round - 1) % 4]);
    }
  });

  it("rotates the First Player clockwise each round", () => {
    const state = baseState(3, 2);
    expect(state.firstPlayer).toBe(0);
    startRound(state, 2);
    expect(state.firstPlayer).toBe(1);
    expect(state.leader).toBe(1);
    expect(state.turn).toBe(1);
    startRound(state, 3);
    expect(state.firstPlayer).toBe(2);
    startRound(state, 4);
    expect(state.firstPlayer).toBe(0);
  });
});

describe("tricks", () => {
  it("resolves after every seat has played, holds the settle beat, then the winner leads", () => {
    const state = setFactions(baseState(2, 3), ["takeda", "uesugi"]);
    state.players[0].hand = ["takeda-5", "oda-3"];
    state.players[1].hand = ["takeda-9", "mori-2"];
    state.trumpSuit = "mori";
    state.turn = 0;
    state.leader = 0;
    applyAction(state, { type: "play", card: "takeda-5" });
    expect(state.leadSuit).toBe("takeda");
    expect(state.turn).toBe(1);
    // Must follow suit: mori-2 (the trump!) is not legal while holding takeda-9.
    expect(() => applyAction(state, { type: "play", card: "mori-2" })).toThrow();
    applyAction(state, { type: "play", card: "takeda-9" });
    expect(state.phase).toBe("trick-settle");
    expect(state.completedTrick?.winner).toBe(1);
    expect(getLegalActions(state)).toEqual([]);
    expect(getActivePlayer(state)).toBe(1);
    expect(() => applyAction(state, { type: "play", card: "oda-3" })).toThrow();

    settleTrick(state);
    expect(state.players[1].tricksWon).toBe(1);
    expect(state.phase).toBe("trick");
    expect(state.leader).toBe(1);
    expect(state.turn).toBe(1);
    expect(state.trickNumber).toBe(2);
    expect(state.lastTrick?.winner).toBe(1);
    expect(state.table).toEqual([]);
  });

  it("moves to rewards when the hands are empty", () => {
    const state = setFactions(baseState(2, 3), ["takeda", "uesugi"]);
    state.players[0].hand = ["takeda-5"];
    state.players[1].hand = ["ninja-jade"];
    state.players[0].tricksWon = 4;
    state.trumpSuit = "mori";
    applyAction(state, { type: "play", card: "takeda-5" });
    applyAction(state, { type: "play", card: "ninja-jade" });
    settleTrick(state);
    expect(state.phase).toBe("rewards");
    // 4 tricks (tier 3) beats 1 trick (tier 1).
    expect(state.rewardQueue.map((s) => [s.player, s.tier])).toEqual([
      [0, 3],
      [1, 1],
    ]);
  });
});

describe("reward queue order", () => {
  it("sorts by victories, ties clockwise from the seat left of the First Player", () => {
    const state = baseState(3, 4);
    state.firstPlayer = 1;
    state.players[0].tricksWon = 2;
    state.players[1].tricksWon = 2;
    state.players[2].tricksWon = 2;
    expect(buildRewardQueue(state).map((s) => s.player)).toEqual([2, 0, 1]);
    state.players[0].tricksWon = 1;
    state.players[1].tricksWon = 4;
    state.players[2].tricksWon = 2;
    expect(buildRewardQueue(state).map((s) => [s.player, s.tier, s.picksLeft])).toEqual([
      [1, 3, 1],
      [2, 1, 1],
      [0, 1, 1],
    ]);
    state.players[0].tricksWon = 0;
    state.players[1].tricksWon = 7;
    expect(buildRewardQueue(state).map((s) => [s.player, s.tier, s.picksLeft])).toEqual([
      [1, 7, 2],
      [2, 1, 1],
    ]);
  });
});

describe("reward effects", () => {
  function rewards(rows: string[], tier: 1 | 3 | 5 | 7 = 7): GameState {
    const state = setFactions(baseState(2, 6), ["takeda", "uesugi"]);
    setBoard(state, rows);
    state.round = 2;
    state.phase = "rewards";
    state.rewardQueue = [
      { player: 0, tier, picksLeft: tier === 7 ? 2 : 1, used: [] },
      { player: 1, tier: 1, picksLeft: 1, used: [] },
    ];
    return state;
  }

  it("balance-swap climbs one square", () => {
    const state = rewards(["ut.", "..", "..", ".", "...", "..", "...", ".", "...", "..."]);
    applyAction(state, { type: "balance-swap", region: 0, square: 1 });
    expect(lettersFromBoard(state.board)[0]).toBe("tu.");
    expect(state.affected).toEqual([{ region: 0, by: 0 }]);
    expect(state.rewardQueue[0]).toMatchObject({ player: 0, picksLeft: 1, used: ["balance"] });
  });

  it("balance-move compacts the source and lands on the highest empty square", () => {
    const state = rewards(["ut.", "u.", "..", ".", "...", "..", "...", ".", "...", "..."]);
    const supplyBefore = { ...state.supply };
    applyAction(state, { type: "balance-move", region: 0, square: 1, to: 1 });
    expect(lettersFromBoard(state.board).slice(0, 2)).toEqual(["u..", "ut"]);
    expect(state.supply).toEqual(supplyBefore);
    expect(state.affected).toEqual([{ region: 1, by: 0 }]);
  });

  it("balance-replace pushes out the lowest cube of a full neighbour and returns it to its owner", () => {
    const state = rewards(["t..", "uu", "..", ".", "...", "..", "...", ".", "...", "..."]);
    const uesugiSupply = state.supply.uesugi;
    applyAction(state, { type: "balance-replace", region: 0, square: 0, to: 1 });
    expect(lettersFromBoard(state.board).slice(0, 2)).toEqual(["...", "ut"]);
    expect(state.supply.uesugi).toBe(uesugiSupply + 1);
  });

  it("determination spends a supply cube on the highest empty square", () => {
    const state = rewards(["t..", "..", "..", ".", "...", "..", "...", ".", "...", "..."]);
    const before = state.supply.takeda;
    applyAction(state, { type: "determination", region: 0 });
    expect(lettersFromBoard(state.board)[0]).toBe("tt.");
    expect(state.supply.takeda).toBe(before - 1);
  });

  it("aggression replaces in place with supply, or lets the region close up without", () => {
    const state = rewards(["uut", "..", "..", ".", "...", "..", "...", ".", "...", "..."]);
    const uesugiSupply = state.supply.uesugi;
    applyAction(state, { type: "aggression", region: 0, square: 0 });
    expect(lettersFromBoard(state.board)[0]).toBe("tut");
    expect(state.supply.uesugi).toBe(uesugiSupply + 1);

    const noSupply = rewards(["uut", "tt", "tt", "t", "tt.", "..", "...", ".", "...", "..."], 5);
    expect(noSupply.supply.takeda).toBe(0);
    applyAction(noSupply, { type: "aggression", region: 0, square: 0 });
    expect(lettersFromBoard(noSupply.board)[0]).toBe("ut.");
    expect(noSupply.supply.uesugi).toBe(uesugiSupply + 1);
  });

  it("Focus takes two different kinds; passing ends the slot; the phase ends after the last slot", () => {
    const state = rewards(["ut.", "..", "..", ".", "...", "..", "...", ".", "...", "..."]);
    applyAction(state, { type: "balance-swap", region: 0, square: 1 });
    expect(getLegalActions(state).some((a) => a.type.startsWith("balance"))).toBe(false);
    applyAction(state, { type: "determination", region: 2 });
    expect(state.rewardQueue.map((s) => s.player)).toEqual([1]);
    // Seat 1 may not TARGET regions 0 and 2 (locked by seat 0); moving a cube
    // out of a locked region is still fine, so sources are not checked.
    const locked = new Set([0, 2]);
    for (const a of getLegalActions(state)) {
      if (a.type === "balance-move" || a.type === "balance-replace") {
        expect(locked.has(a.to)).toBe(false);
      } else if ("region" in a) {
        expect(locked.has(a.region)).toBe(false);
      }
    }
    applyAction(state, { type: "pass" });
    expect(state.phase).toBe("trick");
    expect(state.round).toBe(3);
    expect(state.affected).toEqual([]);
  });

  it("the Emperor acts as the clan named by `as`", () => {
    const state = setFactions(baseState(5, 8), [null, "takeda", "uesugi", "oda", "mori"]);
    setBoard(state, ["ut.", "..", "..", ".", "...", "..", "...", ".", "...", "..."]);
    state.round = 2;
    state.phase = "rewards";
    state.rewardQueue = [{ player: 0, tier: 5, picksLeft: 1, used: [] }];
    const oda = state.supply.oda;
    applyAction(state, { type: "determination", region: 1, as: "oda" });
    expect(lettersFromBoard(state.board)[1]).toBe("o.");
    expect(state.supply.oda).toBe(oda - 1);
    expect(state.log.find((e) => e.kind === "reward")).toMatchObject({
      kind: "reward",
      player: 0,
      action: { as: "oda" },
    });
  });

  it("the Emperor's Aggression removes the cube and closes the gap — it has no cube to put down", () => {
    const state = setFactions(baseState(5, 8), [null, "takeda", "uesugi", "oda", "mori"]);
    setBoard(state, ["uto", "..", "..", ".", "...", "..", "...", ".", "...", "..."]);
    state.round = 2;
    state.phase = "rewards";
    state.rewardQueue = [{ player: 0, tier: 5, picksLeft: 1, used: [] }];
    const takeda = state.supply.takeda;
    const supplyTotal = Object.values(state.supply).reduce((a, b) => a + b, 0);
    applyAction(state, { type: "aggression", region: 0, square: 1 });
    expect(lettersFromBoard(state.board)[0]).toBe("uo.");
    expect(state.supply.takeda).toBe(takeda + 1);
    expect(Object.values(state.supply).reduce((a, b) => a + b, 0)).toBe(supplyTotal + 1);
    const entry = state.log.find((e) => e.kind === "reward");
    expect(entry).toMatchObject({
      kind: "reward",
      player: 0,
      action: { type: "aggression", region: 0, square: 1 },
      effects: [{ kind: "removed", clan: "takeda", region: 0, square: 1 }],
    });
    if (entry?.kind === "reward") expect(entry.action.as).toBeUndefined();
  });

  it("rejects an Emperor strike that names a clan, and a clan seat's `as`", () => {
    const state = setFactions(baseState(5, 8), [null, "takeda", "uesugi", "oda", "mori"]);
    setBoard(state, ["uto", "..", "..", ".", "...", "..", "...", ".", "...", "..."]);
    state.phase = "rewards";
    state.rewardQueue = [{ player: 0, tier: 5, picksLeft: 1, used: [] }];
    expect(() =>
      applyAction(state, { type: "aggression", region: 0, square: 1, as: "oda" }),
    ).toThrow(/Illegal action/);
    state.rewardQueue = [{ player: 1, tier: 5, picksLeft: 1, used: [] }];
    expect(() => applyAction(state, { type: "determination", region: 1, as: "oda" })).toThrow(
      /Illegal action/,
    );
  });

  it("the Emperor pushes out a cube of the colour it is marching", () => {
    const state = setFactions(baseState(5, 8), [null, "takeda", "uesugi", "oda", "mori"]);
    setBoard(state, ["t..", "ut", "..", ".", "...", "..", "...", ".", "...", "..."]);
    state.phase = "rewards";
    state.rewardQueue = [{ player: 0, tier: 1, picksLeft: 1, used: [] }];
    const takeda = state.supply.takeda;
    applyAction(state, { type: "balance-replace", region: 0, square: 0, to: 1, as: "takeda" });
    expect(lettersFromBoard(state.board).slice(0, 2)).toEqual(["...", "ut"]);
    expect(state.supply.takeda).toBe(takeda + 1);
    expect(state.log.find((e) => e.kind === "reward")).toMatchObject({
      effects: [
        { kind: "removed", clan: "takeda", region: 1, square: 1 },
        { kind: "moved", clan: "takeda", region: 0, square: 0, toRegion: 1, toSquare: 1 },
      ],
    });
  });

  it("applyActionPure leaves the input untouched", () => {
    const state = rewards(["ut.", "..", "..", ".", "...", "..", "...", ".", "...", "..."]);
    const snapshot = JSON.stringify(state);
    const next = applyActionPure(state, { type: "balance-swap", region: 0, square: 1 });
    expect(JSON.stringify(state)).toBe(snapshot);
    expect(lettersFromBoard(next.board)[0]).toBe("tu.");
  });
});

describe("end of the 4th round", () => {
  it("offers one bonus cube clockwise from the First Player's left, skipping the Emperor and empty supplies", () => {
    const state = setFactions(baseState(5, 9), [null, "takeda", "uesugi", "oda", "mori"]);
    state.round = 4;
    state.firstPlayer = 2;
    state.supply.oda = 0;
    expect(buildBonusQueue(state)).toEqual([4, 1, 2]);

    state.phase = "rewards";
    state.rewardQueue = [{ player: 1, tier: 1, picksLeft: 1, used: [] }];
    applyAction(state, { type: "pass" });
    expect(state.phase).toBe("bonus");
    expect(getActivePlayer(state)).toBe(4);
    // Affected locks do not apply; region 4 (label) is free.
    applyAction(state, { type: "bonus-place", region: 3 });
    expect(lettersFromBoard(state.board)[3]).toBe("m");
    applyAction(state, { type: "pass" });
    applyAction(state, { type: "bonus-place", region: 0 });
    expect(state.phase).toBe("trick");
    expect(state.round).toBe(5);
    expect(state.firstPlayer).toBe(3);
    expect(state.log.filter((e) => e.kind === "bonus")).toHaveLength(2);
  });
});

describe("full games", () => {
  it.each([2, 3, 4, 5])("plays a %i-player game to the end with every invariant intact", (n) => {
    const strategies = (
      ["heuristic-v1", "aggressive", "random", "heuristic-v1", "random"] as const
    ).slice(0, n);
    const state = createInitialState(n, [...strategies], 100 + n);
    playOut(state, [...strategies]);
    expect(state.round).toBe(8);
    expect(state.result?.scores).toHaveLength(n);
    expect(state.result?.placements).toHaveLength(n);
    if (n === 5) {
      const emperorRewards = state.log.filter(
        (e) => e.kind === "reward" && e.player === state.emperorSeat,
      );
      for (const e of emperorRewards) {
        if (e.kind !== "reward") continue;
        if (e.action.type === "aggression") {
          expect(e.action.as).toBeUndefined();
          expect(e.effects.map((x) => x.kind)).toEqual(["removed"]);
        } else expect(e.action.as).toBeDefined();
      }
    }
  });

  it("is reproducible from the seed", () => {
    const strategies: AIStrategyId[] = ["heuristic-v1", "random", "aggressive"];
    const a = createInitialState(3, strategies, 2024);
    const b = createInitialState(3, strategies, 2024);
    playOut(a, strategies);
    playOut(b, strategies);
    expect(a.board).toEqual(b.board);
    expect(a.result).toEqual(b.result);
  });
});
