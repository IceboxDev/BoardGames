import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createActor } from "xstate";
import { botcMachine, botcSpec } from "./machine.ts";
import { BOT_STRATEGY, BotcConfigSchema } from "./manifest.ts";
import { StorytellerActionSchema } from "./online/actions.ts";

const bot = { kind: "ai", strategy: BOT_STRATEGY } as const;

function solo(humanSeat: number, players = 7) {
  const seats = Array.from({ length: players + 1 }, (_, i) =>
    i === humanSeat ? ({ kind: "human" } as const) : bot,
  );
  const actor = createActor(botcMachine).start();
  actor.send(botcSpec.buildStart({ seats, config: BotcConfigSchema.parse({}), seed: 11 }));
  return actor;
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("the machine runs the stand-in bots on its timer", () => {
  it("a person playing a seat: the bot Storyteller deals, shows, and waits for them", async () => {
    const actor = solo(3);
    const game = () => actor.getSnapshot().context.game;
    expect(game()?.names[3]).toBe("You");
    expect(game()?.names[0]).toBe("Storyteller");

    await vi.advanceTimersByTimeAsync(20_000);
    expect(game()?.stage).toBe("reveal");
    expect(game()?.shown[3]?.acknowledged).toBe(false);

    actor.send({ type: "PLAYER_ACTION", player: 3, action: { kind: "ack-character" } });
    await vi.advanceTimersByTimeAsync(20_000);
    expect(game()?.stage).toBe("play");
    actor.stop();
  });

  it("a person as the Storyteller: the bots wait for them, then look and answer", async () => {
    const actor = solo(0);
    const game = () => actor.getSnapshot().context.game;
    await vi.advanceTimersByTimeAsync(20_000);
    expect(game()?.stage).toBe("setup");

    const st = (action: Record<string, unknown>) =>
      actor.send({
        type: "PLAYER_ACTION",
        player: 0,
        action: StorytellerActionSchema.parse({ ...action, rev: game()?.rev ?? 0 }),
      });
    st({ kind: "deal" });
    st({ kind: "reveal-characters" });
    await vi.advanceTimersByTimeAsync(20_000);
    const shown = game()?.shown.slice(1) ?? [];
    expect(shown.every((s) => s?.acknowledged)).toBe(true);
    actor.stop();
  });
});
