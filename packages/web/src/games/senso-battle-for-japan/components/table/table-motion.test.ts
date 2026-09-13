import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { INSTANT, playedCardVariants, SWEEP_DELAY_MS, useSettleSweep } from "./table-motion";

const plate = { x: 100, y: 900 };
const slot = { x: 800, y: 740 };
const winner = { x: 1450, y: 500 };

function resolve(v: unknown, custom: unknown) {
  return typeof v === "function" ? v(custom) : v;
}

describe("playedCardVariants", () => {
  it("enters from its own plate and lands on its slot", () => {
    const v = playedCardVariants(plate, slot, false);
    expect(resolve(v.enter, null)).toMatchObject({ x: -700, y: 160, opacity: 0 });
    expect(resolve(v.land, null)).toMatchObject({ x: 0, y: 0, opacity: 1, scale: 1 });
  });

  it("sweeps and exits toward the winner's plate, or stays put without one", () => {
    const v = playedCardVariants(plate, slot, false);
    expect(resolve(v.sweep, winner)).toMatchObject({ x: 650, y: -240, opacity: 0 });
    expect(resolve(v.exit, winner)).toMatchObject({ x: 650, y: -240 });
    expect(resolve(v.exit, null)).toMatchObject({ x: 0, y: 0 });
  });

  it("does not fly under reduced motion", () => {
    const v = playedCardVariants(plate, slot, true);
    expect(resolve(v.enter, null)).toMatchObject({ x: 0, y: 0, opacity: 1 });
    expect(resolve(v.land, null)).toMatchObject({ transition: INSTANT });
    expect(resolve(v.sweep, winner)).toMatchObject({ transition: INSTANT });
  });
});

describe("useSettleSweep", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("flips on after the delay and resets when the key changes or clears", () => {
    const { result, rerender } = renderHook(
      ({ key, reduce }: { key: string | null; reduce: boolean }) => useSettleSweep(key, reduce),
      { initialProps: { key: "2:3", reduce: false } as { key: string | null; reduce: boolean } },
    );
    expect(result.current).toBe(false);
    act(() => vi.advanceTimersByTime(SWEEP_DELAY_MS - 1));
    expect(result.current).toBe(false);
    act(() => vi.advanceTimersByTime(1));
    expect(result.current).toBe(true);
    rerender({ key: null, reduce: false });
    expect(result.current).toBe(false);
    rerender({ key: "2:4", reduce: false });
    act(() => vi.advanceTimersByTime(SWEEP_DELAY_MS));
    expect(result.current).toBe(true);
  });

  it("never arms under reduced motion", () => {
    const { result } = renderHook(() => useSettleSweep("2:3", true));
    act(() => vi.advanceTimersByTime(SWEEP_DELAY_MS * 2));
    expect(result.current).toBe(false);
  });
});
