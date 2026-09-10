import { describe, expect, it } from "vitest";
import {
  aggressionActions,
  balanceMoveActions,
  balanceReplaceActions,
  balanceSwapActions,
  canBalanceReplaceFrom,
  determinationActions,
  getLegalActions,
  kindsForTier,
  legalPlays,
  tierFor,
  trickWinner,
} from "./rules";
import { baseState, EMPTY_ROWS, setBoard, setFactions } from "./test-helpers";
import type { Action, GameState } from "./types";

function twoSeats(rows: string[] = EMPTY_ROWS): GameState {
  const state = setFactions(baseState(2), ["takeda", "uesugi"]);
  return setBoard(state, rows);
}

function rewardsFor(state: GameState, seat: number, tier: 1 | 3 | 5 | 7 = 5): GameState {
  state.phase = "rewards";
  state.rewardQueue = [{ player: seat, tier, picksLeft: tier === 7 ? 2 : 1, used: [] }];
  return state;
}

describe("legalPlays", () => {
  it("must follow the lead suit when holding it — a held Ninja is not legal", () => {
    expect(legalPlays(["takeda-5", "oda-9", "ninja-jade"], "takeda")).toEqual(["takeda-5"]);
  });

  it("is unconstrained when void in the lead suit or when a Ninja was led", () => {
    expect(legalPlays(["takeda-5", "oda-9", "ninja-jade"], "mori")).toHaveLength(3);
    expect(legalPlays(["takeda-5", "oda-9", "ninja-jade"], null)).toHaveLength(3);
  });
});

describe("trickWinner", () => {
  it("any Ninja wins; Jade beats Wood", () => {
    expect(
      trickWinner(
        [
          { seat: 0, card: "ninja-wood" },
          { seat: 1, card: "takeda-14" },
        ],
        "oda",
        null,
      ),
    ).toBe(0);
    expect(
      trickWinner(
        [
          { seat: 0, card: "ninja-wood" },
          { seat: 1, card: "ninja-jade" },
        ],
        "oda",
        null,
      ),
    ).toBe(1);
    expect(
      trickWinner(
        [
          { seat: 0, card: "oda-14" },
          { seat: 1, card: "ninja-wood" },
        ],
        "oda",
        "oda",
      ),
    ).toBe(1);
  });

  it("the lowest advantage card beats the lead-suit Ace; higher trump wins among trumps", () => {
    expect(
      trickWinner(
        [
          { seat: 0, card: "takeda-14" },
          { seat: 1, card: "oda-2" },
        ],
        "oda",
        "takeda",
      ),
    ).toBe(1);
    expect(
      trickWinner(
        [
          { seat: 0, card: "takeda-14" },
          { seat: 1, card: "oda-2" },
          { seat: 2, card: "oda-9" },
        ],
        "oda",
        "takeda",
      ),
    ).toBe(2);
  });

  it("without trump or Ninja the highest lead-suit card wins; off-suit cards are ignored", () => {
    expect(
      trickWinner(
        [
          { seat: 0, card: "takeda-3" },
          { seat: 1, card: "uesugi-13" },
        ],
        "mori",
        "takeda",
      ),
    ).toBe(0);
    expect(
      trickWinner(
        [
          { seat: 0, card: "takeda-3" },
          { seat: 1, card: "takeda-11" },
        ],
        "mori",
        "takeda",
      ),
    ).toBe(1);
  });
});

describe("reward tiers", () => {
  it("maps victories to tiers and kinds", () => {
    expect(tierFor(0)).toBeNull();
    expect(tierFor(1)).toBe(1);
    expect(tierFor(2)).toBe(1);
    expect(tierFor(3)).toBe(3);
    expect(tierFor(6)).toBe(5);
    expect(tierFor(9)).toBe(7);
    expect(kindsForTier(1)).toEqual(["balance"]);
    expect(kindsForTier(3)).toEqual(["balance", "determination"]);
    expect(kindsForTier(5)).toEqual(["balance", "determination", "aggression"]);
    expect(kindsForTier(7)).toEqual(["balance", "determination", "aggression"]);
  });
});

