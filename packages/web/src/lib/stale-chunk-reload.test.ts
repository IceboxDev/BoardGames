import { describe, expect, it } from "vitest";
import {
  CHUNK_RELOAD_KEY,
  CHUNK_RELOAD_WINDOW_MS,
  shouldReloadForChunkError,
} from "./stale-chunk-reload";

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    data,
  };
}

describe("shouldReloadForChunkError", () => {
  it("reloads the first time and records when", () => {
    const storage = memoryStorage();
    expect(shouldReloadForChunkError({ now: () => 1_000_000, storage })).toBe(true);
    expect(storage.data.get(CHUNK_RELOAD_KEY)).toBe("1000000");
  });

  it("does not reload again inside the window (no reload loop)", () => {
    const storage = memoryStorage({ [CHUNK_RELOAD_KEY]: "1000000" });
    const now = () => 1_000_000 + CHUNK_RELOAD_WINDOW_MS - 1;
    expect(shouldReloadForChunkError({ now, storage })).toBe(false);
  });

  it("reloads again once the window has passed", () => {
    const storage = memoryStorage({ [CHUNK_RELOAD_KEY]: "1000000" });
    const now = () => 1_000_000 + CHUNK_RELOAD_WINDOW_MS;
    expect(shouldReloadForChunkError({ now, storage })).toBe(true);
  });

  it("never reloads without storage to guard the loop", () => {
    expect(shouldReloadForChunkError({ now: () => 5, storage: null })).toBe(false);
    const throwing = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {},
    };
    expect(shouldReloadForChunkError({ now: () => 5, storage: throwing })).toBe(false);
  });
});
