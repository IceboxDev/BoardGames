import { useCallback, useState } from "react";

// Per-viewer Codenames conveniences, kept in this browser only. Storage can
// be missing or throw (private windows, blocked site data), so every read and
// write is guarded and the default is always the safe behaviour.

const ONE_TAP_KEY = "codenames:one-tap-touch";

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Not remembered — the toggle still works for this visit.
  }
}

/**
 * One-tap touching: a tap on a card touches it at once, with no pick-then-
 * Touch step. Off by default — a touch can't be taken back, so the two-step
 * flow protects everyone until a player opts out of it.
 */
export function useOneTapTouch(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(() => read(ONE_TAP_KEY) === "1");
  const set = useCallback((next: boolean) => {
    setOn(next);
    write(ONE_TAP_KEY, next ? "1" : "0");
  }, []);
  return [on, set];
}