describe("reward enumerators", () => {
  it("balance-swap needs an opponent (or neutral) cube directly above an own cube", () => {
    const state = twoSeats(["ut.", "tu", "mt", ".", "...", "..", "...", ".", "...", "..."]);
    const swaps = balanceSwapActions(state, "takeda", 0);
    expect(swaps).toEqual([
      { type: "balance-swap", region: 0, square: 1 },
      { type: "balance-swap", region: 2, square: 1 },
    ]);
    // Uesugi is on top in region 0 but sits under Takeda in region 1: one climb.
    expect(balanceSwapActions(state, "uesugi", 1)).toEqual([
      { type: "balance-swap", region: 1, square: 1 },
    ]);
  });

  it("balance-move targets adjacent regions with an empty square", () => {
    const state = twoSeats(["t..", "uu", "..", ".", "...", "..", "...", ".", "...", "..."]);
    // Region 0 (label 1) is adjacent only to region 1 (label 2), which is full.
    expect(balanceMoveActions(state, "takeda", 0)).toEqual([]);
    state.board[1] = ["uesugi", null];
    expect(balanceMoveActions(state, "takeda", 0)).toEqual([
      { type: "balance-move", region: 0, square: 0, to: 1 },
    ]);
  });

  it("balance-replace exists only when every adjacent region is full, and hits the lowest square", () => {
    const state = twoSeats(["t..", "uu", "..", ".", "...", "..", "...", ".", "...", "..."]);
    expect(canBalanceReplaceFrom(state, 0)).toBe(true);
    expect(balanceReplaceActions(state, "takeda", 0)).toEqual([
      { type: "balance-replace", region: 0, square: 0, to: 1 },
    ]);
    // Lowest square of the target holds an own cube: no replacement.
    state.board[1] = ["uesugi", "takeda"];
    expect(balanceReplaceActions(state, "takeda", 0)).toEqual([]);
    // An empty square anywhere adjacent removes the fallback entirely.
    state.board[1] = ["uesugi", null];
    expect(canBalanceReplaceFrom(state, 0)).toBe(false);
    expect(balanceReplaceActions(state, "takeda", 0)).toEqual([]);
  });

  it("determination needs supply and an empty square", () => {
    const state = twoSeats(["ttt", "tt", "..", ".", "...", "..", "...", ".", "...", "..."]);
    expect(state.supply.takeda).toBe(3);
    const regions = determinationActions(state, "takeda", 0).map((a) => a.region);
    expect(regions).toEqual([2, 3, 4, 5, 6, 7, 8, 9]);
    state.supply.takeda = 0;
    expect(determinationActions(state, "takeda", 0)).toEqual([]);
  });

  it("aggression targets every non-own cube, neutrals included", () => {
    const state = twoSeats(["tm.", "..", "..", ".", "...", "..", "...", ".", "...", "u.."]);
    expect(aggressionActions(state, 0)).toEqual([
      { type: "aggression", region: 0, square: 1 },
      { type: "aggression", region: 9, square: 0 },
    ]);
  });

  it("the Emperor may push out the very colour it is moving — every cube is an opponent's to it", () => {
    // Region 0's only neighbour (region 1) is full with Takeda at the bottom.
    const state = setFactions(baseState(5), ["takeda", null, "uesugi", "oda", "mori"]);
    setBoard(state, ["t..", "ut", "..", ".", "...", "..", "...", ".", "...", "..."]);
    expect(balanceReplaceActions(state, "takeda", 0)).toEqual([]);
    expect(balanceReplaceActions(state, "takeda", 1, "takeda")).toEqual([
      { type: "balance-replace", region: 0, square: 0, to: 1, as: "takeda" },
    ]);
    // A like-for-like swap is still nothing: Takeda under Takeda cannot "climb".
    state.board[1] = ["takeda", "takeda"];
    expect(balanceSwapActions(state, "takeda", 1, "takeda")).toEqual([]);
  });

  it("the Emperor's Aggression targets every cube on the map and names no clan", () => {
    const state = setFactions(baseState(5), ["takeda", null, "uesugi", "oda", "mori"]);
    setBoard(state, ["tu.", "..", "m.", ".", "...", "..", "...", ".", "...", "o.."]);
    expect(aggressionActions(state, 1)).toEqual([
      { type: "aggression", region: 0, square: 0 },
      { type: "aggression", region: 0, square: 1 },
      { type: "aggression", region: 2, square: 0 },
      { type: "aggression", region: 9, square: 0 },
    ]);
    // A clan seat still spares its own cubes.
    expect(
      aggressionActions(state, 0).some(
        (a) => a.type === "aggression" && a.region === 0 && a.square === 0,
      ),
    ).toBe(false);
  });

  it("a region touched by another seat is locked; the toucher may revisit it", () => {
    const state = twoSeats(["t..", "u.", "..", ".", "...", "..", "...", ".", "...", "..."]);
    state.affected = [{ region: 1, by: 1 }];
    expect(balanceMoveActions(state, "takeda", 0)).toEqual([]);
    expect(determinationActions(state, "takeda", 0).some((a) => a.region === 1)).toBe(false);
    expect(aggressionActions(state, 0)).toEqual([]);
    expect(determinationActions(state, "uesugi", 1).some((a) => a.region === 1)).toBe(true);
  });
});

