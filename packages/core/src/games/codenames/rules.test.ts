import { describe, expect, it } from "vitest";
import { createRng } from "../../lib/rng";
import { dealKey } from "./board";
import {
  agentsLeft,
  applyChat,
  applyClue,
  applyEndTurn,
  applyGuess,
  applyMark,
  applyTimeout,
  createGame,
  guessersOf,
  guessesLeft,
  legalActionsFor,
} from "./rules";
import { operativesOf, roleOf, teamOf } from "./seating";
import type { CodenamesState, Team } from "./types";

function game(ai: (string | null)[] = [null, null, null, null]): CodenamesState {
  return createGame({ seed: 7, ai, language: "en", clueTimerSec: 0, guessTimerSec: 0 });
}

const cardsOf = (state: CodenamesState, entry: CodenamesState["key"][number]) =>
  state.key.flatMap((k, i) => (k === entry && !state.revealed[i] ? [i] : []));

/** A clue nobody's board can clash with. */
const CLUE = { word: "zqx", count: 2 } as const;

function withClue(state: CodenamesState, count: number | "unlimited" = 2): CodenamesState {
  return applyClue(state, state.currentTeam, { word: CLUE.word, count });
}

describe("dealing", () => {
  it("deals 9 / 8 / 7 / 1 with the starter holding nine", () => {
    for (const start of [0, 1] as Team[]) {
      const key = dealKey(createRng(3), start);
      expect(key.filter((k) => k === start)).toHaveLength(9);
      expect(key.filter((k) => k === 1 - start)).toHaveLength(8);
      expect(key.filter((k) => k === "bystander")).toHaveLength(7);
      expect(key.filter((k) => k === "assassin")).toHaveLength(1);
    }
  });

  it("is deterministic in the seed and starts with the starting team's clue", () => {
    const a = game();
    const b = game();
    expect(a.words).toEqual(b.words);
    expect(a.key).toEqual(b.key);
    expect(a.phase).toBe("clue");
    expect(a.currentTeam).toBe(a.startingTeam);
    expect(agentsLeft(a)[a.startingTeam]).toBe(9);
  });
});

describe("seating", () => {
  it("derives teams and roles from the seat index", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7].map(teamOf)).toEqual([0, 1, 0, 1, 0, 1, 0, 1]);
    expect([0, 1, 2].map(roleOf)).toEqual(["spymaster", "spymaster", "operative"]);
    expect(operativesOf(0, 7)).toEqual([2, 4, 6]);
    expect(operativesOf(1, 7)).toEqual([3, 5]);
  });

  it("lets human operatives guess, else the lowest AI operative", () => {
    const state = game([null, null, "codenames-medium", null, "codenames-medium", "x"]);
    expect(guessersOf(state, 0)).toEqual([2]);
    expect(guessersOf(state, 1)).toEqual([3]);
  });
});

describe("clues", () => {
  it("only the current spymaster gives one, and it must be legal", () => {
    const state = game();
    const other = 1 - state.currentTeam;
    expect(() => applyClue(state, other, CLUE)).toThrow(/spymaster/);
    expect(() =>
      applyClue(state, state.currentTeam, { word: state.words[0] ?? "", count: 1 }),
    ).toThrow();
    const next = withClue(state);
    expect(next.phase).toBe("guessing");
    expect(guessesLeft(next)).toBe(3);
  });
});

