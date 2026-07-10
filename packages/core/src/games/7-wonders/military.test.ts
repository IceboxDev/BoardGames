import { describe, expect, it } from "vitest";
import { resolveMilitary } from "./game-engine";
import { makeTestState } from "./test-fixtures";

describe("resolveMilitary", () => {
  it("awards +1/-1 per adjacent pair in age 1", () => {
    const state = makeTestState([
      { wonder: "giza", tableau: ["Stockade"] }, // 1 shield
      { wonder: "babylon" }, // 0
      { wonder: "olympia" }, // 0
    ]);
    const next = resolveMilitary(state);
    // Player 0 beats both neighbors (pairs 0-1 and 2-0); 1 vs 2 ties.
    expect(next.players[0].militaryTokens).toEqual([1, 1]);
    expect(next.players[1].militaryTokens).toEqual([-1]);
    expect(next.players[2].militaryTokens).toEqual([-1]);
  });

  it("awards +3 in age 2 and +5 in age 3", () => {
    const base = [
      { wonder: "giza" as const, tableau: ["Stockade"] },
      { wonder: "babylon" as const },
      { wonder: "olympia" as const },
    ];
    const age2 = resolveMilitary(makeTestState(base, { age: 2 }));
    expect(age2.players[0].militaryTokens).toEqual([3, 3]);
    const age3 = resolveMilitary(makeTestState(base, { age: 3 }));
    expect(age3.players[0].militaryTokens).toEqual([5, 5]);
  });

  it("ties award nothing to either side", () => {
    const state = makeTestState([
      { wonder: "giza", tableau: ["Stockade"] },
      { wonder: "babylon", tableau: ["Barracks"] },
      { wonder: "olympia", tableau: ["Guard Tower"] },
    ]);
    const next = resolveMilitary(state);
    for (const p of next.players) expect(p.militaryTokens).toEqual([]);
  });

  it("counts shields from wonder stages (Rhodes)", () => {
    const state = makeTestState([
      { wonder: "rhodes", side: "A", stagesBuilt: 2 }, // stage 2 = 2 shields
      { wonder: "babylon", tableau: ["Stockade"] }, // 1 shield
      { wonder: "olympia" },
    ]);
    const next = resolveMilitary(state);
    expect(next.players[0].militaryTokens).toEqual([1, 1]);
    // p1's Stockade still beats shieldless p2.
    expect(next.players[1].militaryTokens.slice().sort((a, b) => a - b)).toEqual([-1, 1]);
    expect(next.players[2].militaryTokens).toEqual([-1, -1]);
  });

  it("mixed results stack defeat and victory tokens per pair", () => {
    // Shields: p0=1, p1=2, p2=0.
    const state = makeTestState([
      { wonder: "giza", tableau: ["Stockade"] },
      { wonder: "babylon", tableau: ["Walls"] },
      { wonder: "olympia" },
    ]);
    const next = resolveMilitary(state);
    expect(next.players[0].militaryTokens.slice().sort((a, b) => a - b)).toEqual([-1, 1]); // loses to p1, beats p2
    expect(next.players[1].militaryTokens).toEqual([1, 1]);
    expect(next.players[2].militaryTokens).toEqual([-1, -1]);
  });

  it("records a military log entry with per-player outcomes", () => {
    const state = makeTestState([
      { wonder: "giza", tableau: ["Stockade"] },
      { wonder: "babylon" },
      { wonder: "olympia" },
    ]);
    const next = resolveMilitary(state);
    const entry = next.actionLog[next.actionLog.length - 1];
    expect(entry?.type).toBe("military");
    if (entry?.type === "military") {
      expect(entry.age).toBe(1);
      expect(entry.outcomes).toHaveLength(3);
    }
  });
});