describe("getLegalActions", () => {
  it("offers only the available kinds for the tier, plus pass", () => {
    const state = rewardsFor(
      twoSeats(["tm.", "..", "..", ".", "...", "..", "...", ".", "...", "..."]),
      0,
      1,
    );
    const types = new Set(getLegalActions(state).map((a) => a.type));
    expect(types).toEqual(new Set(["balance-move", "pass"]));

    rewardsFor(state, 0, 3);
    expect(new Set(getLegalActions(state).map((a) => a.type))).toEqual(
      new Set(["balance-move", "determination", "pass"]),
    );
  });

  it("Focus excludes an already-used kind but keeps the other two and pass", () => {
    const state = rewardsFor(
      twoSeats(["tm.", "..", "..", ".", "...", "..", "...", ".", "...", "..."]),
      0,
      7,
    );
    state.rewardQueue[0].used = ["balance"];
    const types = new Set(getLegalActions(state).map((a) => a.type));
    expect(types).toEqual(new Set(["determination", "aggression", "pass"]));
  });

  it("the Emperor moves and places as every seated clan (`as`) but strikes as nobody; clan seats carry no `as` key", () => {
    const state = setFactions(baseState(5), ["takeda", null, "uesugi", "oda", "mori"]);
    rewardsFor(state, 1, 5);
    const actions = getLegalActions(state).filter((a) => a.type !== "pass");
    const cubeMoves = actions.filter((a) => a.type !== "aggression");
    const strikes = actions.filter((a) => a.type === "aggression");
    expect(cubeMoves.length).toBeGreaterThan(0);
    expect(new Set(cubeMoves.map((a) => ("as" in a ? a.as : undefined)))).toEqual(
      new Set(["takeda", "uesugi", "oda", "mori"]),
    );
    // One strike per cube on the setup map, none tagged with a clan.
    expect(strikes).toHaveLength(state.board.flat().filter((c) => c !== null).length);
    for (const a of strikes) expect("as" in a).toBe(false);

    rewardsFor(state, 0, 5);
    for (const a of getLegalActions(state)) expect("as" in a).toBe(false);
  });

  it("returns nothing during the settle beat or after the game", () => {
    const state = twoSeats();
    state.phase = "trick-settle";
    expect(getLegalActions(state)).toEqual([]);
    state.phase = "game-over";
    expect(getLegalActions(state)).toEqual([]);
  });

  it("only the seat to act gets plays, restricted to the lead suit", () => {
    const state = twoSeats();
    state.players[0].hand = ["takeda-5", "oda-9", "ninja-jade"];
    state.turn = 0;
    state.leadSuit = "takeda";
    const legal: Action[] = getLegalActions(state);
    expect(legal).toEqual([{ type: "play", card: "takeda-5" }]);
  });
});
