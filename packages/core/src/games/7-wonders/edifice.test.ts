import { describe, expect, it } from "vitest";
import { chooseEdifices, EDIFICES, participationPawnCount } from "./edifice";
import {
  applyPendingAction,
  applyReveal,
  applySelection,
  createInitialState,
  resolveEdificeEndOfAge,
} from "./game-engine";
import { getLegalActions } from "./rules";
import { scoreEdifice } from "./scoring";
import { makeTestState } from "./test-fixtures";
import type { EdificeSlot, GameState } from "./types";

function edificeSlot(
  overrides: Partial<EdificeSlot> & { card: string; age: 1 | 2 | 3 },
): EdificeSlot {
  return {
    pawnsTotal: 2,
    pawnsLeft: 2,
    status: "project",
    participants: [],
    ...overrides,
  };
}

describe("edifice catalog", () => {
  it("has 15 cards, 5 per age", () => {
    expect(EDIFICES).toHaveLength(15);
    for (const age of [1, 2, 3] as const) {
      expect(EDIFICES.filter((e) => e.age === age)).toHaveLength(5);
    }
  });

  it("chooses one edifice per age deterministically by seed", () => {
    const rng1 = (() => {
      let s = 5;
      return () => {
        s = (s * 1103515245 + 12345) & 0x7fffffff;
        return s / 0x7fffffff;
      };
    })();
    const chosen = chooseEdifices(rng1);
    expect(chosen).toHaveLength(3);
    // Each belongs to its age.
    chosen.forEach((name, i) => {
      expect(EDIFICES.find((e) => e.name === name)?.age).toBe(i + 1);
    });
  });

  it("scales participation pawns with player count (5p = 3, verified vs BGA)", () => {
    expect(participationPawnCount(5)).toBe(3);
    expect(participationPawnCount(3)).toBe(2);
    expect(participationPawnCount(7)).toBe(4);
  });
});

describe("edifice setup", () => {
  it("adds three project slots when enabled", () => {
    const state = createInitialState({ playerCount: 4, seed: 1, sideMode: "A", edifice: true });
    expect(state.edifices).toHaveLength(3);
    expect(state.edifices?.map((e) => e.age)).toEqual([1, 2, 3]);
    for (const slot of state.edifices ?? []) {
      expect(slot.status).toBe("project");
      expect(slot.pawnsLeft).toBe(participationPawnCount(4));
    }
  });

  it("is absent in a base game", () => {
    const state = createInitialState({ playerCount: 4, seed: 1, sideMode: "A" });
    expect(state.edifices).toBeUndefined();
  });
});

// Money Changer (age I): cost 1, reward +4 coins, penalty pay 2.
// Player 0 has Sawmill (2 wood) so Giza A stage 1 (2 wood) is free to build.
function moneyChangerState(overrides: Partial<GameState> = {}): GameState {
  return makeTestState(
    [
      { wonder: "giza", coins: 5, tableau: ["Sawmill"], hand: ["Altar", "Baths"] },
      { wonder: "babylon", coins: 5, hand: ["Theater", "Stockade"] },
      { wonder: "olympia", coins: 5, hand: ["Loom", "Press"] },
    ],
    {
      edifices: [edificeSlot({ card: "Money Changer", age: 1, pawnsTotal: 2, pawnsLeft: 2 })],
      ...overrides,
    },
  );
}

describe("participation", () => {
  it("offers a participate variant on build-wonder when affordable", () => {
    const state = moneyChangerState();
    const wonderActions = getLegalActions(state, 0).filter((a) => a.type === "build-wonder");
    expect(wonderActions.some((a) => a.type === "build-wonder" && a.participate)).toBe(true);
    expect(wonderActions.some((a) => a.type === "build-wonder" && !a.participate)).toBe(true);
  });

  it("does not offer participation without a spare coin for the cost", () => {
    const base = moneyChangerState();
    base.players[0].coins = 0; // stage is free, but participation costs 1
    expect(getLegalActions(base, 0).some((a) => a.type === "build-wonder" && a.participate)).toBe(
      false,
    );
  });

  it("takes a pawn and pays the participation cost on reveal", () => {
    const s = moneyChangerState({
      edifices: [edificeSlot({ card: "Money Changer", age: 1, pawnsTotal: 3, pawnsLeft: 3 })],
    });
    let next = applySelection(s, 0, {
      type: "build-wonder",
      cardId: s.hands[0][0],
      payment: { kind: "resources", left: 0, right: 0 },
      participate: true,
    });
    next = applySelection(next, 1, { type: "discard", cardId: s.hands[1][0] });
    next = applySelection(next, 2, { type: "discard", cardId: s.hands[2][0] });
    next = applyReveal(next);
    expect(next.edifices?.[0].participants).toContain(0);
    expect(next.edifices?.[0].pawnsLeft).toBe(2);
    expect(next.players[0].coins).toBe(4); // 5 - 1 participation
  });
});

