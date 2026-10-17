import { describe, expect, it } from "vitest";
import { BotcConfigSchema } from "../manifest.ts";
import { applyOnline, tickVote } from "./apply.ts";
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
function run(
  game: BotcOnline,
  bots: number[],
  limit = 5000,
  until: (g: BotcOnline) => boolean = () => false,
) {
  let now = 1_000_000;
  let beats = 0;
  const skip = new Set<number>();
  let skipAt = -1;
  while (beats < limit && !until(game)) {
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
  return { game, beats, now };
}

/** The last entry `ok` accepts (no `findLast` in this lib target). */
function lastOf<T>(list: readonly T[], ok: (x: T) => boolean): T | undefined {
  for (let i = list.length - 1; i >= 0; i--) {
    const x = list[i];
    if (x !== undefined && ok(x)) return x;
  }
  return undefined;
}

type Logged = { seat: number; at: number; kind: string; action: Record<string, unknown> };
function logOf(game: BotcOnline): Logged[] {
  return game.log.map((l) => {
    const action = l.action as Record<string, unknown>;
    return { seat: l.seat, at: l.at, kind: String(action.kind), action };
  });
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
        // It ends by play, not by stalling: days pass, and not endlessly (Bad Moon
        // Rising's protections make long games, but never twice the town).
        const days = game.timeline.filter((t) => / dawns\.$/.test(t.text)).length;
        expect(days).toBeGreaterThan(0);
        expect(days).toBeLessThanOrEqual(players * 2);
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

  describe("pacing: the day is held on timers the town can see", () => {
    const { game } = run(table(8, "trouble-brewing", 5), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
    const log = logOf(game);

    it("talk comes before nominations: the discussion timer runs out first", () => {
      const opens = log.filter((l) => l.kind === "nominations" && l.action.open === true);
      expect(opens.length).toBeGreaterThan(0);
      for (const open of opens) {
        const discussion = lastOf(
          log,
          (l) => l.kind === "timer" && l.action.timer === "discussion" && l.at <= open.at,
        );
        expect(discussion).toBeDefined();
        expect(open.at - (discussion?.at ?? 0)).toBeGreaterThanOrEqual(60_000);
      }
    });

    it("a nomination is heard out before the clock starts, and hands rise only as it runs", () => {
      const starts = log.filter((l) => l.kind === "start-vote");
      expect(starts.length).toBeGreaterThan(0);
      for (const start of starts) {
        const nomination = lastOf(log, (l) => l.kind === "nominate" && l.at <= start.at);
        expect(start.at - (nomination?.at ?? 0)).toBeGreaterThanOrEqual(10_000);
        const raised = log.filter(
          (l) => l.kind === "hand" && l.at > (nomination?.at ?? 0) && l.at < start.at,
        );
        expect(raised).toEqual([]);
      }
    });

    it("every night falls on a quiet moment before anyone is woken", () => {
      for (const fall of game.timeline.filter((t) => / falls\./.test(t.text))) {
        const wake = log.find((l) => l.kind === "wake" && l.at >= fall.at);
        if (wake) expect(wake.at - fall.at).toBeGreaterThanOrEqual(3500);
      }
    });
  });

  it("a person who says they're ready moves the day on without waiting out the timer", () => {
    const everyone = [0, 1, 2, 3, 4, 5, 6, 7];
    const discussing = (g: BotcOnline) => g.day.timer?.kind === "discussion";
    const { game } = run(table(7, "trouble-brewing", 4), everyone, 5000, discussing);
    expect(discussing(game)).toBe(true);
    const timer = game.day.timer;
    if (!timer) throw new Error("no timer");

    // Seat 3 is a person from here on: the Storyteller waits out the timer…
    const bots = everyone.filter((s) => s !== 3);
    // (The bot players are skipped, to read the Storyteller's plan alone.)
    const players = new Set(bots.filter((s) => s !== 0));
    const waiting = nextBotPlan(game, bots, players);
    expect(waiting?.actions[0]).toMatchObject({ kind: "nominations", open: true });
    expect(waiting?.at).toBe(timer.endsAt);

    // …until they say they're ready.
    const ready = applyOnline(game, 3, { kind: "ready", ready: true }, timer.startedAt + 5000);
    if (!ready.ok) throw new Error(ready.reason);
    const early = nextBotPlan(ready.game, bots, players);
    expect(early?.actions[0]).toMatchObject({ kind: "nominations", open: true });
    expect(early?.at).toBeLessThan(timer.endsAt);
  });
});
