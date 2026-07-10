import { describe, expect, it } from "vitest";
import { allSelected, applyReveal, applySelection, createInitialState } from "./game-engine";
import { getLegalActions } from "./rules";
import { idsFor, makeTestState } from "./test-fixtures";
import type { GameState } from "./types";
import { cardIdName } from "./types";

function discardFirst(state: GameState): GameState {
  let next = state;
  for (let i = 0; i < state.playerCount; i++) {
    next = applySelection(next, i, { type: "discard", cardId: next.hands[i][0] });
  }
  return applyReveal(next);
}

describe("applySelection", () => {
  it("stores a legal selection and flips to revealing once all are in", () => {
    const state = makeTestState([
      { wonder: "giza", hand: ["Altar", "Baths"] },
      { wonder: "babylon", hand: ["Theater", "Stockade"] },
      { wonder: "olympia", hand: ["Loom", "Press"] },
    ]);
    let next = applySelection(state, 0, { type: "discard", cardId: state.hands[0][0] });
    expect(next.selections[0]).not.toBeNull();
    expect(next.phase).toBe("selecting");
    next = applySelection(next, 1, { type: "discard", cardId: state.hands[1][0] });
    next = applySelection(next, 2, { type: "discard", cardId: state.hands[2][0] });
    expect(allSelected(next)).toBe(true);
    expect(next.phase).toBe("revealing");
  });

  it("rejects selecting twice or acting on a card not in hand", () => {
    const state = makeTestState([
      { wonder: "giza", hand: ["Altar"] },
      { wonder: "babylon", hand: ["Theater"] },
      { wonder: "olympia", hand: ["Loom"] },
    ]);
    const once = applySelection(state, 0, { type: "discard", cardId: state.hands[0][0] });
    expect(() => applySelection(once, 0, { type: "discard", cardId: state.hands[0][0] })).toThrow();
    expect(() =>
      applySelection(state, 1, { type: "discard", cardId: state.hands[0][0] }),
    ).toThrow();
  });

  it("rejects a fabricated cheap payment", () => {
    // Aqueduct costs 3 stone; giza produces 1. Claiming it's free is illegal.
    const state = makeTestState([
      { wonder: "giza", hand: ["Aqueduct"] },
      { wonder: "babylon", hand: ["Theater"] },
      { wonder: "olympia", hand: ["Loom"] },
    ]);
    expect(() =>
      applySelection(state, 0, {
        type: "play-card",
        cardId: state.hands[0][0],
        payment: { kind: "resources", left: 0, right: 0 },
      }),
    ).toThrow();
  });
});

describe("legal actions", () => {
  it("never offers playing a duplicate name, but discard and wonder-burial remain", () => {
    const state = makeTestState([
      { wonder: "giza", tableau: ["Altar"], hand: ["Altar"] },
      { wonder: "babylon", hand: ["Theater"] },
      { wonder: "olympia", hand: ["Loom"] },
    ]);
    const actions = getLegalActions(state, 0);
    expect(actions.some((a) => a.type === "play-card")).toBe(false);
    expect(actions.some((a) => a.type === "discard")).toBe(true);
  });

  it("offers a chain build for free", () => {
    // Statue chains from Theater; its cost (wood + 2 ore) is otherwise unaffordable.
    const state = makeTestState([
      { wonder: "giza", tableau: ["Theater"], hand: ["Statue"] },
      { wonder: "babylon", hand: ["Theater"] },
      { wonder: "olympia", hand: ["Loom"] },
    ]);
    const actions = getLegalActions(state, 0);
    const chain = actions.find((a) => a.type === "play-card");
    expect(chain).toEqual({
      type: "play-card",
      cardId: state.hands[0][0],
      payment: { kind: "chain" },
    });
  });

  it("offers the Olympia free build once per age", () => {
    const state = makeTestState([
      { wonder: "olympia", stagesBuilt: 2, hand: ["Aqueduct"] }, // 3 stone — unaffordable
      { wonder: "babylon", hand: ["Theater"] },
      { wonder: "giza", hand: ["Loom"] },
    ]);
    const actions = getLegalActions(state, 0);
    expect(actions.some((a) => a.type === "play-card" && a.payment.kind === "free-build")).toBe(
      true,
    );

    const used = makeTestState([
      { wonder: "olympia", stagesBuilt: 2, hand: ["Aqueduct"] },
      { wonder: "babylon", hand: ["Theater"] },
      { wonder: "giza", hand: ["Loom"] },
    ]);
    used.players[0].freeBuildUsedThisAge = true;
    expect(
      getLegalActions(used, 0).some(
        (a) => a.type === "play-card" && a.payment.kind === "free-build",
      ),
    ).toBe(false);
  });
});

