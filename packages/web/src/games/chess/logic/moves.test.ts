import { START_FEN } from "@boardgames/core/games/chess/engine/fen";
import type { HistoryEntry } from "@boardgames/core/games/chess/schemas";
import { describe, expect, it } from "vitest";
import { formatClock, material, moveMap, movesBetween, premoveMap, uciFrom, uciTo } from "./moves";

const entry = (by: "w" | "b", captured: HistoryEntry["captured"]): HistoryEntry => ({
  uci: "e2e4",
  san: "x",
  by,
  clockMs: null,
  captured,
});

describe("board move logic", () => {
  it("groups moves by origin, drops by pocket key", () => {
    const map = moveMap(["e7e8q", "e7e8n", "g1f3", "N@f3"]);
    expect(movesBetween(map, "e7", "e8")).toEqual(["e7e8q", "e7e8n"]);
    expect(movesBetween(map, "N@", "f3")).toEqual(["N@f3"]);
    expect(movesBetween(map, "g1", "h3")).toEqual([]);
    expect(uciTo("N@f3")).toBe("f3");
    expect(uciFrom("N@f3")).toBeNull();
  });

  it("offers premoves for the waiting side, including onto defended squares", () => {
    const fen = "4k3/8/8/8/8/8/4P3/R3K3 b - - 0 1"; // Black to move; White may premove
    const map = premoveMap(fen, "w");
    expect(movesBetween(map, "e2", "e4")).toEqual(["e2e4"]);
    expect(movesBetween(map, "a1", "a8")).toEqual(["a1a8"]);
    expect(premoveMap("not a fen", "w").size).toBe(0);
  });

  it("counts captures and the material lead", () => {
    const m = material("4k3/8/8/8/8/8/8/R3K3 w - - 0 1", [
      entry("w", "q"),
      entry("b", "p"),
      entry("w", "p"),
    ]);
    expect(m.taken.w).toEqual(["q", "p"]);
    expect(m.taken.b).toEqual(["p"]);
    expect(m.lead).toBe(5);
    expect(material(START_FEN, []).lead).toBe(0);
  });

  it("formats clocks like a chess clock", () => {
    expect(formatClock(180_000)).toBe("3:00");
    expect(formatClock(61_200)).toBe("1:02");
    expect(formatClock(9_870)).toBe("9.8");
    expect(formatClock(-5)).toBe("0.0");
    expect(formatClock(3_725_000)).toBe("1:02:05");
  });
});
