import { describe, expect, it } from "vitest";
import { CHARACTERS } from "../characters.ts";
import { apparentCharacter, currentNightStep, nightQueue, nightStepId } from "../companion.ts";
import { suggestedInfo } from "../info.ts";
import { BotcConfigSchema } from "../manifest.ts";
import { wakePrompt, wakersOf } from "../wake-prompts.ts";
import {
  type OnlineAction,
  type PlayerAction,
  StorytellerActionSchema,
  type StorytellerMove,
} from "./actions.ts";
import { applyOnline, chairOf, playerOf, roomSeatOf, tickVote } from "./apply.ts";
import { createOnlineGame } from "./create.ts";
import type { BotcOnline } from "./state.ts";
import { PlayerViewSchema, playerView, StorytellerViewSchema, storytellerView } from "./view.ts";

const NOW = 1_000_000;

/** Grimoire-only keys that must never appear in a player's view before the game ends. */
const TRUTH_KEYS = [
  "poisoned",
  "redHerring",
  "registersDead",
  "believedCharacter",
  "demonBluffs",
  "nightProgress",
  "infoGiven",
  "butlerMaster",
  "drunkNights",
  "rngState",
  "companion",
  "grimoire",
];

/** Every character id a view names (by the keys that carry one). */
function charactersIn(value: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) for (const v of value) charactersIn(v, out);
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      if ((k === "character" || k === "traveller") && typeof v === "string") out.add(v);
      else if ((k === "characters" || k === "bluffs") && Array.isArray(v)) {
        for (const c of v) if (typeof c === "string") out.add(c);
      } else charactersIn(v, out);
    }
  }
  return out;
}

function keysIn(value: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) for (const v of value) keysIn(v, out);
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      out.add(k);
      keysIn(v, out);
    }
  }
  return out;
}

/** Nothing in any player's view that isn't theirs to know. */
function assertRedacted(game: BotcOnline): void {
  StorytellerViewSchema.parse(storytellerView(game));
  for (let seat = 1; seat < game.names.length; seat++) {
    const view = PlayerViewSchema.parse(playerView(game, seat));
    if (game.stage === "over") continue;
    const keys = keysIn(view);
    for (const k of TRUTH_KEYS) expect(keys.has(k), `seat ${seat} sees "${k}"`).toBe(false);
    const allowed = new Set<string>();
    if (view.me.shown) allowed.add(view.me.shown.character);
    for (const d of view.me.inbox) for (const c of charactersIn(d)) allowed.add(c);
    for (const t of view.town) if (t.traveller) allowed.add(t.traveller);
    for (const c of charactersIn(view)) {
      expect(allowed.has(c), `seat ${seat} sees the ${c}`).toBe(true);
    }
    for (const w of view.whispers) expect(w.from === seat || w.to === seat).toBe(true);
  }
}

class Table {
  game: BotcOnline;
  now = NOW;
  constructor(
    players: number,
    opts: { edition?: "trouble-brewing" | "bad-moon-rising"; seed?: number } = {},
  ) {
    this.game = createOnlineGame({
      names: ["Story", ...Array.from({ length: players }, (_, i) => `P${i + 1}`)],
      config: BotcConfigSchema.parse({ edition: opts.edition ?? "trouble-brewing" }),
      seed: opts.seed ?? 42,
    });
    assertRedacted(this.game);
  }
  /** Apply, expecting success. */
  do(seat: number, action: OnlineAction): this {
    const r = applyOnline(this.game, seat, action, this.now);
    if (!r.ok) throw new Error(`seat ${seat} ${action.kind}: ${r.reason}`);
    this.game = r.game;
    assertRedacted(this.game);
    return this;
  }
  /** Apply, expecting a refusal; returns the reason. */
  refuse(seat: number, action: OnlineAction): string {
    const r = applyOnline(this.game, seat, action, this.now);
    if (r.ok) throw new Error(`seat ${seat} ${action.kind} should have been refused`);
    return r.reason;
  }
  st(action: StorytellerMove): this {
    return this.do(0, StorytellerActionSchema.parse({ ...action, rev: this.game.rev }));
  }
  player(seat: number, action: PlayerAction): this {
    return this.do(seat, action);
  }
  get companion() {
    if (!this.game.companion) throw new Error("not dealt");
    return this.game.companion;
  }
  /** Run the whole night: wake each step, answer prompts with the first legal picks, send the truth. */
  runNight(): this {
    for (let guard = 0; guard < 80; guard++) {
      const state = this.companion;
      const step = currentNightStep(state);
      if (!step || step.kind === "dawn") break;
      const id = nightStepId(step);
      if (wakersOf(state, step).length > 0) this.st({ kind: "wake", stepId: id });
      if (this.game.wake) {
        for (const seat of this.game.wake.seats) {
          const chair = chairOf(this.game, seat);
          if (chair === undefined) continue;
          const prompt = wakePrompt(state, step);
          if (prompt.kind === "players" && prompt.min > 0) {
            const picks = state.players
              .filter(
                (p) =>
                  (prompt.allowSelf || p.seat !== chair) &&
                  !prompt.excluded.includes(p.seat) &&
                  (prompt.filter !== "dead" || !this.game.publicLife[p.roomSeat ?? 0]) &&
                  (prompt.filter !== "alive" || this.game.publicLife[p.roomSeat ?? 0]),
              )
              .slice(0, prompt.min)
              .map((p) => p.roomSeat ?? 0);
            this.player(seat, { kind: "night-choice", stepId: id, choice: { seats: picks } });
          }
        }
        const told = suggestedInfo(state, step, {
          seatId: (c) => roomSeatOf(this.game, c) ?? 0,
          choice: { seats: [] },
          rng: () => 0.3,
        });
        if (told) {
          this.st({
            kind: "send-info",
            to: [...this.game.wake.seats],
            payload: told.payload,
            record: true,
          });
        }
        this.st({ kind: "sleep" });
      }
      this.st({ kind: "grimoire", action: { type: "moveNightCursor", delta: 1 } });
    }
    return this.st({ kind: "dawn" });
  }
}

