import { describe, expect, it } from "vitest";
import { createRng } from "../../lib/rng.ts";
import { createFixtureQuestionSource } from "./question-source.ts";
import { createGame } from "./setup.ts";
import { newGame } from "./test-helpers.ts";
import { QuiztopiaStartConfigSchema } from "./types.ts";

describe("createGame", () => {
  it.each([1, 2, 3, 4, 5, 6])("starts %i players with playerCount + 2 dark buildings", (n) => {
    const gs = newGame({ playerCount: n });
    expect(gs.buildings).toHaveLength(12);
    expect(gs.buildings.filter((b) => b === "dark")).toHaveLength(n + 2);
    expect(gs.buildings.filter((b) => b === "bright")).toHaveLength(12 - n - 2);
    expect(gs.buildings).not.toContain("won");
    expect(gs.buildings).not.toContain("lost");
  });

  it("deals 24 distinct cards from the chosen deck", () => {
    const gs = newGame({ playerCount: 3 });
    expect(gs.drawPile).toHaveLength(24);
    expect(new Set(gs.drawPile).size).toBe(24);
    const refs = createFixtureQuestionSource().listCardRefs("original");
    for (const ref of gs.drawPile) expect(refs).toContain(ref);
    expect(gs.cardsUsed).toBe(0);
  });

  it("the extended deck draws virtual cards too", () => {
    const gs = newGame({ playerCount: 3, deck: "extended", seed: 7 });
    expect(gs.deck).toBe("extended");
    expect(gs.drawPile.some((r) => /-v[1-4]$/.test(r))).toBe(true);
  });

  it("uses all six help cards at a table and one face-up", () => {
    const gs = newGame({ playerCount: 4 });
    expect(gs.helpDeck).toHaveLength(6);
    expect(new Set(gs.helpDeck.map((c) => c.id)).size).toBe(6);
    expect(gs.helpDeck.every((c) => !c.used)).toBe(true);
    expect(gs.helpOpen).toBe(1);
  });

  it("solo drops the three cards that need other players", () => {
    const gs = newGame({ playerCount: 1 });
    const ids = gs.helpDeck.map((c) => c.id).sort();
    expect(ids).toEqual(["alternative-fakten", "besetzung", "streik"]);
    expect(gs.helpOpen).toBe(1);
  });

  it.each([
    [0, 4],
    [1, 3],
    [2, 2],
    [3, 2],
  ])("expert at difficulty %i starts with %i tip cards", (difficulty, total) => {
    const gs = newGame({ playerCount: 2, expert: true, difficulty });
    expect(gs.expert).toBe(true);
    expect(gs.tipCards).toEqual({ total, active: total });
  });

  it("standard mode has no tip cards", () => {
    expect(newGame({ playerCount: 2, expert: false }).tipCards).toBeNull();
  });

  it("solo forces expert off", () => {
    const gs = newGame({ playerCount: 1, expert: true, difficulty: 0 });
    expect(gs.expert).toBe(false);
    expect(gs.tipCards).toBeNull();
  });

  it("is deterministic per seed", () => {
    const a = newGame({ playerCount: 3, seed: 42 });
    const b = newGame({ playerCount: 3, seed: 42 });
    expect(a).toEqual(b);
    const c = newGame({ playerCount: 3, seed: 43 });
    expect(c.drawPile).not.toEqual(a.drawPile);
  });

  it("accepts an explicit rng and records the seed", () => {
    const config = QuiztopiaStartConfigSchema.parse({ playerCount: 2, seed: 99 });
    const gs = createGame(config, { source: createFixtureQuestionSource(), rng: createRng(99) });
    expect(gs).toEqual(newGame({ playerCount: 2, seed: 99 }));
    expect(gs.seed).toBe(99);
  });

  it("opens with the first listed seat and the seat to its right reading", () => {
    const gs = newGame({ playerCount: 3, seats: [0, 2, 5] });
    expect(gs.phase).toBe("choose-building");
    expect(gs.turn.index).toBe(1);
    expect(gs.turn.activeSeat).toBe(0);
    expect(gs.turn.readerSeat).toBe(5);
    expect(gs.seats).toEqual([0, 2, 5]);
  });

  it("defaults seats to 0..n-1 and has no reader alone", () => {
    const gs = newGame({ playerCount: 1 });
    expect(gs.seats).toEqual([0]);
    expect(gs.turn.readerSeat).toBeNull();
    expect(newGame({ playerCount: 4 }).seats).toEqual([0, 1, 2, 3]);
  });

  it("carries the config through", () => {
    const gs = newGame({ playerCount: 2, difficulty: 2, language: "de", seed: 5 });
    expect(gs.difficulty).toBe(2);
    expect(gs.language).toBe("de");
    expect(gs.seed).toBe(5);
    expect(gs.bakery).toBe(false);
    expect(gs.outcome).toBeNull();
    expect(gs.questionLog).toEqual([]);
  });

  it("throws when the deck cannot fill a game", () => {
    const config = QuiztopiaStartConfigSchema.parse({ playerCount: 2, seed: 1 });
    expect(() => createGame(config, { source: createFixtureQuestionSource(10) })).toThrow(
      /needs 24/,
    );
  });

  it("throws on a seat list that does not match the count", () => {
    const config = QuiztopiaStartConfigSchema.parse({ playerCount: 2, seed: 1 });
    expect(() =>
      createGame({ ...config, seats: [0, 1, 2] }, { source: createFixtureQuestionSource() }),
    ).toThrow(/distinct/);
  });
});