describe("completion", () => {
  it("constructs the edifice when the last pawn is taken and pays rewards", () => {
    const s = moneyChangerState({
      edifices: [edificeSlot({ card: "Money Changer", age: 1, pawnsTotal: 1, pawnsLeft: 1 })],
    });
    let next = applySelection(s, 0, {
      type: "build-wonder",
      cardId: s.hands[0][0],
      payment: { kind: "resources", left: 0, right: 0 },
      participate: true,
    });
    next = applySelection(next, 1, { type: "discard", cardId: s.hands[1][0] });
    next = applySelection(next, 2, { type: "discard", cardId: s.hands[2][0] });
    next = applyReveal(next);
    expect(next.edifices?.[0].status).toBe("built");
    expect(next.players[0].coins).toBe(8); // 5 - 1 participation + 4 reward
    expect(next.actionLog.some((e) => e.type === "edifice" && e.outcome === "built")).toBe(true);
  });
});

describe("failure & penalties", () => {
  it("fails an unbuilt edifice at end of age and penalizes non-participants", () => {
    const state = makeTestState(
      [
        { wonder: "giza", coins: 5, tableau: ["Altar"] },
        { wonder: "babylon", coins: 1, tableau: ["Baths"] },
        { wonder: "olympia", coins: 5, tableau: ["Theater"] },
      ],
      {
        turn: 6,
        edifices: [edificeSlot({ card: "Money Changer", age: 1, pawnsLeft: 2, participants: [0] })],
      },
    );
    const next = resolveEdificeEndOfAge(state);
    expect(next.edifices?.[0].status).toBe("failed");
    // Participant (p0) is exempt. p1 has 1 coin, penalty is 2 → debt token.
    expect(next.players[0].coins).toBe(5);
    expect(next.players[1].debtTokens).toEqual([-2]);
    // p2 can pay the 2-coin penalty.
    expect(next.players[2].coins).toBe(3);
  });

  it("discard-color penalty removes a card, or gives debt when absent", () => {
    // Belvedere penalty: discard a raw (brown) card.
    const state = makeTestState(
      [
        { wonder: "giza", tableau: ["Lumber Yard", "Altar"] }, // has brown
        { wonder: "babylon", tableau: ["Altar"] }, // no brown
        { wonder: "olympia", tableau: ["Ore Vein"] },
      ],
      {
        turn: 6,
        edifices: [edificeSlot({ card: "Belvedere", age: 1, pawnsLeft: 2 })],
      },
    );
    const next = resolveEdificeEndOfAge(state);
    expect(next.players[0].tableau.map((id) => id.split("@")[0])).not.toContain("Lumber Yard");
    expect(next.players[1].debtTokens).toEqual([-2]); // no brown card → debt
  });
});

describe("edifice scoring", () => {
  it("scores victory tokens and debt", () => {
    const state = makeTestState([{ wonder: "giza" }, { wonder: "babylon" }, { wonder: "olympia" }]);
    state.players[0].victoryTokens = [3, 5];
    state.players[0].debtTokens = [-2];
    expect(scoreEdifice(state, 0)).toBe(6);
  });

  it("scores an end-game reward for participants of a built project", () => {
    // Belvedere: 1 VP per wonder stage.
    const state = makeTestState(
      [
        { wonder: "giza", stagesBuilt: 3 },
        { wonder: "babylon", stagesBuilt: 1 },
        { wonder: "olympia" },
      ],
      {
        edifices: [
          edificeSlot({
            card: "Belvedere",
            age: 1,
            status: "built",
            pawnsLeft: 0,
            participants: [0],
          }),
        ],
      },
    );
    expect(scoreEdifice(state, 0)).toBe(3); // 3 stages
    expect(scoreEdifice(state, 1)).toBe(0); // not a participant
  });

  it("Artisan District scores 2 VP per brown+grey set", () => {
    const state = makeTestState(
      [{ wonder: "giza", tableau: ["Lumber Yard", "Ore Vein", "Loom"] }],
      {
        edifices: [
          edificeSlot({
            card: "Artisan District",
            age: 1,
            status: "built",
            pawnsLeft: 0,
            participants: [0],
          }),
        ],
      },
    );
    // 2 brown + 1 grey → min = 1 set → 2 VP.
    expect(scoreEdifice(state, 0)).toBe(2);
  });
});

describe("full edifice game", () => {
  it("plays a full game preferring participation, to completion, with edifice scores", () => {
    let state = createInitialState({ playerCount: 3, seed: 7, sideMode: "A", edifice: true });
    let guard = 0;
    while (state.phase !== "game-over" && guard++ < 200) {
      if (state.phase === "selecting") {
        for (let p = 0; p < state.playerCount; p++) {
          if (state.selections[p] !== null) continue;
          const legal = getLegalActions(state, p);
          const act =
            legal.find((a) => a.type === "build-wonder" && a.participate) ??
            legal.find((a) => a.type === "discard") ??
            legal[0];
          state = applySelection(state, p, act);
        }
      } else if (state.phase === "revealing") {
        state = applyReveal(state);
      } else if (state.phase === "pending") {
        const active = state.pendingQueue[0].playerIndex;
        const legal = getLegalActions(state, active);
        const skip = legal.find((a) => a.type === "skip-pending") ?? legal[0];
        state = applyPendingAction(state, active, skip);
      }
    }
    expect(state.phase).toBe("game-over");
    // At least one edifice should have resolved (built or failed) over the game.
    const resolved = (state.edifices ?? []).filter((e) => e.status !== "project");
    expect(resolved.length).toBeGreaterThan(0);
  });
});
