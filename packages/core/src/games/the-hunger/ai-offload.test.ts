import { afterEach, describe, expect, it } from "vitest";
import { heuristicPick } from "./ai-heuristic";
import { pickAiAction, pickAiActionAsync, setAiOffload } from "./ai-strategies";
import { applyUnchecked, createInitialState } from "./game-engine";
import { getActivePlayer, getLegalActions } from "./rules";
import type { GameState } from "./types";

function searchSeatWithChoice(): GameState {
  let s = createInitialState({
    playerCount: 2,
    strategies: ["heuristic-v1", "heuristic-v1"],
    seed: 11,
  });
  while (getLegalActions(s, getActivePlayer(s)).length < 3) {
    s = applyUnchecked(s, getActivePlayer(s), pickAiAction(s));
  }
  s.players[getActivePlayer(s)].aiStrategy = "strigoi";
  return s;
}

describe("pickAiActionAsync", () => {
  afterEach(() => setAiOffload(null));

  it("asks the offload for a search bot's move and maps it onto the legal action", async () => {
    const s = searchSeatWithChoice();
    const legal = getLegalActions(s, getActivePlayer(s));
    const wanted = legal[legal.length - 1];
    setAiOffload(async () => structuredClone(wanted));
    expect(await pickAiActionAsync(s)).toEqual(wanted);
  });

  it("plays Nosferatu's move when the offload fails or answers illegally", async () => {
    const s = searchSeatWithChoice();
    const seat = getActivePlayer(s);
    const nosferatu = heuristicPick(s, seat, getLegalActions(s, seat));
    setAiOffload(async () => {
      throw new Error("down");
    });
    expect(await pickAiActionAsync(s)).toEqual(nosferatu);
    setAiOffload(async () => ({ type: "hunt", row: 99, col: 9 }));
    expect(await pickAiActionAsync(s)).toEqual(nosferatu);
  });

  it("never searches on the caller's thread without an offload", async () => {
    const s = searchSeatWithChoice();
    const t = performance.now();
    await pickAiActionAsync(s);
    expect(performance.now() - t).toBeLessThan(50);
  });
});
