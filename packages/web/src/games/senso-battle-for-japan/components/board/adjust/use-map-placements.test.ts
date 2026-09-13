import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_PLACEMENTS, MAX_NODE_SCALE } from "../geometry";
import { useMapPlacements } from "./use-map-placements";

function setSearch(search: string) {
  window.history.replaceState(null, "", `${window.location.pathname}${search}`);
}

describe("useMapPlacements", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    setSearch("");
    window.localStorage.clear();
  });

  it("is off without ?adjust in the URL", () => {
    const { result } = renderHook(() => useMapPlacements("landscape"));
    expect(result.current).toBeNull();
  });

  it("starts from the frozen placements, rounds and clamps edits, and remembers them", () => {
    setSearch("?scene=rewards&adjust");
    const { result } = renderHook(() => useMapPlacements("landscape"));
    expect(result.current?.placements).toEqual(DEFAULT_PLACEMENTS.landscape);

    act(() => result.current?.update(2, { x: 10.6, y: 20.2, scale: 9 }));
    expect(result.current?.placements[2]).toEqual({
      x: 11,
      y: 20,
      scale: MAX_NODE_SCALE,
      arrangement: "column",
    });
    expect(result.current?.source).toContain(
      `{ x: 11, y: 20, scale: ${MAX_NODE_SCALE}, arrangement: "column" }, // 3`,
    );

    const saved = JSON.parse(window.localStorage.getItem("senso-map-placements:landscape") ?? "[]");
    expect(saved[2]).toEqual({ x: 11, y: 20, scale: MAX_NODE_SCALE, arrangement: "column" });

    const again = renderHook(() => useMapPlacements("landscape"));
    expect(again.result.current?.placements[2]?.x).toBe(11);
  });

  it("scales every card at once and resets back to the frozen placements", () => {
    setSearch("?adjust");
    const { result } = renderHook(() => useMapPlacements("portrait"));
    act(() => result.current?.scaleAll(1.5));
    const expected = DEFAULT_PLACEMENTS.portrait.map((p) => Math.round(p.scale * 150) / 100);
    expect(result.current?.placements.map((p) => p.scale)).toEqual(expected);
    act(() => result.current?.reset());
    expect(result.current?.placements).toEqual(DEFAULT_PLACEMENTS.portrait);
    expect(window.localStorage.getItem("senso-map-placements:portrait")).toBeNull();
  });
});
