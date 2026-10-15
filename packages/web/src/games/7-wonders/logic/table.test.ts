import { createInitialState, resolveMilitary } from "@boardgames/core/games/7-wonders/game-engine";
import { buildPlayerView } from "@boardgames/core/games/7-wonders/machine";
import type { GameState } from "@boardgames/core/games/7-wonders/types";
import { describe, expect, it } from "vitest";
import {
  attentionFor,
  borders,
  duelToken,
  neighbourOf,
  passDirection,
  seatStatus,
  seatsFrom,
  warBorders,
} from "./table";

const ctx = (gameState: GameState) => ({
  gameState,
  strategies: [],
  humanPlayers: [0],
  pendingAiSelections: null,
});

/** A fresh table with these shield counts (Stockades stand in for shields). */
function withShields(shields: number[]): GameState {
  const s = createInitialState({ playerCount: shields.length, seed: 4, sideMode: "A" });
  return {
    ...s,
    players: s.players.map((p, i) => ({
      ...p,
      tableau: Array.from({ length: shields[i] }, (_, k) => `Stockade@${i * 10 + k}`),
    })),
  };
}

describe("table helpers", () => {
  it("orders seats from you round to your left", () => {
    expect(seatsFrom(0, 4)).toEqual([0, 1, 2, 3]);
    expect(seatsFrom(2, 5)).toEqual([2, 3, 4, 0, 1]);
  });

  it("names your two neighbours (left = the next seat)", () => {
    expect(neighbourOf(0, 1, 5)).toBe("left");
    expect(neighbourOf(0, 4, 5)).toBe("right");
    expect(neighbourOf(0, 2, 5)).toBeNull();
    expect(neighbourOf(0, 0, 5)).toBeNull();
  });

  it("passes left in ages I and III, right in II", () => {
    expect([1, 2, 3].map((a) => passDirection(a as 1 | 2 | 3))).toEqual(["left", "right", "left"]);
  });

  it("prices a border by age", () => {
    expect(duelToken(3, 1, 1)).toBe(1);
    expect(duelToken(3, 1, 2)).toBe(3);
    expect(duelToken(3, 1, 3)).toBe(5);
    expect(duelToken(1, 3, 3)).toBe(-1);
    expect(duelToken(2, 2, 3)).toBe(0);
  });

  it("finds every border and who would win it", () => {
    const view = buildPlayerView(ctx(withShields([2, 0, 1])), 0);
    expect(borders(view.players)).toEqual([
      { a: 0, b: 1, aShields: 2, bShields: 0, winner: 0 },
      { a: 1, b: 2, aShields: 0, bShields: 1, winner: 2 },
      { a: 2, b: 0, aShields: 1, bShields: 2, winner: 0 },
    ]);
  });

  it("pairs every war token with its border, as the engine resolved it", () => {
    for (const shields of [
      [2, 0, 1],
      [0, 1, 0, 3, 3],
      [1, 2, 3, 4, 5, 6, 0],
    ]) {
      const before = withShields(shields);
      const after = resolveMilitary(before);
      const war = after.actionLog.at(-1);
      if (war?.type !== "military") throw new Error("no war");
      for (const row of warBorders(war.outcomes, shields.length)) {
        expect(row.ta).toBe(duelToken(shields[row.a], shields[row.b], before.age));
        expect(row.tb).toBe(duelToken(shields[row.b], shields[row.a], before.age));
      }
    }
  });

  it("calls you to your city while your pick is open", () => {
    const state = createInitialState({ playerCount: 3, seed: 1, sideMode: "A" });
    const view = buildPlayerView(ctx(state), 0);
    expect([...attentionFor(view, 0, false)]).toEqual(["city"]);
    expect(attentionFor(view, 0, true).size).toBe(0);
    expect(seatStatus(view, 1)).toBe("choosing");
    const picked = buildPlayerView(
      ctx({ ...state, selections: [{ type: "discard", cardId: state.hands[0][0] }, null, null] }),
      0,
    );
    expect(attentionFor(picked, 0, false).size).toBe(0);
    expect(seatStatus(picked, 0)).toBe("picked");
  });
});