/** A dealt TB table with characters revealed and night 1 begun. */
function startedTable(players = 7, seed = 42): Table {
  const t = new Table(players, { seed });
  t.st({ kind: "deal" }).st({ kind: "reveal-characters" });
  for (let s = 1; s <= players; s++) t.player(s, { kind: "ack-character" });
  return t.st({ kind: "begin-night" });
}

describe("online setup", () => {
  it("deals the same town from the same seed", () => {
    const a = new Table(8, { seed: 7 }).st({ kind: "deal" });
    const b = new Table(8, { seed: 7 }).st({ kind: "deal" });
    expect(a.companion.players.map((p) => p.character)).toEqual(
      b.companion.players.map((p) => p.character),
    );
  });

  it("seats Travellers outside the bag and keeps every person's room seat", () => {
    const t = new Table(8);
    t.st({
      kind: "setup-traveller",
      roomSeat: 3,
      traveller: { character: "scapegoat", alignment: "evil" },
    });
    expect(t.game.setup?.bag?.bagTokens).toHaveLength(7);
    t.st({ kind: "setup-order", order: [8, 7, 6, 5, 4, 3, 2, 1] }).st({ kind: "deal" });
    expect(t.companion.players.map((p) => p.roomSeat)).toEqual([8, 7, 6, 5, 4, 3, 2, 1]);
    expect(playerOf(t.game, 3)?.character).toBe("scapegoat");
    // The town sees the Traveller's character, not their alignment.
    const town = playerView(t.game, 1).town.find((x) => x.seat === 3);
    expect(town).toEqual({
      seat: 3,
      alive: true,
      ghostVote: true,
      left: false,
      traveller: "scapegoat",
    });
  });

  it("refuses a bag outside 5–15 residents, and the deal with it", () => {
    const t = new Table(5);
    t.st({
      kind: "setup-traveller",
      roomSeat: 1,
      traveller: { character: null, alignment: "good" },
    });
    expect(t.game.setup?.bag).toBeNull();
    expect(t.refuse(0, { kind: "deal", rev: t.game.rev })).toMatch(/at least 5 residents/);
  });

  it("shows each player what they believe they are", () => {
    const t = startedTable(10, 3);
    for (const p of t.companion.players) {
      const view = playerView(t.game, p.roomSeat ?? 0);
      expect(view.me.shown?.character).toBe(apparentCharacter(p));
    }
  });

  it("keeps the Storyteller's moves for the Storyteller, and stale ones out", () => {
    const t = new Table(7);
    expect(t.refuse(2, { kind: "deal", rev: t.game.rev })).toBe("Only the Storyteller can do that");
    expect(t.refuse(0, { kind: "deal", rev: t.game.rev + 1 })).toMatch(/Grimoire changed/);
  });
});

