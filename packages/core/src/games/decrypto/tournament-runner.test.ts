import { describe, expect, it } from "vitest";
import { decryptoSimulator } from "./tournament-runner";

// The model-free fallback only: no TOURNAMENT_LLM, so no model is ever called.
describe("decrypto tournament simulator", () => {
  it.each([3, 4])("plays a %i-seat game to a team outcome", async (seats) => {
    const strategies = Array.from({ length: seats }, (_, s) =>
      s < 2 ? "decrypto-medium" : "decrypto-expert",
    );
    const outcome = await decryptoSimulator.simulate({ strategies, seed: 42 });
    expect(outcome.kind).toBe("teams");
    if (outcome.kind !== "teams") return;
    expect(outcome.teamOf).toEqual(decryptoSimulator.sides?.(seats, 42));
  });
});
