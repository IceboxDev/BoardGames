import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";

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

// jsdom doesn't ship ResizeObserver; several primitives (BoardSurface,
// framer-motion measurements) reach for it on mount. A no-op stub is
// enough — none of the tests assert on observed sizes.
beforeEach(() => {
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
