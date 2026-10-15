import { describe, expect, it } from "vitest";
import { BotcConfigSchema } from "../manifest.ts";
import { tickVote } from "./apply.ts";
import { nextBotPlan, runBotPlan } from "./bots.ts";
import { createOnlineGame } from "./create.ts";
import type { BotcOnline } from "./state.ts";

function table(players: number, edition: "trouble-brewing" | "bad-moon-rising", seed: number) {
  return createOnlineGame({
    names: Array.from({ length: players + 1 }, (_, i) => (i === 0 ? "Storyteller" : `P${i}`)),
    config: BotcConfigSchema.parse({ edition }),
    seed,
  });
}

/** Run the bots on a fake clock until nobody has anything to do (or `limit` beats). */
function run(game: BotcOnline, bots: number[], limit = 5000) {
  let now = 1_000_000;
  let beats = 0;
  const skip = new Set<number>();
  let skipAt = -1;
  while (beats < limit) {
    game = tickVote(game, now);
    if (skipAt !== game.log.length) skip.clear();
    const plan = nextBotPlan(game, bots, skip);
    const tick = game.day.vote?.status === "running" ? game.day.vote.nextTickAt : null;
    if (!plan && tick === null) break;
    if (tick !== null && tick !== undefined && (!plan || tick < plan.at)) {
      now = tick;
      continue;
    }
    if (!plan) break;
    now = Math.max(now, plan.at);
    const ran = runBotPlan(game, plan, now);
    if (ran.refused) {
      skip.add(plan.seat);
      skipAt = ran.game.log.length;
    }
    game = ran.game;
    beats += 1;
  }
  return { game, beats };
}

describe("stand-in bots", () => {
  for (const edition of ["trouble-brewing", "bad-moon-rising"] as const) {
    for (const seed of [1, 2, 3, 4]) {
      it(`a bot Storyteller and a bot town finish a ${edition} game (seed ${seed})`, () => {
        const players = 5 + seed * 2;
        const start = table(players, edition, seed);
        const bots = start.names.map((_, i) => i);
        const { game } = run(start, bots);
        expect(game.stage).toBe("over");
        expect(game.companion?.phase.kind).toBe("ended");
        // The Demon kills and the town executes: the game ends before the town runs out.
        const days = game.timeline.filter((t) => / dawns\.$/.test(t.text)).length;
        expect(days).toBeGreaterThan(0);
        expect(days).toBeLessThanOrEqual(players);
      });
    }
  }

  it("the bot Storyteller waits for a person's answer, and a bot town waits for its Storyteller", () => {
    const start = table(7, "trouble-brewing", 9);
    // Everyone but the Storyteller is a bot: nothing moves until the deal.
    const idle = run(start, [1, 2, 3, 4, 5, 6, 7]);
    expect(idle.beats).toBe(0);
    expect(idle.game.stage).toBe("setup");

    // A person in seat 3: the bots deal and reveal, then wait for them to look.
    const waiting = run(start, [0, 1, 2, 4, 5, 6, 7]);
    expect(waiting.game.stage).toBe("reveal");
    expect(waiting.game.shown[3]?.acknowledged).toBe(false);
    expect(waiting.game.shown[1]?.acknowledged).toBe(true);
  });

  it("is deterministic: the same seed plays the same game", () => {
    const a = run(table(8, "trouble-brewing", 5), [0, 1, 2, 3, 4, 5, 6, 7, 8]).game;
    const b = run(table(8, "trouble-brewing", 5), [0, 1, 2, 3, 4, 5, 6, 7, 8]).game;
    expect(b.timeline.map((t) => t.text)).toEqual(a.timeline.map((t) => t.text));
  });
});
