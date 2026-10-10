/**
 * Codenames rules as pure functions over `CodenamesState`. Every transition
 * returns a new state; an illegal move throws (the machine wraps calls in
 * `safeApply`, and `validateAction` rejects them before that). RULES.md is
 * the source for every rule here.
 */

import { rngFrom, rngStateFromSeed } from "../../lib/rng";
import { codenamesModelOf } from "./ai/models";
import { dealKey, dealWords, type KeyEntry } from "./board";
import { type Clue, cleanClueWord, clueProblem, guessLimit } from "./clue-rules";
import type { ClueNote, GuessNote } from "./notes";
import { operativesOf, otherTeam, roleOf, spymasterOf, type Team, teamOf } from "./seating";
import {
  type CodenamesAction,
  type CodenamesBeats,
  type CodenamesState,
  DEFAULT_BEATS,
  type TurnEnd,
  type TurnRecord,
} from "./types";
import type { Language } from "./words";

export interface NewGameInput {
  seed: number;
  ai: readonly (string | null)[];
  language: Language;
  clueTimerSec: number;
  guessTimerSec: number;
  beats?: Partial<CodenamesBeats>;
}

export function createGame(input: NewGameInput): CodenamesState {
  const carrier = { rngState: rngStateFromSeed(input.seed) };
  const rng = rngFrom(carrier);
  const startingTeam: Team = rng() < 0.5 ? 0 : 1;
  const words = dealWords(rng, input.language);
  const key = dealKey(rng, startingTeam);
  return {
    rngState: carrier.rngState,
    seed: input.seed,
    language: input.language,
    seatCount: input.ai.length,
    ai: input.ai.map((id) => (id === null ? null : codenamesModelOf(id))),
    words,
    key,
    revealed: words.map(() => false),
    startingTeam,
    currentTeam: startingTeam,
    phase: "clue",
    turns: [{ team: startingTeam, clue: null, guesses: [], end: null }],
    marks: [],
    chat: [],
    clueTimerSec: input.clueTimerSec,
    guessTimerSec: input.guessTimerSec,
    deadlineTs: null,
    aiThinking: null,
    aiQueue: [],
    result: null,
    beats: { ...DEFAULT_BEATS, ...input.beats },
  };
}

// ---------------------------------------------------------------------------
// Reading the state
// ---------------------------------------------------------------------------

export function isAiSeat(state: CodenamesState, seat: number): boolean {
  return state.ai[seat] != null;
}

export function currentTurn(state: CodenamesState): TurnRecord {
  const turn = state.turns[state.turns.length - 1];
  if (!turn) throw new Error("no turn in progress");
  return turn;
}

/** The words still face down — the ones a clue may not echo. */
export function faceDownWords(state: CodenamesState): string[] {
  return state.words.filter((_, i) => !state.revealed[i]);
}

export function agentsLeft(state: CodenamesState): [number, number] {
  const left: [number, number] = [0, 0];
  state.key.forEach((entry, i) => {
    if (!state.revealed[i] && (entry === 0 || entry === 1)) left[entry]++;
  });
  return left;
}

export function agentsFound(state: CodenamesState): [number, number] {
  const found: [number, number] = [0, 0];
  state.key.forEach((entry, i) => {
    if (state.revealed[i] && (entry === 0 || entry === 1)) found[entry]++;
  });
  return found;
}

/** Guesses left this turn; `null` = unlimited (a 0 or ∞ clue). */
export function guessesLeft(state: CodenamesState): number | null {
  const turn = currentTurn(state);
  if (turn.clue === null) return 0;
  const limit = guessLimit(turn.clue.count);
  return limit === null ? null : Math.max(0, limit - turn.guesses.length);
}

/**
 * The seats that touch cards for `team`. People decide when the team has any
 * human operative; otherwise its lowest AI operative guesses and any other AI
 * operatives sit out (two AIs pulling different cards would be noise).
 */
export function guessersOf(state: CodenamesState, team: Team): number[] {
  const operatives = operativesOf(team, state.seatCount);
  const humans = operatives.filter((seat) => !isAiSeat(state, seat));
  if (humans.length > 0) return humans;
  return operatives.slice(0, 1);
}

export function currentSpymaster(state: CodenamesState): number {
  return spymasterOf(state.currentTeam);
}

export function guessingIsAi(state: CodenamesState): boolean {
  const guessers = guessersOf(state, state.currentTeam);
  return guessers.length > 0 && guessers.every((seat) => isAiSeat(state, seat));
}

export function canGuess(state: CodenamesState, seat: number): boolean {
  return state.phase === "guessing" && guessersOf(state, state.currentTeam).includes(seat);
}

export function canEndTurn(state: CodenamesState, seat: number): boolean {
  return canGuess(state, seat) && currentTurn(state).guesses.length > 0;
}

/** Spymasters keep a straight face: team chat is for operatives. */
export function canChat(state: CodenamesState, seat: number): boolean {
  return seat >= 0 && seat < state.seatCount && roleOf(seat) === "operative";
}

// ---------------------------------------------------------------------------
// Transitions
// ---------------------------------------------------------------------------

function endTurn(state: CodenamesState, end: TurnEnd): CodenamesState {
  const turns = state.turns.slice(0, -1);
  turns.push({ ...currentTurn(state), end });
  const next = otherTeam(state.currentTeam);
  turns.push({ team: next, clue: null, guesses: [], end: null });
  return {
    ...state,
    turns,
    currentTeam: next,
    phase: "clue",
    marks: [],
    deadlineTs: null,
    aiQueue: [],
  };
}