describe("applyReveal", () => {
  it("discarding grants 3 coins and moves the card to the pile", () => {
    const state = makeTestState([
      { wonder: "giza", hand: ["Altar", "Baths"] },
      { wonder: "babylon", hand: ["Theater", "Stockade"] },
      { wonder: "olympia", hand: ["Loom", "Press"] },
    ]);
    const next = discardFirst(state);
    for (const p of next.players) expect(p.coins).toBe(6);
    expect(next.discard).toHaveLength(3);
    expect(next.turn).toBe(2);
    expect(next.phase).toBe("selecting");
  });

  it("chain builds cost nothing and land in the tableau", () => {
    const state = makeTestState([
      { wonder: "giza", tableau: ["Theater"], hand: ["Statue", "Altar"] },
      { wonder: "babylon", hand: ["Baths", "Stockade"] },
      { wonder: "olympia", hand: ["Loom", "Press"] },
    ]);
    let next = applySelection(state, 0, {
      type: "play-card",
      cardId: state.hands[0][0],
      payment: { kind: "chain" },
    });
    next = applySelection(next, 1, { type: "discard", cardId: state.hands[1][0] });
    next = applySelection(next, 2, { type: "discard", cardId: state.hands[2][0] });
    next = applyReveal(next);
    expect(next.players[0].coins).toBe(3);
    expect(next.players[0].tableau.map(cardIdName)).toContain("Statue");
  });

  it("building a wonder stage buries the card and applies stage effects", () => {
    // Rhodes B stage 1 costs 3 stone → giza(stone) + Stone Pit + trade 1 from left giza.
    const state = makeTestState([
      { wonder: "rhodes", side: "B", coins: 4, tableau: ["Quarry"], hand: ["Altar", "Baths"] },
      { wonder: "giza", hand: ["Theater", "Stockade"] },
      { wonder: "olympia", hand: ["Loom", "Press"] },
    ]);
    let next = applySelection(state, 0, {
      type: "build-wonder",
      cardId: state.hands[0][0],
      payment: { kind: "resources", left: 2, right: 0 },
    });
    next = applySelection(next, 1, { type: "discard", cardId: state.hands[1][0] });
    next = applySelection(next, 2, { type: "discard", cardId: state.hands[2][0] });
    next = applyReveal(next);
    expect(next.players[0].stagesBuilt).toBe(1);
    expect(next.players[0].tableau.map(cardIdName)).not.toContain("Altar");
    // 4 coins - 2 trade + 3 stage coins (Rhodes B stage 1) = 5
    expect(next.players[0].coins).toBe(5);
    // Left neighbor got the trade coins on top of their discard coins.
    expect(next.players[1].coins).toBe(3 + 2 + 3);
  });

  it("instant coin effects count the post-placement board", () => {
    // Vineyard: 1 coin per brown card on self + neighbors, counted after this
    // turn's placements — the neighbor's Lumber Yard played the same turn counts.
    const state = makeTestState([
      { wonder: "giza", hand: ["Vineyard", "Altar"] },
      { wonder: "babylon", tableau: [], hand: ["Lumber Yard", "Stockade"] },
      { wonder: "olympia", hand: ["Loom", "Press"] },
    ]);
    let next = applySelection(state, 0, {
      type: "play-card",
      cardId: state.hands[0][0],
      payment: { kind: "resources", left: 0, right: 0 },
    });
    next = applySelection(next, 1, {
      type: "play-card",
      cardId: state.hands[1][0],
      payment: { kind: "resources", left: 0, right: 0 },
    });
    next = applySelection(next, 2, { type: "discard", cardId: state.hands[2][0] });
    next = applyReveal(next);
    expect(next.players[0].coins).toBe(4); // 3 + 1 brown (neighbor's fresh Lumber Yard)
  });

  it("passes hands clockwise in age 1 and counter-clockwise in age 2", () => {
    const age1 = makeTestState([
      { wonder: "giza", hand: ["Altar", "Baths"] },
      { wonder: "babylon", hand: ["Theater", "Stockade"] },
      { wonder: "olympia", hand: ["Loom", "Press"] },
    ]);
    const after1 = discardFirst(age1);
    // Player 0's remaining card goes to player 1 (left) in age 1.
    expect(after1.hands[1].map(cardIdName)).toEqual(["Baths"]);
    expect(after1.hands[2].map(cardIdName)).toEqual(["Stockade"]);
    expect(after1.hands[0].map(cardIdName)).toEqual(["Press"]);

    const age2 = makeTestState(
      [
        { wonder: "giza", hand: ["Altar", "Baths"] },
        { wonder: "babylon", hand: ["Theater", "Stockade"] },
        { wonder: "olympia", hand: ["Loom", "Press"] },
      ],
      { age: 2 },
    );
    const after2 = discardFirst(age2);
    expect(after2.hands[2].map(cardIdName)).toEqual(["Baths"]);
    expect(after2.hands[0].map(cardIdName)).toEqual(["Stockade"]);
    expect(after2.hands[1].map(cardIdName)).toEqual(["Press"]);
  });

  it("simultaneous cross-payments all settle from pre-reveal balances", () => {
    // p0 buys wood from p1 (2 coins) while p1 buys stone from p0 (2 coins).
    const state = makeTestState([
      { wonder: "giza", coins: 3, hand: ["Stockade", "Altar"] }, // stone; Stockade needs wood
      { wonder: "olympia", coins: 3, hand: ["Baths", "Theater"] }, // wood; Baths needs stone
      { wonder: "babylon", hand: ["Loom", "Press"] },
    ]);
    let next = applySelection(state, 0, {
      type: "play-card",
      cardId: state.hands[0][0],
      payment: { kind: "resources", left: 2, right: 0 },
    });
    next = applySelection(next, 1, {
      type: "play-card",
      cardId: state.hands[1][0],
      payment: { kind: "resources", left: 0, right: 2 },
    });
    next = applySelection(next, 2, { type: "discard", cardId: state.hands[2][0] });
    next = applyReveal(next);
    expect(next.players[0].coins).toBe(3); // -2 paid, +2 received
    expect(next.players[1].coins).toBe(3);
  });
});

