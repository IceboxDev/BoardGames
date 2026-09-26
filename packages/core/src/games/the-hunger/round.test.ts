import { describe, expect, it } from "vitest";
import { BOARDS } from "./content/boards";
import { cardDef, isRookieCard } from "./content/cards";
import { createInitialState, TURNS } from "./game-engine";
import { getLegalActions, handSpeed } from "./rules";
import { act, afterSetup, legal } from "./test-helpers";
import type { GameState } from "./types";

/** End every remaining turn of the current round with the cheapest actions. */
function passRound(state: GameState): GameState {
  let s = state;
  const turn = s.turn;
  let guard = 0;
  while (s.turn === turn && s.phase === "play" && guard++ < 500) {
    const options = legal(s);
    const pick =
      options.find((a) => a.type === "end-manipulation") ??
      options.find((a) => a.type === "stay") ??
      options.find((a) => a.type === "end-turn") ??
      options[0];
    s = act(s, pick);
  }
  return s;
}

describe("setup", () => {
  it("builds the Hunt Track with one row more than the players", () => {
    for (const n of [2, 4, 6]) {
      const s = afterSetup(n, 11);
      expect(s.track).toHaveLength(n + 1);
      for (const row of s.track) {
        const card = [...row[1], ...row[2]][0];
        expect(row[cardDef(card).keywords.includes("slow") ? 1 : 2]).toContain(card);
      }
    }
  });

  it("places Castle tiles by player count, Missions per crypt, 3 Tavern cards", () => {
    const s = afterSetup(3, 2);
    expect(s.castleTiles).toEqual([10, 6, 4]);
    // One pile per Crypt space, sized by its region (test board: one Crypt each).
    expect(s.crypts["road-2"]).toHaveLength(6);
    expect(s.crypts["road-5"]).toHaveLength(5);
    expect(s.crypts["rail-9"]).toHaveLength(4);
    expect(s.tavern).toHaveLength(3);
    expect(s.publicMissions).toHaveLength(2);
    for (const p of s.players) expect(p.missions).toHaveLength(1);
  });

  it("deals every Crypt on the real board its own pile: 6 / 5 / 4 by region", () => {
    const s = createInitialState({ playerCount: 4, strategies: Array(4).fill(null), seed: 2 });
    const crypts = BOARDS.B.spaces.filter((sp) => sp.effect === "crypt");
    expect(Object.keys(s.crypts).sort()).toEqual(crypts.map((c) => c.id).sort());
    const size = { mountains: 6, plains: 5, forest: 4 } as Record<string, number>;
    for (const c of crypts) expect(s.crypts[c.id]).toHaveLength(size[c.region]);
    // No tile is in two places.
    const all = [...Object.values(s.crypts).flat(), ...s.publicMissions, ...s.setupOffers.flat()];
    expect(new Set(all).size).toBe(all.length);
  });

  it("offers each Vampire two Missions to keep one of", () => {
    const s = createInitialState({ playerCount: 2, strategies: [null, null], seed: 5 });
    expect(s.phase).toBe("setup");
    const options = getLegalActions(s, 0);
    expect(options).toHaveLength(2);
    expect(getLegalActions(s, 1)).toEqual([]);
  });

  it("orders Turn 1 by starting-hand Speed, lowest first, stacked first on top", () => {
    const s = createInitialState({ playerCount: 4, strategies: Array(4).fill(null), seed: 9 });
    const stack = [...s.players].sort((a, b) => b.placedAt - a.placedAt);
    const speeds = stack.map((p) => handSpeed(p.hand));
    expect(speeds).toEqual([...speeds].sort((a, b) => a - b));
    const s2 = afterSetup(4, 9);
    const first = s2.log.find((l) => l.t === "turn");
    expect(first?.t === "turn" && first.order).toEqual(stack.map((p) => p.index));
  });

  it("Rookie puts 2 + 2 per player A cards on top of the Hunt deck", () => {
    const s = createInitialState({
      playerCount: 3,
      strategies: [null, null, null],
      seed: 4,
      options: { mode: "rookie" },
    });
    // 4 track rows were dealt from the top; the next 4 (of 8) are still A cards.
    const top = s.huntDeck.slice(-4);
    expect(top.every((id) => isRookieCard(id))).toBe(true);
  });
});

describe("prepare for the next turn", () => {
  it("advances the Moon, shifts the track right, and accumulates column 1", () => {
    let s = afterSetup(2, 3);
    const col3 = s.track.map((row) => [...row[2]]);
    s = passRound(s);
    expect(s.turn).toBe(2);
    expect(s.track.map((row) => row[1])).toEqual(col3);
    const col2 = s.track.map((row) => [...row[1]]);
    const col1Before = s.track.map((row) => [...row[0]]);
    s = passRound(s);
    expect(s.track.map((row) => row[0])).toEqual(col1Before.map((c, r) => [...c, ...col2[r]]));
  });

  it("does not refill the track on Turn 15 and ends after it", () => {
    let s = afterSetup(2, 8);
    while (s.turn < TURNS) s = passRound(s);
    expect(s.track.every((row) => row[2].length === 0)).toBe(true);
    s = passRound(s);
    expect(s.phase).toBe("game-over");
  });

  it("a Parasol grants one more turn, without hunting", () => {
    let s = afterSetup(2, 8);
    s.players[1].bonus.push({ id: "parasol#0", used: false });
    s.players[1].pos = "road-4";
    while (s.turn < TURNS) s = passRound(s);
    s = passRound(s);
    expect(s.turn).toBe(TURNS + 1);
    expect(s.current?.player).toBe(1);
    expect(s.current?.extraTurn).toBe(true);
  });
});
