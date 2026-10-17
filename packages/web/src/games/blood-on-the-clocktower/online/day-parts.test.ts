import { BotcConfigSchema } from "@boardgames/core/games/blood-on-the-clocktower/manifest";
import {
  nextBotPlan,
  runBotPlan,
} from "@boardgames/core/games/blood-on-the-clocktower/online/bots";
import { createOnlineGame } from "@boardgames/core/games/blood-on-the-clocktower/online/create";
import type { BotcOnline } from "@boardgames/core/games/blood-on-the-clocktower/online/state";
import { playerView } from "@boardgames/core/games/blood-on-the-clocktower/online/view";
import { describe, expect, it } from "vitest";
import {
  announcementOf,
  clockReachesAt,
  type DayPartId,
  dayPartOf,
  formatCountdown,
  trackStepOf,
} from "./day-parts";

/** A whole bot game, with every part each step of the way passed through, in order. */
function playThrough(seed: number) {
  let game: BotcOnline = createOnlineGame({
    names: ["Story", "A", "B", "C", "D", "E", "F", "G", "H"],
    config: BotcConfigSchema.parse({}),
    seed,
  });
  const everyone = game.names.map((_, i) => i);
  let now = 1_000_000;
  const parts: DayPartId[] = [dayPartOf(playerView(game, 1))];
  const keys: string[] = [];
  for (let beats = 0; beats < 3000 && game.stage !== "over"; beats++) {
    const plan = nextBotPlan(game, everyone);
    const tick = game.day.vote?.status === "running" ? game.day.vote.nextTickAt : null;
    if (!plan && tick === null) break;
    if (tick !== null && (!plan || tick < plan.at)) {
      now = tick;
      game = {
        ...game,
        day: {
          ...game.day,
          vote: game.day.vote && {
            ...game.day.vote,
            locked: game.day.vote.locked + 1,
            nextTickAt:
              game.day.vote.locked + 1 >= game.day.vote.order.length
                ? null
                : tick + game.config.voteClockMs,
            status: game.day.vote.locked + 1 >= game.day.vote.order.length ? "done" : "running",
          },
        },
      };
    } else if (plan) {
      now = Math.max(now, plan.at);
      game = runBotPlan(game, plan, now).game;
    }
    const view = playerView(game, 1);
    const part = dayPartOf(view);
    if (parts.at(-1) !== part) parts.push(part);
    const key = announcementOf(view)?.key;
    if (key && keys.at(-1) !== key) keys.push(key);
  }
  return { game, parts, keys };
}

describe("the parts of the day", () => {
  const { game, parts, keys } = playThrough(3);

  it("go round in the order the town expects", () => {
    expect(game.stage).toBe("over");
    expect(parts.slice(0, 4)).toEqual(["setup", "reveal", "night", "discussion"]);
    // A vote is always heard out, then the clock runs, then the count.
    parts.forEach((p, i) => {
      if (p === "voting") expect(parts[i - 1]).toBe("defence");
      if (p === "discussion") expect(parts[i - 1]).toBe("night");
      if (p === "night" && i > 2) expect(parts[i - 1]).toBe("dusk");
    });
    expect(parts.at(-1)).toBe("over");
    expect(parts.map(trackStepOf).filter(Boolean)).not.toContain(undefined);
  });

  it("announce each new part once", () => {
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toContain("night:1");
    expect(keys).toContain("discussion:1");
    expect(keys).toContain("nominations:1");
    expect(keys.at(-1)).toBe("over");
  });
});

describe("helpers", () => {
  it("counts down in minutes and seconds", () => {
    expect(formatCountdown(65_000)).toBe("1:05");
    expect(formatCountdown(8_100)).toBe("0:09");
    expect(formatCountdown(-5)).toBe("0:00");
  });

  it("says when the clock reaches a voter, and nothing once it has passed", () => {
    const base = playerView(
      createOnlineGame({
        names: ["S", "A", "B", "C", "D", "E"],
        config: BotcConfigSchema.parse({ voteClockMs: 2000 }),
        seed: 1,
      }),
      1,
    );
    const view = {
      ...base,
      day: {
        ...base.day,
        vote: {
          nominator: 1,
          nominee: 2,
          kind: "execution" as const,
          order: [3, 4, 5, 1, 2],
          hands: [false, false, false, false, false],
          locked: 1,
          status: "running" as const,
          nextTickAt: 10_000,
        },
      },
    };
    expect(clockReachesAt(view, 4)).toBe(10_000);
    expect(clockReachesAt(view, 1)).toBe(14_000);
    expect(clockReachesAt(view, 3)).toBeNull();
  });
});