describe("online night", () => {
  it("wakes a player, takes their answer, and delivers what they learn", () => {
    const t = startedTable(8, 5);
    const step = nightQueue(t.companion).find((s) => s.kind === "wake");
    if (!step || step.kind !== "wake") throw new Error("nobody wakes");
    const seat = roomSeatOf(t.game, step.seat) ?? 0;
    const other = t.game.names.findIndex((_, i) => i > 0 && i !== seat);
    t.st({ kind: "wake", stepId: nightStepId(step) });
    expect(playerView(t.game, seat).me.wake?.stepId).toBe(nightStepId(step));
    expect(playerView(t.game, other).me.wake).toBeNull();
    // Someone not awake can't answer.
    expect(
      t.refuse(other, { kind: "night-choice", stepId: nightStepId(step), choice: { seats: [] } }),
    ).toBe("You aren't awake for that");
    t.st({
      kind: "send-info",
      to: [seat],
      payload: { kind: "number", value: 1, label: "test" },
      record: true,
    });
    expect(playerView(t.game, seat).me.inbox.at(-1)?.payload).toEqual({
      kind: "number",
      value: 1,
      label: "test",
    });
    expect(playerView(t.game, other).me.inbox.some((d) => d.payload.kind === "number")).toBe(false);
  });

  it("delivers the first night's info (so the redaction checks see real secrets)", () => {
    const t = startedTable(8, 5).runNight();
    const delivered = t.game.inbox.flat().filter((d) => d.payload.kind !== "you-are");
    expect(delivered.length).toBeGreaterThan(2);
    // The Minions and the Demon learned each other.
    expect(delivered.some((d) => d.payload.kind === "evil-team")).toBe(true);
  });

  it("keeps a night death secret until dawn", () => {
    const t = startedTable(7);
    const victim = t.companion.players[2]?.roomSeat ?? 0;
    t.st({ kind: "grimoire", action: { type: "kill", seat: 2, cause: "demon" } });
    expect(playerView(t.game, 1).town.find((x) => x.seat === victim)?.alive).toBe(true);
    t.st({ kind: "dawn" });
    expect(playerView(t.game, 1).town.find((x) => x.seat === victim)?.alive).toBe(false);
    expect(t.game.timeline.map((e) => e.text)).toContain(
      `${t.game.names[victim]} died in the night.`,
    );
  });

  it("refuses public chat while the town sleeps but lets a player whisper the Storyteller", () => {
    const t = startedTable(7);
    expect(t.refuse(1, { kind: "chat", text: "hi" })).toBe("The town is asleep");
    expect(t.refuse(1, { kind: "whisper", to: 2, text: "psst" })).toBe("The town is asleep");
    t.player(1, { kind: "whisper", to: 0, text: "help" });
  });
});

