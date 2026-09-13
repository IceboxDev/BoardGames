import { describe, expect, it } from "vitest";
import { FEATURES, MAX_HIDDEN, type PolicyModel } from "./policy";
import {
  OPPONENT_MODELS,
  opponentModelFor,
  PLAYOUT_MODELS,
  playoutModelFor,
} from "./policy-models";

function expectShaped(model: PolicyModel): void {
  const H = model.hidden;
  expect(H).toBeLessThanOrEqual(MAX_HIDDEN);
  expect(model.w1.length).toBe(H * FEATURES);
  expect(model.b1.length).toBe(H);
  expect(model.w2.length).toBe(H > 0 ? H : FEATURES);
  for (const arr of [model.w1, model.b1, model.w2]) {
    for (let i = 0; i < arr.length; i++) expect(Number.isFinite(arr[i])).toBe(true);
  }
  expect(Number.isFinite(model.b2)).toBe(true);
}

describe("policy model registry", () => {
  it("every registered net has a consistent shape", () => {
    for (const table of [PLAYOUT_MODELS, OPPONENT_MODELS]) {
      expectShaped(table.shared);
      for (const key of Object.keys(table)) {
        if (key !== "shared") expectShaped(table[Number(key)]);
      }
    }
  });

  it("'shared' ignores the table size and 'per-table' falls back where no refit exists", () => {
    for (const n of [2, 3, 4, 5]) {
      expect(playoutModelFor(n, "shared")).toBe(PLAYOUT_MODELS.shared);
      expect(opponentModelFor(n, "shared")).toBe(OPPONENT_MODELS.shared);
      expect(playoutModelFor(n, "per-table")).toBe(PLAYOUT_MODELS[n] ?? PLAYOUT_MODELS.shared);
      expect(opponentModelFor(n, "per-table")).toBe(OPPONENT_MODELS[n] ?? OPPONENT_MODELS.shared);
    }
    // No refit was ever made for four seats.
    expect(PLAYOUT_MODELS[4]).toBeUndefined();
    expect(playoutModelFor(4, "per-table")).toBe(PLAYOUT_MODELS.shared);
    // "playout" weighs deals with the playout net itself, per table when asked.
    expect(opponentModelFor(5, "playout", "per-table")).toBe(PLAYOUT_MODELS[5]);
    expect(opponentModelFor(5, "playout", "shared")).toBe(PLAYOUT_MODELS.shared);
  });
});
