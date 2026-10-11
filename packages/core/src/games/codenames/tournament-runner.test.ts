import { describe, expect, it, vi } from "vitest";
import { duetSimulator } from "../codenames-duet/tournament-runner";
import { codenamesSimulator } from "./tournament-runner";

// Only the keyless stand-in: without TOURNAMENT_LLM the runners never load the
// server's model agent, so these games make no network call.
describe("Codenames tournament runners (keyless stand-in)", () => {
  it("plays a four-seat game to a team outcome", async () => {
    vi.stubEnv("TOURNAMENT_LLM", "");
    const outcome = await codenamesSimulator.simulate({
      strategies: ["codenames-medium", "codenames-hard", "codenames-medium", "codenames-hard"],
      seed: 7,
    });
    expect(outcome.kind).toBe("teams");
    vi.unstubAllEnvs();
  });

  it("plays a Duet game to a co-op outcome", async () => {
    vi.stubEnv("TOURNAMENT_LLM", "");
    const outcome = await duetSimulator.simulate({
      strategies: ["codenames-expert", "codenames-expert"],
      seed: 7,
    });
    expect(outcome.kind).toBe("coop");
    vi.unstubAllEnvs();
  });
});
