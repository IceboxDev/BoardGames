import type { Action } from "@boardgames/core/games/connect-4/types";
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useMoveSender } from "./useMoveSender";

const legal: Action[] = [
  { type: "drop", column: 0 },
  { type: "drop", column: 3 },
  { type: "pop", column: 3 },
  { type: "resign" },
];

afterEach(() => vi.useRealTimers());

describe("useMoveSender", () => {
  it("sends one move per position, however fast the clicks", () => {
    const send = vi.fn();
    const { result, rerender } = renderHook(
      ({ position }) => useMoveSender(legal, send, position),
      {
        initialProps: { position: "0:4" },
      },
    );
    act(() => result.current.drop(3));
    act(() => result.current.drop(3));
    act(() => result.current.pop(3));
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith({ type: "drop", column: 3 });
    expect(result.current.pending).toBe(true);
    // The server's next position releases the board.
    rerender({ position: "0:5" });
    expect(result.current.pending).toBe(false);
  });

  it("ignores moves that aren't legal", () => {
    const send = vi.fn();
    const { result } = renderHook(() => useMoveSender(legal, send, "0:0"));
    act(() => result.current.drop(5));
    expect(send).not.toHaveBeenCalled();
    expect(result.current.pending).toBe(false);
  });

  it("frees the board if the server never answers", () => {
    vi.useFakeTimers();
    const send = vi.fn();
    const { result } = renderHook(() => useMoveSender(legal, send, "0:0"));
    act(() => result.current.drop(0));
    expect(result.current.pending).toBe(true);
    act(() => vi.advanceTimersByTime(3_000));
    expect(result.current.pending).toBe(false);
    act(() => result.current.drop(0));
    expect(send).toHaveBeenCalledTimes(2);
  });
});
