import "@testing-library/jest-dom/vitest";

import { cleanup, configure } from "@testing-library/react";
import { MotionGlobalConfig } from "framer-motion";
import { afterEach, beforeEach, vi } from "vitest";

// `findBy*` / `waitFor` give up after this long — the only way "it never
// appeared" can be seen. One value in every mode (docs/testing.md): when a
// file fails, scripts/test-run.mjs reruns it alone with
// VITEST_ARBITRATION=1, where the wait is the whole hang guard, so a slow
// machine can never be the reason a find fails.
configure({ asyncUtilTimeout: process.env.VITEST_ARBITRATION ? 120_000 : 10_000 });

// Animations add nothing to what a test checks, and the never-ending ones
// (`repeat: Infinity` pulses) keep a worker's CPU busy for the whole file.
MotionGlobalConfig.skipAnimations = true;

function makeStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? (store.get(key) ?? null) : null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
  };
}

beforeEach(() => {
  // Map-backed Storage polyfill. Required because jsdom 29 under Node 25
  // installs a stub `window.localStorage` object that lacks setItem/getItem —
  // Node's experimental storage feature collides with jsdom's. Replacing it
  // fresh on every test gives us a faithful, isolated implementation.
  Object.defineProperty(window, "localStorage", { value: makeStorage(), configurable: true });
  Object.defineProperty(window, "sessionStorage", { value: makeStorage(), configurable: true });

  if (typeof window.ResizeObserver === "undefined") {
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
  if (typeof window.matchMedia === "undefined") {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }),
    });
  }
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  // localStorage / sessionStorage get replaced fresh in the next beforeEach,
  // so no explicit clear is needed here.
});
