import { describe, expect, it } from "vitest";
import { heuristicPick } from "../ai-heuristic";
import { applyUnchecked, createInitialState } from "../game-engine";
import { getActivePlayer, getLegalActions } from "../rules";
import type { Action, GameState, Mode } from "../types";
import { canonicalState } from "./canon";
import { mulberry32 } from "./determinize";
import { strigoiPick } from "./strigoi";
import {
  configArray,
  STRIGOI_CONFIG_FIELDS,
  wasmAvailable,
  wasmCanonicalRoundTrip,
  wasmPick,
} from "./wasm-agent";

interface Sample {
  state: GameState;
  seat: number;
  legal: Action[];
}

/** Decisions from seeded games (2–6 seats × Elder/Rookie, Nosferatu + random seats). */
function sampleDecisions(): Sample[] {
  const out: Sample[] = [];
  for (let g = 0; g < 10; g++) {
    const n = 2 + (g % 5);
    const mode: Mode = g >= 5 ? "rookie" : "elder";
    let s = createInitialState({
      playerCount: n,
      strategies: Array.from({ length: n }, () => null),
      seed: 7001 + g * 31,
      options: { mode },
    });
    const rand = mulberry32(g + 1);
    let step = 0;
    while (s.phase !== "game-over") {
      const seat = getActivePlayer(s);
      const legal = getLegalActions(s, seat);
      if (step++ % 3 === 0) out.push({ state: s, seat, legal });
      const a =
        seat % 2 === 0 ? heuristicPick(s, seat, legal) : legal[Math.floor(rand() * legal.length)];
      s = applyUnchecked(s, seat, a);
    }
  }
  return out;
}

describe("the-hunger wasm bridge", () => {
  const samples = sampleDecisions();

  it("instantiates", () => {
    expect(wasmAvailable()).toBe(true);
  });

  it("round-trips canonical text through the C++ parser", () => {
    for (const { state } of samples.filter((_, i) => i % 5 === 0)) {
      const text = canonicalState(state);
      expect(wasmCanonicalRoundTrip(text)).toBe(text);
    }
  });

  it("Nosferatu: the wasm pick equals the TS heuristicPick (legal counts agree)", () => {
    expect(samples.length).toBeGreaterThan(500);
    let multi = 0;
    for (const { state, seat, legal } of samples) {
      const wasm = wasmPick(state, seat, legal, "heuristic");
      expect(wasm).toBe(heuristicPick(state, seat, legal));
      if (legal.length > 1) multi++;
    }
    expect(multi).toBeGreaterThan(200);
  });

  it("Strigoi: the wasm pick equals the TS strigoiPick at the same budget", () => {
    const chosen = samples
      .filter((x) => x.legal.length >= 2 && x.legal.length <= 10)
      .filter((_, i) => i % 23 === 0)
      .slice(0, 16);
    expect(chosen.length).toBeGreaterThanOrEqual(12);
    let beyondNosferatu = 0;
    for (const [i, { state, seat, legal }] of chosen.entries()) {
      const cfg = { rollouts: i % 2 === 0 ? 8 : 16, minPerArm: 2 };
      const ts = strigoiPick(state, seat, legal, { ...cfg, timeMs: 0 });
      const wasm = wasmPick(state, seat, legal, "strigoi", configArray(STRIGOI_CONFIG_FIELDS, cfg));
      expect(wasm).toBe(ts);
      if (ts !== heuristicPick(state, seat, legal)) beyondNosferatu++;
    }
    // Not vacuous: the search overrules Nosferatu on some of these.
    expect(beyondNosferatu).toBeGreaterThan(0);
    // Real TS Strigoi searches: slow when the whole suite runs in parallel.
  }, 30_000);

  it("Dracula returns one of the legal actions", () => {
    const { state, seat, legal } = samples.find((x) => x.legal.length > 2) ?? samples[0];
    const a = wasmPick(state, seat, legal, "dracula", [16, 2]);
    expect(legal).toContain(a);
  });

  it("rejects a legal list the C++ side does not agree with, and malformed text", () => {
    const { state, seat, legal } = samples.find((x) => x.legal.length > 2) ?? samples[0];
    expect(() => wasmPick(state, seat, legal.slice(1), "heuristic")).toThrow(/legal actions/);
    expect(() => wasmPick(state, 9, legal, "heuristic")).toThrow(/seat/);
    expect(() => wasmCanonicalRoundTrip(`${canonicalState(state)} `)).toThrow(/trailing bytes/);
    // The instance survives the rejections.
    expect(legal).toContain(wasmPick(state, seat, legal, "heuristic"));
  });
});
