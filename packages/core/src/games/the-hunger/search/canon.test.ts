import { describe, expect, it } from "vitest";
import { applyUnchecked, createInitialState } from "../game-engine";
import { getActivePlayer, getLegalActions } from "../rules";
import { canonicalAction, canonicalState, fnv1a64, stateHash } from "./canon";
import { cloneState } from "./clone";

const fresh = (seed = 7) =>
  createInitialState({ playerCount: 4, strategies: [null, null, null, null], seed });

describe("canonical state hash", () => {
  it("FNV-1a 64 matches the reference vectors", () => {
    expect(fnv1a64("")).toBe("cbf29ce484222325");
    expect(fnv1a64("a")).toBe("af63dc4c8601ec8c");
    expect(fnv1a64("foobar")).toBe("85944171f73967e8");
  });

  it("is stable: equal states hash equal, repeatably", () => {
    const a = fresh();
    const b = fresh();
    expect(stateHash(a)).toBe(stateHash(b));
    expect(stateHash(a)).toBe(stateHash(a));
    expect(stateHash(a)).toMatch(/^[0-9a-f]{16}$/);
    expect(canonicalState(cloneState(a))).toBe(canonicalState(a));
  });

  it("ignores the log, the seed and seat controllers", () => {
    const a = fresh();
    const b = cloneState(a);
    b.log.push({ t: "turn", turn: 99, order: [] });
    b.seed = 12345;
    b.players[0].type = "ai";
    b.players[0].aiStrategy = "random";
    expect(stateHash(b)).toBe(stateHash(a));
  });

  it("normalises optional fields (used / carried / chosen)", () => {
    const a = fresh();
    const b = cloneState(a);
    const c = cloneState(a);
    b.players[0].playArea.push({ id: "bernard#0", resolved: false });
    c.players[0].playArea.push({ id: "bernard#0", resolved: false, used: 0, carried: false });
    expect(stateHash(b)).toBe(stateHash(c));
  });

  it("differs when any rules-relevant field changes", () => {
    const a = fresh();
    const base = stateHash(a);
    const mutations: ((s: ReturnType<typeof fresh>) => void)[] = [
      (s) => {
        s.rng += 1;
      },
      (s) => {
        s.players[1].vp += 1;
      },
      (s) => {
        s.huntDeck.reverse();
      },
      (s) => {
        s.players[0].deck.push("bernard#0");
      },
      (s) => {
        const k = Object.keys(s.chests)[0];
        s.chests[k] = null;
      },
      (s) => {
        if (s.current) s.current.speed = 3;
      },
      (s) => {
        s.options.beginnerSafeMountains = true;
      },
      (s) => {
        s.track[0][2] = [];
      },
    ];
    for (const m of mutations) {
      const s = cloneState(a);
      m(s);
      expect(stateHash(s)).not.toBe(base);
    }
  });

  it("serialises every legal action on one line", () => {
    let s = fresh(11);
    for (let i = 0; i < 60 && s.phase !== "game-over"; i++) {
      const seat = getActivePlayer(s);
      const legal = getLegalActions(s, seat);
      const lines = legal.map(canonicalAction);
      for (const l of lines) expect(l).not.toMatch(/[\n|]/);
      expect(new Set(lines).size).toBe(lines.length);
      s = applyUnchecked(s, seat, legal[legal.length - 1]);
    }
  });
});
