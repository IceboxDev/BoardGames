import { describe, expect, it } from "vitest";
import { getCardDef } from "./cards";
import { getOwnProduction, getTradeableProduction, getTradeCost, solvePayments } from "./payment";
import type { GameState, Payment, PlayerState, WonderId } from "./types";
import { emptyEdificeFields, makeCardId } from "./types";

interface PlayerSetup {
  wonder: WonderId;
  side?: "A" | "B";
  coins?: number;
  tableau?: string[];
  stagesBuilt?: number;
}

function tableauIds(names: string[]): string[] {
  return names.map((name) => makeCardId(name, getCardDef(name).age, 0));
}

/** Minimal 3-player state for solver tests; only fields the solver reads matter. */
function makeState(setups: [PlayerSetup, PlayerSetup, PlayerSetup]): GameState {
  const players: PlayerState[] = setups.map((s) => ({
    wonderId: s.wonder,
    side: s.side ?? "A",
    stagesBuilt: s.stagesBuilt ?? 0,
    coins: s.coins ?? 3,
    tableau: tableauIds(s.tableau ?? []),
    militaryTokens: [],
    freeBuildUsedThisAge: false,
    ...emptyEdificeFields(),
  }));
  return {
    seed: 0,
    playerCount: 3,
    age: 1,
    turn: 1,
    phase: "selecting",
    players,
    hands: [[], [], []],
    selections: [null, null, null],
    discard: [],
    pendingQueue: [],
    ageDecks: { 2: [], 3: [] },
    lastRevealed: [],
    actionLog: [],
  };
}

function splits(payments: Payment[] | null): Array<[number, number]> {
  if (!payments) return [];
  return payments.map((p) => (p.kind === "resources" ? [p.left, p.right] : [-1, -1]));
}

// Player 0's left neighbor is player 1, right neighbor is player 2.

describe("solvePayments — own production", () => {
  it("free when own fixed production covers the cost", () => {
    // Giza A produces stone; Stone Pit adds another.
    const state = makeState([
      { wonder: "giza", tableau: ["Stone Pit"] },
      { wonder: "babylon" },
      { wonder: "olympia" },
    ]);
    expect(splits(solvePayments(state, 0, { resources: { stone: 2 } }))).toEqual([[0, 0]]);
  });

  it("only the free split is returned when own production suffices, even if neighbors also produce", () => {
    const state = makeState([
      { wonder: "olympia" }, // wood
      { wonder: "olympia", tableau: ["Lumber Yard"] },
      { wonder: "giza", tableau: ["Lumber Yard"] },
    ]);
    expect(splits(solvePayments(state, 0, { resources: { wood: 1 } }))).toEqual([[0, 0]]);
  });

  it("a choice resource covers either need but not both at once", () => {
    // Tree Farm produces wood OR clay (one unit).
    const state = makeState([
      { wonder: "giza", tableau: ["Tree Farm"] }, // stone + (wood|clay)
      { wonder: "giza" },
      { wonder: "giza" },
    ]);
    expect(splits(solvePayments(state, 0, { resources: { wood: 1 } }))).toEqual([[0, 0]]);
    expect(splits(solvePayments(state, 0, { resources: { clay: 1 } }))).toEqual([[0, 0]]);
    // wood AND clay together exceed the single choice unit; neighbors have neither.
    expect(solvePayments(state, 0, { resources: { wood: 1, clay: 1 } })).toBeNull();
  });

  it("wonder stage production (Alexandria) is usable by the owner", () => {
    const state = makeState([
      { wonder: "alexandria", stagesBuilt: 2 }, // stage 2 = any raw resource
      { wonder: "giza" },
      { wonder: "giza" },
    ]);
    expect(splits(solvePayments(state, 0, { resources: { ore: 1 } }))).toEqual([[0, 0]]);
  });

  it("fixed multi-output production (Sawmill = 2 wood) provides two units", () => {
    const state = makeState([
      { wonder: "giza", tableau: ["Sawmill"] },
      { wonder: "giza" },
      { wonder: "giza" },
    ]);
    expect(splits(solvePayments(state, 0, { resources: { wood: 2 } }))).toEqual([[0, 0]]);
  });
});