describe("online day", () => {
  function dayTable(): Table {
    const t = startedTable(7, 9).runNight();
    return t.st({ kind: "nominations", open: true });
  }

  it("runs a nomination, a clock-hand vote and an execution", () => {
    const t = dayTable();
    const [nominator, nominee] = t.game.names
      .map((_, i) => i)
      .filter((i) => i > 0 && t.game.publicLife[i]);
    if (nominator === undefined || nominee === undefined) throw new Error("no living players");
    t.player(nominator, { kind: "nominate", nominee });
    expect(t.refuse(nominator, { kind: "nominate", nominee })).toBe(
      "Finish the current vote first",
    );
    const vote = t.game.day.vote;
    if (!vote) throw new Error("no vote");
    expect(vote.order.at(-1)).toBe(nominee);
    // Every living player raises a hand.
    for (const s of vote.order) if (t.game.publicLife[s]) t.player(s, { kind: "hand", up: true });
    t.st({ kind: "start-vote" });
    t.game = tickVote(t.game, t.now + t.game.config.voteClockMs * vote.order.length + 1);
    expect(t.game.day.vote?.status).toBe("done");
    expect(t.refuse(nominee, { kind: "hand", up: false })).toBe("The clock has passed you");
    t.st({ kind: "confirm-vote" });
    expect(t.game.day.vote?.result?.outcome).toMatch(/about to die/);
    t.st({ kind: "execute" });
    expect(t.game.timeline.some((e) => e.text.includes("is executed"))).toBe(true);
  });

  it("lets the dead spend one ghost vote and no more", () => {
    const t = dayTable();
    const dead = t.companion.players[0]?.roomSeat ?? 1;
    t.st({ kind: "grimoire", action: { type: "kill", seat: 0, cause: "storyteller" } });
    expect(playerView(t.game, 2).town.find((x) => x.seat === dead)?.alive).toBe(false);
    expect(t.refuse(dead, { kind: "nominate", nominee: 2 })).toBe("The dead can't nominate");
    const nominator = t.game.names.findIndex((_, i) => i > 0 && i !== dead && t.game.publicLife[i]);
    const nominee = t.game.names.findIndex(
      (_, i) => i > 0 && i !== dead && i !== nominator && t.game.publicLife[i],
    );
    t.player(nominator, { kind: "nominate", nominee });
    t.player(dead, { kind: "hand", up: true });
    t.st({ kind: "start-vote" });
    t.game = tickVote(t.game, t.now + 60_000);
    t.st({ kind: "confirm-vote" });
    expect(playerOf(t.game, dead)?.ghostVote).toBe(false);
    t.st({ kind: "cancel-vote" });
    const next = t.game.names.findIndex(
      (_, i) => i > 0 && i !== dead && i !== nominator && i !== nominee && t.game.publicLife[i],
    );
    const third = t.game.names.findIndex(
      (_, i) => i > 0 && ![dead, nominator, nominee, next].includes(i) && t.game.publicLife[i],
    );
    t.player(next, { kind: "nominate", nominee: third });
    expect(t.refuse(dead, { kind: "hand", up: true })).toBe("You have used your ghost vote");
  });

  it("whispers reach only the pair, and the Storyteller reads them", () => {
    const t = dayTable();
    t.player(1, { kind: "whisper", to: 2, text: "I'm the Chef" });
    expect(playerView(t.game, 2).whispers.at(-1)?.text).toBe("I'm the Chef");
    expect(playerView(t.game, 3).whispers).toEqual([]);
    expect(playerView(t.game, 3).whisperTicker.at(-1)).toMatchObject({ from: 1, to: 2 });
    expect(storytellerView(t.game).whispers.at(-1)?.text).toBe("I'm the Chef");
  });

  it("undoes an execution's truth but leaves what the town heard, struck through", () => {
    const t = dayTable();
    const victim = t.companion.players[1]?.roomSeat ?? 0;
    t.st({ kind: "grimoire", action: { type: "kill", seat: 1, cause: "storyteller" } });
    const said = t.game.timeline.at(-1);
    expect(said?.text).toMatch(/dies/);
    t.st({ kind: "undo" });
    expect(t.game.publicLife[victim]).toBe(true);
    expect(t.game.timeline.find((e) => e.id === said?.id)?.retracted).toBe(true);
    t.st({ kind: "redo" });
    expect(t.game.publicLife[victim]).toBe(false);
  });

  it("ends with the whole truth revealed and a moderated outcome", () => {
    const t = dayTable();
    t.st({ kind: "end-game", winner: "evil", reason: "test" });
    expect(t.game.stage).toBe("over");
    const view = playerView(t.game, 1);
    expect(view.reveal?.grimoire.players).toHaveLength(7);
    expect(t.game.timeline.at(-1)?.text).toBe("Evil wins — test");
    // Still talking after the game.
    t.player(2, { kind: "chat", text: "gg" });
  });
});

describe("Bad Moon Rising online", () => {
  it("plays two nights and days to the end without leaking", () => {
    const t = new Table(10, { edition: "bad-moon-rising", seed: 21 });
    t.st({ kind: "deal" }).st({ kind: "reveal-characters" });
    for (let s = 1; s <= 10; s++) t.player(s, { kind: "ack-character" });
    t.st({ kind: "begin-night" }).runNight();
    t.st({ kind: "end-day" }).runNight();
    for (const p of t.companion.players) {
      expect(CHARACTERS[apparentCharacter(p)]).toBeDefined();
    }
    t.st({ kind: "end-game", winner: "good", reason: "test" });
    expect(t.game.stage).toBe("over");
  });
});

describe("payload budget", () => {
  it("keeps a full table's player view small after a long evening's talk", () => {
    const t = new Table(20, { seed: 4 });
    for (const seat of [16, 17, 18, 19, 20]) {
      t.st({
        kind: "setup-traveller",
        roomSeat: seat,
        traveller: { character: null, alignment: "good" },
      });
    }
    t.st({ kind: "deal" });
    // A long day's talk, applied directly (the redaction check per step would be slow here).
    let game = t.game;
    for (let i = 0; i < 1200; i++) {
      const r = applyOnline(
        game,
        1 + (i % 20),
        { kind: "chat", text: `message number ${i} — `.repeat(3) },
        NOW + i,
      );
      if (!r.ok) throw new Error(r.reason);
      game = r.game;
    }
    const started = performance.now();
    let largest = 0;
    for (let seat = 0; seat < game.names.length; seat++) {
      const size = JSON.stringify(
        seat === 0 ? storytellerView(game) : playerView(game, seat),
      ).length;
      if (seat > 0) largest = Math.max(largest, size);
    }
    const elapsed = performance.now() - started;
    expect(game.chat.length).toBeLessThanOrEqual(1000);
    expect(largest).toBeLessThan(64 * 1024);
    // Generous: 21 projections per transition must stay far from blocking the server.
    expect(elapsed).toBeLessThan(500);
  });
});
