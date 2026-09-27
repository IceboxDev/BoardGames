import { graphFor } from "@boardgames/core/games/the-hunger/board";
import { buildPlayerView } from "@boardgames/core/games/the-hunger/player-view";
import { afterSetup, rigTurn } from "@boardgames/core/games/the-hunger/test-helpers";
import { describe, expect, it } from "vitest";
import { leaders, type MetricRow, overviewMetrics } from "./metrics";

const speedy = ["vampiric-speed-3#0", "vampiric-speed-3#1", "vampire-speed-2#0-0"];

function rows(seats = 3) {
  const b = afterSetup(seats, 7);
  b.players[1].vp = 9;
  const state = rigTurn(b, 0, { hand: speedy, pos: "road-4" });
  const view = buildPlayerView(state, 0);
  const sections = overviewMetrics(view, graphFor(view.options), 0);
  return new Map(sections.flatMap((s) => s.rows).map((r) => [r.label, r]));
}

describe("overviewMetrics", () => {
  it("gives every row one value per Vampire", () => {
    for (const row of rows(4).values()) expect(row.values).toHaveLength(4);
  });

  it("reads VP, turn status and position from the public view", () => {
    const r = rows();
    expect(r.get("Victory Points")?.values[1]).toBe(9);
    expect(r.get("This night")?.values[0]).toBe("Acting");
    expect(r.get("Standing on")?.values[0]).toBe("Plains Chest");
  });

  it("says where the sun would leave each Vampire", () => {
    // Out on the plains at dawn is Ashes; at home in the Castle is Safe.
    expect(rows().get("If the sun rose now")?.values[0]).toBe("Ashes");
  });

  it("never names a space id", () => {
    const id = /\b(road|rail|boat)-\d+\b/;
    for (const row of rows().values()) {
      for (const v of row.values) expect(String(v)).not.toMatch(id);
    }
  });
});

describe("leaders", () => {
  const row = (values: (number | string)[], best?: "max" | "min"): MetricRow => ({
    label: "x",
    values,
    best,
  });
  it("lights the strict leader at the row's best end", () => {
    expect([...leaders(row([1, 5, 3], "max"))]).toEqual([1]);
    expect([...leaders(row([4, 2, 3], "min"))]).toEqual([1]);
  });
  it("lights nobody on a tie, a text row, or a row with no best end", () => {
    expect(leaders(row([5, 5, 1], "max")).size).toBe(0);
    expect(leaders(row([1, "—"], "max")).size).toBe(0);
    expect(leaders(row([1, 2])).size).toBe(0);
  });
});
