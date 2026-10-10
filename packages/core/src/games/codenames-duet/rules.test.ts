import { describe, expect, it } from "vitest";
import { createRng } from "../../lib/rng";
import { dealDuetKey } from "../codenames/board";
import {
  agentsLeftOn,
  applyClue,
  applyEndTurn,
  applyGuess,
  createDuet,
  guessableCards,
  guesserOf,
  judgedSide,
  TOTAL_AGENTS,
} from "./rules";
import type { DuetState, Side } from "./types";

function duet(timerTokens = 9): DuetState {
  return createDuet({
    seed: 11,
    ai: [null, null],
    language: "en",
    timerTokens,
    clueTimerSec: 0,
    guessTimerSec: 0,
  });
}

const CLUE = { word: "zqx", count: 2 } as const;

function clued(state: DuetState): DuetState {
  return applyClue(state, state.giver, CLUE);
}

/** Cards that are `entry` on the side guesses are judged against now. */
function judged(state: DuetState, entry: "agent" | "bystander" | "assassin"): number[] {
  const side = judgedSide(state);
  return guessableCards(state, guesserOf(state)).filter((c) => state.key[c]?.[side] === entry);
}

describe("duet key", () => {
  it("has 9 agents, 3 assassins and 13 bystanders per side, 15 agents in all", () => {
    for (let seed = 0; seed < 20; seed++) {
      const key = dealDuetKey(createRng(seed));
      for (const side of [0, 1] as const) {
        expect(key.filter((p) => p[side] === "agent")).toHaveLength(9);
        expect(key.filter((p) => p[side] === "assassin")).toHaveLength(3);
        expect(key.filter((p) => p[side] === "bystander")).toHaveLength(13);
      }
      expect(key.filter((p) => p.includes("agent"))).toHaveLength(TOTAL_AGENTS);
      expect(key.filter((p) => p[0] === "agent" && p[1] === "agent")).toHaveLength(3);
      expect(key.filter((p) => p[0] === "assassin" && p[1] === "assassin")).toHaveLength(1);
    }
  });
});

describe("duet turns", () => {
  it("the partner guesses against the giver's side; agents keep the turn going", () => {
    let state = clued(duet());
    const giver = state.giver;
    expect(guesserOf(state)).toBe(1 - giver);
    expect(judgedSide(state)).toBe(giver);
    const [a, b] = judged(state, "agent");
    state = applyGuess(state, guesserOf(state), a as number);
    state = applyGuess(state, guesserOf(state), b as number);
    expect(state.phase).toBe("guessing"); // no n+1 limit in Duet
    state = applyEndTurn(state, guesserOf(state));
    expect(state.tokens).toBe(8);
    expect(state.giver).toBe(1 - giver);
  });

  it("a bystander ends the turn, spends a token, and stays guessable from the other side", () => {
    let state = clued(duet());
    const giver = state.giver;
    const card = judged(state, "bystander")[0] as number;
    state = applyGuess(state, guesserOf(state), card);
    expect(state.bystanders[giver][card]).toBe(true);
    expect(state.tokens).toBe(8);
    expect(state.phase).toBe("clue");
    state = clued(state);
    // Now judged against the other side: the card is touchable again unless
    // it is that side's bystander too.
    const otherSide = judgedSide(state);
    expect(guessableCards(state, guesserOf(state)).includes(card)).toBe(
      !state.bystanders[otherSide][card],
    );
  });

  it("an assassin on the giver's side loses at once", () => {
    let state = clued(duet());
    state = applyGuess(state, guesserOf(state), judged(state, "assassin")[0] as number);
    expect(state.result).toMatchObject({ won: false, reason: "assassin" });
  });

  it("the giver hands over only while the partner has agents left to clue", () => {
    let state = duet();
    const giver = state.giver;
    const partner = (1 - giver) as Side;
    // Find every agent on the partner's side up front.
    const found = state.found.map((f, i) => f || state.key[i]?.[partner] === "agent");
    state = { ...state, found };
    expect(agentsLeftOn(state, partner)).toBe(0);
    state = clued(state);
    state = applyGuess(state, guesserOf(state), judged(state, "bystander")[0] as number);
    expect(state.giver).toBe(giver);
  });

  it("running out of tokens starts sudden death, where any miss loses", () => {
    let state = clued(duet(7));
    for (let t = 0; t < 7 && state.phase !== "sudden-death"; t++) {
      state = applyGuess(state, guesserOf(state), judged(state, "bystander")[0] as number);
      if (state.phase === "clue") state = clued(state);
    }
    expect(state.phase).toBe("sudden-death");
    expect(state.tokens).toBe(0);
    state = applyGuess(state, guesserOf(state), judged(state, "bystander")[0] as number);
    expect(state.result).toMatchObject({ won: false, reason: "sudden-death" });
  });

  it("finding all fifteen agents wins", () => {
    let state = clued(duet());
    const side = judgedSide(state);
    const last = judged(state, "agent")[0] as number;
    const found = state.key.map((p, i) => p.includes("agent") && i !== last);
    state = { ...state, found };
    state = applyGuess(state, guesserOf(state), last);
    expect(state.result).toMatchObject({ won: true, agentsFound: 15 });
    expect(side).toBe(state.giver);
  });
});