describe("guessing", () => {
  it("own agent continues, until the n+1 limit", () => {
    let state = withClue(game(), 1);
    const team = state.currentTeam;
    const guesser = guessersOf(state, team)[0] as number;
    const [a, b] = cardsOf(state, team);
    state = applyGuess(state, guesser, a as number);
    expect(state.phase).toBe("guessing");
    expect(guessesLeft(state)).toBe(1);
    state = applyGuess(state, guesser, b as number);
    expect(state.phase).toBe("clue");
    expect(state.currentTeam).toBe(1 - team);
    expect(state.turns.at(-2)?.end).toBe("limit");
  });

  it("a bystander or an opposing agent ends the turn", () => {
    let state = withClue(game());
    const team = state.currentTeam;
    const guesser = guessersOf(state, team)[0] as number;
    state = applyGuess(state, guesser, cardsOf(state, "bystander")[0] as number);
    expect(state.currentTeam).toBe(1 - team);
    expect(state.turns.at(-2)?.end).toBe("miss");
  });

  it("the assassin loses the game on the spot", () => {
    let state = withClue(game());
    const team = state.currentTeam;
    state = applyGuess(
      state,
      guessersOf(state, team)[0] as number,
      cardsOf(state, "assassin")[0] as number,
    );
    expect(state.phase).toBe("over");
    expect(state.result).toMatchObject({ winner: 1 - team, reason: "assassin" });
  });

  it("revealing the opponent's last agent wins it for them", () => {
    let state = game();
    const team = state.currentTeam;
    const enemy = (1 - team) as Team;
    // Cover all but one enemy agent directly.
    const enemyCards = cardsOf(state, enemy);
    const revealed = state.revealed.slice();
    for (const card of enemyCards.slice(1)) revealed[card] = true;
    state = withClue({ ...state, revealed });
    state = applyGuess(state, guessersOf(state, team)[0] as number, enemyCards[0] as number);
    expect(state.result).toMatchObject({ winner: enemy, reason: "agents" });
  });

  it("finding every own agent wins", () => {
    let state = game();
    const team = state.currentTeam;
    const own = cardsOf(state, team);
    const revealed = state.revealed.slice();
    for (const card of own.slice(1)) revealed[card] = true;
    state = withClue({ ...state, revealed });
    state = applyGuess(state, guessersOf(state, team)[0] as number, own[0] as number);
    expect(state.result).toMatchObject({ winner: team, reason: "agents" });
  });

  it("0 and ∞ clues allow unlimited guesses; stopping needs one touch", () => {
    let state = withClue(game(), 0);
    const guesser = guessersOf(state, state.currentTeam)[0] as number;
    expect(guessesLeft(state)).toBeNull();
    expect(() => applyEndTurn(state, guesser)).toThrow();
    expect(legalActionsFor(state, guesser).some((a) => a.kind === "end-turn")).toBe(false);
    state = applyGuess(state, guesser, cardsOf(state, state.currentTeam)[0] as number);
    expect(legalActionsFor(state, guesser).some((a) => a.kind === "end-turn")).toBe(true);
    state = applyEndTurn(state, guesser);
    expect(state.turns.at(-2)?.end).toBe("stopped");
  });

  it("the other team can't touch cards", () => {
    const state = withClue(game());
    const enemyOp = guessersOf(state, (1 - state.currentTeam) as Team)[0] as number;
    expect(legalActionsFor(state, enemyOp)).toEqual([]);
    expect(() => applyGuess(state, enemyOp, 0)).toThrow();
  });
});

describe("timers, pointers and chat", () => {
  it("a timeout passes the turn in either phase", () => {
    const start = game();
    const afterClue = applyTimeout(start);
    expect(afterClue.turns.at(-2)?.end).toBe("clue-timeout");
    const afterGuess = applyTimeout(withClue(afterClue));
    expect(afterGuess.turns.at(-2)?.end).toBe("guess-timeout");
    expect(afterGuess.currentTeam).toBe(start.currentTeam);
  });

  it("pointers toggle and clear at the end of the turn", () => {
    let state = withClue(game());
    const guesser = guessersOf(state, state.currentTeam)[0] as number;
    const card = cardsOf(state, "bystander")[0] as number;
    state = applyMark(state, guesser, card);
    expect(state.marks).toEqual([{ card, seat: guesser }]);
    state = applyMark(state, guesser, card);
    expect(state.marks).toEqual([]);
    state = applyMark(state, guesser, card);
    state = applyGuess(state, guesser, card);
    expect(state.marks).toEqual([]);
  });

  it("spymasters can't chat; operatives can", () => {
    const state = game();
    expect(() => applyChat(state, 0, "hi")).toThrow();
    expect(applyChat(state, 3, "  hi ").chat).toEqual([{ seat: 3, team: 1, text: "hi", turn: 0 }]);
  });
});
