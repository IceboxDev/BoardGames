import { describe, expect, it } from "vitest";
import { applyPendingAction, applyReveal, applySelection } from "./game-engine";
import { getActivePlayer, getLegalActions } from "./rules";
import { idsFor, makeTestState } from "./test-fixtures";
import type { GameState } from "./types";
import { cardIdName } from "./types";

function selectAllDiscards(state: GameState, except?: number): GameState {
  let next = state;
  for (let i = 0; i < state.playerCount; i++) {
    if (i === except) continue;
    next = applySelection(next, i, { type: "discard", cardId: next.hands[i][0] });
  }
  return next;
}

describe("Halikarnassos pending", () => {
  function stateWithStagePending(): GameState {
    // Player 0 (Halikarnassos A, stage 1 built) builds stage 2 (3 ore,
    // play-discarded) mid-age on turn 3. The discard pile has picks.
    const state = makeTestState(
      [
        {
          wonder: "halikarnassos",
          stagesBuilt: 1,
          tableau: ["Foundry", "Ore Vein"],
          hand: ["Altar", "Baths"],
        },
        { wonder: "babylon", hand: ["Theater", "Stockade"] },
        { wonder: "olympia", hand: ["Loom", "Press"] },
      ],
      { turn: 3, discard: idsFor(["Tavern", "Foundry", "Pawnshop"]) },
    );
    let next = applySelection(state, 0, {
      type: "build-wonder",
      cardId: state.hands[0][0],
      payment: { kind: "resources", left: 0, right: 0 },
    });
    next = selectAllDiscards(next, 0);
    return applyReveal(next);
  }

  it("enters the pending phase for the stage builder after reveal", () => {
    const pending = stateWithStagePending();
    expect(pending.phase).toBe("pending");
    expect(pending.pendingQueue).toEqual([{ kind: "halikarnassos", playerIndex: 0 }]);
    expect(getActivePlayer(pending)).toBe(0);
  });

  it("offers each discard card except duplicates of the tableau, plus skip", () => {
    const pending = stateWithStagePending();
    const actions = getLegalActions(pending, 0);
    const names = actions
      .filter((a) => a.type === "pick-discard")
      .map((a) => (a.type === "pick-discard" ? cardIdName(a.cardId) : ""));
    // Foundry is already in the tableau; this turn's discards joined the pile.
    expect(names).not.toContain("Foundry");
    expect(names).toContain("Tavern");
    expect(names).toContain("Pawnshop");
    expect(names).toContain("Theater");
    expect(actions.some((a) => a.type === "skip-pending")).toBe(true);
  });

  it("builds the picked card for free, applies its effects, then the turn continues", () => {
    const pending = stateWithStagePending();
    const tavern = pending.discard.find((id) => cardIdName(id) === "Tavern");
    if (!tavern) throw new Error("fixture: Tavern missing from discard");
    const next = applyPendingAction(pending, 0, { type: "pick-discard", cardId: tavern });
    expect(next.players[0].tableau.map(cardIdName)).toContain("Tavern");
    expect(next.players[0].coins).toBe(3 + 5); // Tavern's instant 5 coins, no build cost
    expect(next.discard.map(cardIdName)).not.toContain("Tavern");
    expect(next.phase).toBe("selecting");
    expect(next.turn).toBe(4);
  });

  it("can be skipped", () => {
    const pending = stateWithStagePending();
    const before = pending.players[0].tableau.length;
    const next = applyPendingAction(pending, 0, { type: "skip-pending" });
    expect(next.players[0].tableau).toHaveLength(before);
    expect(next.turn).toBe(4);
  });

  it("rejects another player acting on the pending slot", () => {
    const pending = stateWithStagePending();
    expect(() => applyPendingAction(pending, 1, { type: "skip-pending" })).toThrow();
  });
});