function finish(state: CodenamesState, winner: Team, end: TurnEnd): CodenamesState {
  const turns = state.turns.slice(0, -1);
  turns.push({ ...currentTurn(state), end });
  return {
    ...state,
    turns,
    phase: "over",
    marks: [],
    deadlineTs: null,
    aiQueue: [],
    aiThinking: null,
    result: {
      winner,
      reason: end === "assassin" ? "assassin" : "agents",
      agentsFound: agentsFound(state),
    },
  };
}

export function clueProblemFor(state: CodenamesState, seat: number, clue: Clue): string | null {
  if (state.phase !== "clue") return "It isn't time for a clue.";
  if (seat !== currentSpymaster(state)) return "Only the team's spymaster gives the clue.";
  return clueProblem(clue.word, faceDownWords(state), state.language);
}

export function applyClue(
  state: CodenamesState,
  seat: number,
  clue: Clue,
  note?: ClueNote,
): CodenamesState {
  const problem = clueProblemFor(state, seat, clue);
  if (problem !== null) throw new Error(problem);
  const turns = state.turns.slice(0, -1);
  turns.push({
    ...currentTurn(state),
    clue: { word: cleanClueWord(clue.word), count: clue.count },
    ...(note ? { note } : {}),
  });
  return { ...state, turns, phase: "guessing", deadlineTs: null };
}

/** Keep an AI operative's reading of the clue with the live turn. */
export function attachGuessNote(state: CodenamesState, note: GuessNote): CodenamesState {
  const turn = currentTurn(state);
  const turns = state.turns.slice(0, -1);
  turns.push({ ...turn, guessNotes: [...(turn.guessNotes ?? []), note] });
  return { ...state, turns };
}

/** Face-down cards from `targets`, distinct — a person's clue targets as kept. */
export function cleanTargets(state: CodenamesState, targets: readonly number[]): number[] {
  return targets.filter(
    (card, i) =>
      Number.isInteger(card) && state.revealed[card] === false && targets.indexOf(card) === i,
  );
}

/** Whether any AI move this game came from the stand-in. */
export function usedStandIn(turns: readonly CodenamesState["turns"][number][]): boolean {
  return turns.some((t) => t.note?.standIn === true || (t.guessNotes ?? []).some((n) => n.standIn));
}

export function applyGuess(state: CodenamesState, seat: number, card: number): CodenamesState {
  if (!canGuess(state, seat)) throw new Error("you can't touch a card right now");
  if (!Number.isInteger(card) || card < 0 || card >= state.words.length) {
    throw new Error("no such card");
  }
  if (state.revealed[card]) throw new Error("that card is already face up");

  const result = state.key[card] as KeyEntry;
  const revealed = state.revealed.slice();
  revealed[card] = true;
  const turns = state.turns.slice(0, -1);
  const turn = currentTurn(state);
  turns.push({ ...turn, guesses: [...turn.guesses, { card, by: seat, result }] });
  const next: CodenamesState = {
    ...state,
    revealed,
    turns,
    marks: state.marks.filter((m) => m.card !== card),
    aiQueue: state.aiQueue.filter((c) => c !== card),
  };

  const team = state.currentTeam;
  if (result === "assassin") return finish(next, otherTeam(team), "assassin");
  // Revealing a team's last agent wins it the game, even when the other team
  // did the revealing (RULES.md, "Winning").
  const left = agentsLeft(next);
  if (left[team] === 0) return finish(next, team, "won");
  if (left[otherTeam(team)] === 0) return finish(next, otherTeam(team), "won");
  if (result !== team) return endTurn(next, "miss");
  if (guessesLeft(next) === 0) return endTurn(next, "limit");
  return next;
}

export function applyEndTurn(state: CodenamesState, seat: number): CodenamesState {
  if (!canEndTurn(state, seat)) throw new Error("the team must touch at least one card first");
  return endTurn(state, "stopped");
}

/** The running timer ran out: no clue → the turn passes; mid-guessing → it ends. */
export function applyTimeout(state: CodenamesState): CodenamesState {
  if (state.phase === "clue") return endTurn(state, "clue-timeout");
  if (state.phase === "guessing") return endTurn(state, "guess-timeout");
  return state;
}

export function applyMark(state: CodenamesState, seat: number, card: number): CodenamesState {
  if (!canGuess(state, seat)) throw new Error("only the guessing team's operatives point");
  if (state.revealed[card] !== false) throw new Error("that card can't be pointed at");
  const has = state.marks.some((m) => m.card === card && m.seat === seat);
  return {
    ...state,
    marks: has
      ? state.marks.filter((m) => !(m.card === card && m.seat === seat))
      : [...state.marks, { card, seat }],
  };
}

export function applyChat(state: CodenamesState, seat: number, text: string): CodenamesState {
  if (!canChat(state, seat)) throw new Error("spymasters can't talk to their team");
  const clean = text.trim();
  if (clean.length === 0) throw new Error("empty message");
  return {
    ...state,
    chat: [...state.chat, { seat, team: teamOf(seat), text: clean, turn: state.turns.length - 1 }],
  };
}

/**
 * Every enumerable move for a person at `seat` — touching or pointing at a
 * face-down card, and stopping. Clues and chat are free text, validated on
 * their own (`machine.ts`); AI seats never act through here.
 */
export function legalActionsFor(state: CodenamesState, seat: number): CodenamesAction[] {
  if (isAiSeat(state, seat) || !canGuess(state, seat)) return [];
  const actions: CodenamesAction[] = [];
  state.revealed.forEach((up, card) => {
    if (!up) actions.push({ kind: "guess", card });
  });
  state.revealed.forEach((up, card) => {
    if (!up) actions.push({ kind: "mark", card });
  });
  if (canEndTurn(state, seat)) actions.push({ kind: "end-turn" });
  return actions;
}
