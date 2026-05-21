import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { useGameBackOverride } from "../hooks/useGameBackOverride";
import { GameBackOverrideProvider } from "./GameBackOverrideProvider";

function withProvider({ children }: { children: ReactNode }) {
  return <GameBackOverrideProvider>{children}</GameBackOverrideProvider>;
}

describe("useGameBackOverride", () => {
  it("throws a helpful error when no provider is in the tree", () => {
    // Suppress React's caught-error log noise.
    const orig = console.error;
    console.error = () => {};
    try {
      expect(() => renderHook(() => useGameBackOverride())).toThrow(
        /must be used within GameBackOverrideProvider/,
      );
    } finally {
      console.error = orig;
    }
  });

  it("returns a stable setBackOverride identity across renders", () => {
    const { result, rerender } = renderHook(() => useGameBackOverride(), {
      wrapper: withProvider,
    });
    const first = result.current.setBackOverride;
    rerender();
    expect(result.current.setBackOverride).toBe(first);
  });

  it("setBackOverride writes into the shared ref slot", () => {
    const { result } = renderHook(() => useGameBackOverride(), { wrapper: withProvider });
    expect(result.current.overrideRef.current).toBeNull();
    const fn = () => {};
    act(() => result.current.setBackOverride(fn));
    expect(result.current.overrideRef.current).toBe(fn);
    act(() => result.current.setBackOverride(null));
    expect(result.current.overrideRef.current).toBeNull();
  });

  it("two consumers see the same ref slot (last-write-wins — documents current behavior)", () => {
    // This codifies the current (sometimes-problematic) semantics: there is
    // no stack, so two effects writing into the override clobber each other.
    // If a future change introduces a stack, this test should be updated to
    // describe the new contract.
    const { result } = renderHook(() => useGameBackOverride(), { wrapper: withProvider });
    const a = () => "a";
    const b = () => "b";
    act(() => result.current.setBackOverride(a));
    act(() => result.current.setBackOverride(b));
    expect(result.current.overrideRef.current).toBe(b);
  });
});
