import { describe, expect, it } from "vitest";
import { createRng } from "../../lib/rng";
import { GUILDS } from "./cards";
import { buildAgeDeck, dealHands } from "./deck";
import { createInitialState } from "./game-engine";
import { cardIdName } from "./types";

describe("deck building", () => {
  it.each([3, 4, 5, 6, 7])("builds correctly sized decks for %i players", (n) => {
    const rng = createRng(42);
    expect(buildAgeDeck(1, n, rng)).toHaveLength(7 * n);
    expect(buildAgeDeck(2, n, rng)).toHaveLength(7 * n);
    expect(buildAgeDeck(3, n, rng)).toHaveLength(7 * n);
  });

  it("age III deck contains exactly playerCount + 2 guilds", () => {
    const guildNames = new Set(GUILDS.map((g) => g.name));
    for (const n of [3, 5, 7]) {
      const deck = buildAgeDeck(3, n, createRng(7));
      const guilds = deck.filter((id) => guildNames.has(cardIdName(id)));
      expect(guilds).toHaveLength(n + 2);
    }
  });

  it("deals 7 unique cards to each player", () => {
    const deck = buildAgeDeck(1, 4, createRng(1));
    const hands = dealHands(deck, 4);
    expect(hands).toHaveLength(4);
    for (const hand of hands) expect(hand).toHaveLength(7);
    expect(new Set(hands.flat()).size).toBe(28);
  });

  it("is deterministic for a fixed seed", () => {
    expect(buildAgeDeck(1, 5, createRng(99))).toEqual(buildAgeDeck(1, 5, createRng(99)));
  });
});

describe("createInitialState", () => {
  it("sets up a 3-player game", () => {
    const state = createInitialState({ playerCount: 3, seed: 42, sideMode: "A" });
    expect(state.players).toHaveLength(3);
    for (const p of state.players) {
      expect(p.coins).toBe(3);
      expect(p.side).toBe("A");
      expect(p.stagesBuilt).toBe(0);
      expect(p.tableau).toEqual([]);
    }
    expect(new Set(state.players.map((p) => p.wonderId)).size).toBe(3);
    expect(state.hands.every((h) => h.length === 7)).toBe(true);
    expect(state.ageDecks[2]).toHaveLength(21);
    expect(state.ageDecks[3]).toHaveLength(21);
    expect(state.phase).toBe("selecting");
    expect(state.age).toBe(1);
    expect(state.turn).toBe(1);
  });

  it("rejects invalid player counts", () => {
    expect(() => createInitialState({ playerCount: 2, seed: 1, sideMode: "A" })).toThrow();
    expect(() => createInitialState({ playerCount: 8, seed: 1, sideMode: "A" })).toThrow();
  });

  it("random side mode assigns some of each across seeds", () => {
    const sides = new Set<string>();
    for (let seed = 0; seed < 20; seed++) {
      const state = createInitialState({ playerCount: 7, seed, sideMode: "random" });
      for (const p of state.players) sides.add(p.side);
    }
    expect(sides).toEqual(new Set(["A", "B"]));
  });
});
