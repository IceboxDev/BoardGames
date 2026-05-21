import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { assign, setup } from "xstate";
import { useLocalGame } from "./useLocalGame";

// A tiny test machine: a counter that goes up on INC, down on DEC.
const counterMachine = setup({
  types: {
    context: {} as { count: number },
    events: {} as { type: "INC" } | { type: "DEC" },
  },
}).createMachine({
  id: "counter",
  context: { count: 0 },
  on: {
    INC: { actions: assign({ count: ({ context }) => context.count + 1 }) },
    DEC: { actions: assign({ count: ({ context }) => context.count - 1 }) },
  },
});

describe("useLocalGame", () => {
  it("returns the initial snapshot context", () => {
    const { result } = renderHook(() => useLocalGame(counterMachine));
    expect(result.current.snapshot.context.count).toBe(0);
  });

  it("processes events through send", () => {
    const { result } = renderHook(() => useLocalGame(counterMachine));
    act(() => result.current.send({ type: "INC" }));
    expect(result.current.snapshot.context.count).toBe(1);
    act(() => result.current.send({ type: "INC" }));
    act(() => result.current.send({ type: "DEC" }));
    expect(result.current.snapshot.context.count).toBe(1);
  });

  it("rerenders on every event, exposing the new snapshot", () => {
    const { result } = renderHook(() => useLocalGame(counterMachine));
    act(() => result.current.send({ type: "INC" }));
    act(() => result.current.send({ type: "INC" }));
    act(() => result.current.send({ type: "INC" }));
    expect(result.current.snapshot.context.count).toBe(3);
  });
});