describe("full age flow", () => {
  it("six all-discard turns resolve military and advance to age 2", () => {
    let state = createInitialState({ playerCount: 3, seed: 42, sideMode: "A" });
    for (let turn = 1; turn <= 6; turn++) {
      expect(state.turn).toBe(turn);
      state = discardFirst(state);
    }
    expect(state.age).toBe(2);
    expect(state.turn).toBe(1);
    expect(state.phase).toBe("selecting");
    // 18 discarded + 3 leftover seventh cards.
    expect(state.discard).toHaveLength(21);
    expect(state.hands.every((h) => h.length === 7)).toBe(true);
    // Nobody built shields — all military comparisons tie.
    for (const p of state.players) expect(p.militaryTokens).toEqual([]);
    expect(state.actionLog.filter((e) => e.type === "military")).toHaveLength(1);
  });

  it("plays a full 18-turn game to game-over on discards", () => {
    let state = createInitialState({ playerCount: 4, seed: 7, sideMode: "random" });
    for (let i = 0; i < 18; i++) state = discardFirst(state);
    expect(state.phase).toBe("game-over");
    const end = state.actionLog[state.actionLog.length - 1];
    expect(end?.type).toBe("game-end");
    if (end?.type === "game-end") {
      // All-discard game: scores are coins only (3 + 18*3 = 57 → 19 points each).
      expect(end.totals).toEqual([19, 19, 19, 19]);
    }
  });
});

describe("idsFor fixture helper", () => {
  it("gives duplicate names distinct instance ids", () => {
    const ids = idsFor(["Loom", "Loom"]);
    expect(new Set(ids).size).toBe(2);
  });
});