describe("solvePayments — trading", () => {
  it("buys a missing resource from a neighbor at 2 coins", () => {
    const state = makeState([
      { wonder: "giza" }, // stone only
      { wonder: "olympia" }, // left neighbor: wood
      { wonder: "babylon" }, // right neighbor: clay
    ]);
    expect(splits(solvePayments(state, 0, { resources: { wood: 1 } }))).toEqual([[2, 0]]);
    expect(splits(solvePayments(state, 0, { resources: { clay: 1 } }))).toEqual([[0, 2]]);
  });

  it("offers both neighbor splits when either could supply", () => {
    const state = makeState([
      { wonder: "giza" },
      { wonder: "olympia" }, // wood
      { wonder: "olympia" }, // wood
    ]);
    const options = splits(solvePayments(state, 0, { resources: { wood: 1 } }));
    expect(options).toContainEqual([2, 0]);
    expect(options).toContainEqual([0, 2]);
    expect(options).toHaveLength(2);
  });

  it("East Trading Post discounts raw purchases from the right neighbor only", () => {
    const state = makeState([
      { wonder: "giza", tableau: ["East Trading Post"] },
      { wonder: "olympia" },
      { wonder: "olympia" },
    ]);
    expect(getTradeCost(state, 0, "right", "wood")).toBe(1);
    expect(getTradeCost(state, 0, "left", "wood")).toBe(2);
    expect(getTradeCost(state, 0, "right", "glass")).toBe(2); // manufactured not covered
    const options = splits(solvePayments(state, 0, { resources: { wood: 1 } }));
    expect(options).toContainEqual([0, 1]);
    expect(options).toContainEqual([2, 0]);
  });

  it("Marketplace discounts manufactured goods on both sides", () => {
    const state = makeState([
      { wonder: "giza", tableau: ["Marketplace"] },
      { wonder: "giza", tableau: ["Loom"] },
      { wonder: "giza" },
    ]);
    expect(getTradeCost(state, 0, "left", "loom")).toBe(1);
    expect(getTradeCost(state, 0, "right", "loom")).toBe(1);
    expect(splits(solvePayments(state, 0, { resources: { loom: 1 } }))).toEqual([[1, 0]]);
  });

  it("Olympia B stage 1 discounts raw resources on both sides", () => {
    const state = makeState([
      { wonder: "olympia", side: "B", stagesBuilt: 1 },
      { wonder: "giza" }, // stone
      { wonder: "babylon" }, // clay
    ]);
    expect(getTradeCost(state, 0, "left", "stone")).toBe(1);
    expect(getTradeCost(state, 0, "right", "clay")).toBe(1);
  });

  it("neighbor yellow/stage production is not for sale", () => {
    const state = makeState([
      { wonder: "giza" }, // stone; needs wood
      { wonder: "babylon", tableau: ["Caravansery"] }, // clay + choice raw (yellow)
      { wonder: "alexandria", side: "A", stagesBuilt: 2 }, // glass + stage choice raw
    ]);
    expect(solvePayments(state, 0, { resources: { wood: 1 } })).toBeNull();
    // But the Caravansery owner can use it themselves.
    expect(splits(solvePayments(state, 1, { resources: { wood: 1 } }))).toEqual([[0, 0]]);
  });

  it("respects the coin budget", () => {
    const state = makeState([
      { wonder: "giza", coins: 1 }, // needs 2 coins to buy wood
      { wonder: "olympia" },
      { wonder: "giza" },
    ]);
    expect(solvePayments(state, 0, { resources: { wood: 1 } })).toBeNull();
  });

  it("combines own, left and right production for multi-resource costs", () => {
    // Cost: 2 wood + 1 stone. Own: stone. Left: wood. Right: wood.
    const state = makeState([
      { wonder: "giza", coins: 4 },
      { wonder: "olympia" },
      { wonder: "olympia" },
    ]);
    const options = splits(solvePayments(state, 0, { resources: { wood: 2, stone: 1 } }));
    // One wood from each side is forced (each neighbor produces one unit).
    expect(options).toEqual([[2, 2]]);
  });
});

describe("solvePayments — coin costs", () => {
  it("a bank coin cost needs no resources", () => {
    const state = makeState([{ wonder: "giza" }, { wonder: "giza" }, { wonder: "giza" }]);
    expect(splits(solvePayments(state, 0, { coins: 1 }))).toEqual([[0, 0]]);
  });

  it("bank coin cost is unaffordable at zero coins", () => {
    const state = makeState([{ wonder: "giza", coins: 0 }, { wonder: "giza" }, { wonder: "giza" }]);
    expect(solvePayments(state, 0, { coins: 1 })).toBeNull();
  });

  it("bank coins reduce the trading budget", () => {
    // 3 coins total: 1 to bank leaves 2 for exactly one 2-coin trade.
    const state = makeState([
      { wonder: "giza", coins: 3 },
      { wonder: "olympia" },
      { wonder: "olympia" },
    ]);
    expect(solvePayments(state, 0, { coins: 1, resources: { wood: 2 } })).toBeNull();
    const single = splits(solvePayments(state, 0, { coins: 1, resources: { wood: 1 } }));
    expect(single).toContainEqual([2, 0]);
  });
});

describe("production listing", () => {
  it("own production includes wonder resource, cards and stages", () => {
    const state = makeState([
      { wonder: "alexandria", stagesBuilt: 2, tableau: ["Lumber Yard", "Forum"] },
      { wonder: "giza" },
      { wonder: "giza" },
    ]);
    // glass (wonder) + wood (card) + manufactured-choice (Forum) + raw-choice (stage 2)
    expect(getOwnProduction(state, 0)).toHaveLength(4);
  });

  it("tradeable production excludes yellow cards and stages", () => {
    const state = makeState([
      { wonder: "alexandria", stagesBuilt: 2, tableau: ["Lumber Yard", "Forum"] },
      { wonder: "giza" },
      { wonder: "giza" },
    ]);
    expect(getTradeableProduction(state, 0)).toHaveLength(2); // glass + wood only
  });
});
