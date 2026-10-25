import { describe, expect, it } from "vitest";
import { resultBadges } from "./result-text";

describe("resultBadges", () => {
  it("names the winner's way of winning and the loser's way of losing", () => {
    expect(resultBadges({ winner: "b", termination: "checkmate" })).toEqual({
      w: { text: "Checkmated", tone: "rose" },
      b: { text: "Won · checkmate", tone: "emerald" },
    });
    expect(resultBadges({ winner: "w", termination: "timeout" }).b.text).toBe("Out of time");
  });
  it("gives both sides the draw", () => {
    const d = resultBadges({ winner: null, termination: "stalemate" });
    expect(d.w).toEqual({ text: "½ · stalemate", tone: "neutral" });
    expect(d.b).toEqual(d.w);
  });
});
