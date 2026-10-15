import { createInitialState } from "@boardgames/core/games/7-wonders/game-engine";
import { buildPlayerView } from "@boardgames/core/games/7-wonders/machine";
import { describe, expect, it } from "vitest";
import { leaders, type MetricRow, overviewMetrics, producible, scienceGains } from "./metrics";

const row = (values: number[], lowerIsBetter = false): MetricRow => ({
  label: "x",
  values,
  lowerIsBetter,
});

describe("overview metrics", () => {
  it("lights only an outright leader", () => {
    expect([...leaders(row([1, 4, 2]))]).toEqual([1]);
    expect(leaders(row([4, 4, 2])).size).toBe(0);
    expect(leaders(row([0, 0, 0])).size).toBe(0);
    expect([...leaders(row([2, 0, 1], true))]).toEqual([1]);
  });

  it("counts producible units, a choice once per option", () => {
    const production = [["wood"], ["wood", "clay"], ["stone"]] as const;
    expect(
      producible(
        production.map((s) => [...s]),
        "wood",
      ),
    ).toBe(2);
    expect(
      producible(
        production.map((s) => [...s]),
        "clay",
      ),
    ).toBe(1);
    expect(
      producible(
        production.map((s) => [...s]),
        "ore",
      ),
    ).toBe(0);
  });

  it("knows what one more science symbol is worth", () => {
    // 1/1/0 → a tablet completes a set: 1+1+1 + 7 = 10, from 2.
    expect(scienceGains({ gear: 1, compass: 1, tablet: 0 }, 0)).toEqual({
      gear: 3,
      compass: 3,
      tablet: 8,
    });
  });

  it("builds a column per seat in every row", () => {
    const state = createInitialState({ playerCount: 4, seed: 2, sideMode: "A" });
    const view = buildPlayerView(
      { gameState: state, strategies: [], humanPlayers: [0], pendingAiSelections: null },
      0,
    );
    const sections = overviewMetrics(view);
    expect(sections.map((s) => s.title)).toEqual([
      "Score now",
      "Economy",
      "Military",
      "Science",
      "City",
    ]);
    for (const s of sections) for (const r of s.rows) expect(r.values).toHaveLength(4);
    // Base game: no Edifice row.
    expect(sections[0].rows.some((r) => r.label === "Edifice")).toBe(false);
  });
});