describe("Babylon seventh card", () => {
  function turnSixState(): GameState {
    return makeTestState(
      [
        {
          wonder: "babylon",
          side: "B",
          stagesBuilt: 2,
          hand: ["Altar", "Baths"],
        },
        { wonder: "giza", hand: ["Theater", "Stockade"] },
        { wonder: "olympia", hand: ["Loom", "Press"] },
      ],
      { turn: 6 },
    );
  }

  it("keeps the 7th card as a pending action instead of discarding it", () => {
    const revealed = applyReveal(selectAllDiscards(turnSixState()));
    expect(revealed.phase).toBe("pending");
    expect(revealed.pendingQueue).toEqual([{ kind: "babylon-seventh", playerIndex: 0 }]);
    expect(revealed.hands[0]).toHaveLength(1);
    // Non-Babylon leftovers went straight to the pile: 3 discards + 2 leftovers.
    expect(revealed.discard).toHaveLength(5);
  });

  it("can play the 7th card, then military resolves and the next age starts", () => {
    const revealed = applyReveal(selectAllDiscards(turnSixState()));
    const leftover = revealed.hands[0][0];
    expect(cardIdName(leftover)).toBe("Baths"); // Altar was discarded first
    // Baths costs 1 stone — unaffordable for Babylon (clay); discard it instead.
    const next = applyPendingAction(revealed, 0, {
      type: "play-seventh",
      action: { type: "discard", cardId: leftover },
    });
    expect(next.players[0].coins).toBe(3 + 3 + 3); // turn discard + 7th-card discard
    expect(next.hands[0]).toHaveLength(7); // age 2 dealt
    expect(next.age).toBe(2);
    expect(next.actionLog.some((e) => e.type === "military")).toBe(true);
  });

  it("can play the 7th card into the tableau when affordable", () => {
    // Swap hand order so the free Altar is the leftover.
    const state = makeTestState(
      [
        { wonder: "babylon", side: "B", stagesBuilt: 2, hand: ["Baths", "Altar"] },
        { wonder: "giza", hand: ["Theater", "Stockade"] },
        { wonder: "olympia", hand: ["Loom", "Press"] },
      ],
      { turn: 6 },
    );
    const revealed = applyReveal(selectAllDiscards(state));
    const leftover = revealed.hands[0][0];
    expect(cardIdName(leftover)).toBe("Altar");
    const next = applyPendingAction(revealed, 0, {
      type: "play-seventh",
      action: {
        type: "play-card",
        cardId: leftover,
        payment: { kind: "resources", left: 0, right: 0 },
      },
    });
    expect(next.players[0].tableau.map(cardIdName)).toContain("Altar");
    expect(next.age).toBe(2);
  });

  it("resolves before a Halikarnassos pick so the 7th discard is available", () => {
    // Player 1 (Halikarnassos A, 3 ore on board) builds the play-discarded
    // stage on turn 6 while player 0 (Babylon B) holds the 7th card.
    const state = makeTestState(
      [
        { wonder: "babylon", side: "B", stagesBuilt: 2, hand: ["Baths", "Pawnshop"] },
        {
          wonder: "halikarnassos",
          stagesBuilt: 1,
          tableau: ["Foundry", "Ore Vein"],
          hand: ["Altar", "Theater"],
        },
        { wonder: "olympia", hand: ["Loom", "Press"] },
      ],
      { turn: 6 },
    );
    let next = applySelection(state, 0, { type: "discard", cardId: state.hands[0][0] });
    next = applySelection(next, 1, {
      type: "build-wonder",
      cardId: state.hands[1][0],
      payment: { kind: "resources", left: 0, right: 0 },
    });
    next = applySelection(next, 2, { type: "discard", cardId: state.hands[2][0] });
    next = applyReveal(next);

    expect(next.pendingQueue.map((p) => p.kind)).toEqual(["babylon-seventh", "halikarnassos"]);

    // Babylon discards Pawnshop as the 7th card...
    const leftover = next.hands[0][0];
    expect(cardIdName(leftover)).toBe("Pawnshop");
    next = applyPendingAction(next, 0, {
      type: "play-seventh",
      action: { type: "discard", cardId: leftover },
    });

    // ...and Halikarnassos can now pick it out of the pile.
    expect(getActivePlayer(next)).toBe(1);
    const picks = getLegalActions(next, 1).filter((a) => a.type === "pick-discard");
    const pawnshop = picks.find(
      (a) => a.type === "pick-discard" && cardIdName(a.cardId) === "Pawnshop",
    );
    expect(pawnshop).toBeDefined();
    if (pawnshop?.type !== "pick-discard") throw new Error("unreachable");
    next = applyPendingAction(next, 1, pawnshop);
    expect(next.players[1].tableau.map(cardIdName)).toContain("Pawnshop");
    expect(next.age).toBe(2);
  });
});
