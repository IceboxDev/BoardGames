import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useMediaQuery, WIDE_BOARD_QUERY } from "./useMediaQuery";

// A controllable matchMedia: one shared `matches` flag per query plus the
// listener set the hook subscribes through, so a test can flip the viewport
// and assert the hook re-renders from the external store.
function installMatchMedia() {
  const listeners = new Map<string, Set<() => void>>();
  const state = new Map<string, boolean>();
  const original = window.matchMedia;
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      get matches() {
        return state.get(query) ?? false;
      },
      media: query,
      onchange: null,
      addEventListener: (_: "change", fn: () => void) => {
        if (!listeners.has(query)) listeners.set(query, new Set());
        listeners.get(query)?.add(fn);
      },
      removeEventListener: (_: "change", fn: () => void) => {
        listeners.get(query)?.delete(fn);
      },
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
  return {
    set(query: string, matches: boolean) {
      state.set(query, matches);
      for (const fn of listeners.get(query) ?? []) fn();
    },
    listenerCount: (query: string) => listeners.get(query)?.size ?? 0,
    restore() {
      Object.defineProperty(window, "matchMedia", { configurable: true, value: original });
    },
  };
}

describe("useMediaQuery", () => {
  let mm: ReturnType<typeof installMatchMedia>;
  afterEach(() => mm?.restore());

  it("reads the real match on the first render (no false flash)", () => {
    mm = installMatchMedia();
    mm.set(WIDE_BOARD_QUERY, true);
    const { result } = renderHook(() => useMediaQuery(WIDE_BOARD_QUERY));
    expect(result.current).toBe(true);
  });

  it("re-renders when the query flips and unsubscribes on unmount", () => {
    mm = installMatchMedia();
    const { result, unmount } = renderHook(() => useMediaQuery(WIDE_BOARD_QUERY));
    expect(result.current).toBe(false);
    act(() => mm.set(WIDE_BOARD_QUERY, true));
    expect(result.current).toBe(true);
    expect(mm.listenerCount(WIDE_BOARD_QUERY)).toBe(1);
    unmount();
    expect(mm.listenerCount(WIDE_BOARD_QUERY)).toBe(0);
  });
});
