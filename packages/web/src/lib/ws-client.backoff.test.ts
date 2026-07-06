import { describe, expect, it } from "vitest";
import { RECONNECT_BASE_DELAY_MS, RECONNECT_MAX_DELAY_MS, reconnectDelay } from "./ws-client";

describe("reconnectDelay — full-jitter exponential backoff", () => {
  it("returns 0 when the jitter draws zero, for any attempt", () => {
    for (const attempt of [0, 1, 5, 20, 100]) {
      expect(reconnectDelay(attempt, () => 0)).toBe(0);
    }
  });

  it("grows exponentially before the cap (measured at the midpoint of jitter)", () => {
    const mid = (attempt: number) => reconnectDelay(attempt, () => 0.5);
    expect(mid(0)).toBe(RECONNECT_BASE_DELAY_MS / 2); // 500
    expect(mid(1)).toBe(RECONNECT_BASE_DELAY_MS); // 1000
    expect(mid(2)).toBe(RECONNECT_BASE_DELAY_MS * 2); // 2000
    expect(mid(3)).toBe(RECONNECT_BASE_DELAY_MS * 4); // 4000
    // Each step at least doubles until the ceiling saturates.
    expect(mid(2)).toBeGreaterThan(mid(1));
    expect(mid(3)).toBeGreaterThan(mid(2));
  });

  it("caps the ceiling at RECONNECT_MAX_DELAY_MS for large attempts", () => {
    // Jitter just below 1 → delay approaches (ceiling - 1).
    const big = reconnectDelay(100, () => 0.999999);
    expect(big).toBeLessThan(RECONNECT_MAX_DELAY_MS);
    expect(big).toBeGreaterThanOrEqual(RECONNECT_MAX_DELAY_MS - 1);
  });

  it("stays within [0, ceiling) for real random jitter and never gives up", () => {
    for (let attempt = 0; attempt < 12; attempt++) {
      const ceiling = Math.min(RECONNECT_BASE_DELAY_MS * 2 ** attempt, RECONNECT_MAX_DELAY_MS);
      for (let i = 0; i < 200; i++) {
        const delay = reconnectDelay(attempt);
        expect(delay).toBeGreaterThanOrEqual(0);
        expect(delay).toBeLessThan(ceiling);
      }
    }
  });
});
