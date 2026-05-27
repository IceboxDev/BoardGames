import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createActor } from "xstate";
import { registerStrategy } from "./ai-strategies";
import { placementsExhausted } from "./game-engine";
import { skyTeamMachine } from "./machine";
import { getLegalActionsForPlayer } from "./rules";
import type { PlayerIndex } from "./types";

beforeEach(() => {
  vi.useFakeTimers();
  // The machine logs the fallback path via console.error — silence it here.
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// Regression guard for the "AI is thinking… forever" hang: if the AI emits an
// action the engine rejects (or the strategy throws), the machine used to loop
// aiThinking -> routing -> aiThinking with no progress. pickAiAction now falls
// back to a guaranteed-applicable action, so the game must always progress.
async function driveToCompletion(aiStrategy: string, seed: number): Promise<boolean> {
  const actor = createActor(skyTeamMachine);
  actor.start();
  actor.send({ type: "START", scenarioId: "yul-montreal", humanPlayers: [0], aiStrategy, seed });

  for (let i = 0; i < 500; i++) {
    await vi.runAllTimersAsync();
    const gs = actor.getSnapshot().context.gameState;
    if (!gs) return false;
    if (gs.outcome != null) return true;
    if (gs.phase === "briefing" && !gs.readyForRoll[0]) {
      actor.send({ type: "PLAYER_ACTION", player: 0, action: { kind: "ready-to-roll" } });
    } else if (placementsExhausted(gs)) {
      actor.send({ type: "PLAYER_ACTION", player: 0, action: { kind: "end-round" } });
    } else if (gs.phase === "placement" && gs.toPlace === 0) {
      const place = getLegalActionsForPlayer(gs, 0 as PlayerIndex).find(
        (a) => a.kind === "place-die",
      );
      actor.send({
        type: "PLAYER_ACTION",
        player: 0,
        action: place ?? { kind: "ready-to-roll" },
      });
    }
  }
  return false;
}

describe("sky-team AI loop robustness", () => {
  it("never hangs when the AI strategy throws (falls back to a legal action)", async () => {
    registerStrategy({
      id: "test-throws",
      label: "Throwing",
      description: "Always throws — must be tolerated by the machine.",
      pickAction() {
        throw new Error("boom");
      },
    });
    expect(await driveToCompletion("test-throws", 7)).toBe(true);
  });

  it("never hangs when the AI returns an inapplicable empty reroll", async () => {
    registerStrategy({
      id: "test-empty-reroll",
      label: "Empty reroll",
      description: "Always tries a no-op reroll the engine would reject.",
      pickAction(view) {
        if (view.phase === "briefing" && !view.readyForRoll[view.viewerIndex]) {
          return { kind: "ready-to-roll" };
        }
        return { kind: "spend-reroll", pilotDieIds: [], copilotDieIds: [] };
      },
    });
    expect(await driveToCompletion("test-empty-reroll", 11)).toBe(true);
  });
});
