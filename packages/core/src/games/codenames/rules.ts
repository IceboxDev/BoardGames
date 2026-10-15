/**
 * Codenames rules as pure functions over `CodenamesState`. Every transition
 * returns a new state; an illegal move throws (the machine wraps calls in
 * `safeApply`, and `validateAction` rejects them before that). RULES.md is
 * the source for every rule here.
 */

import { rngFrom, rngStateFromSeed } from "../../lib/rng";
import { codenamesModelOf } from "./ai/models";
import { dealKey, dealWords, type KeyEntry } from "./board";
import { type Clue, cleanClueWord, clueProblem, clueVerdict, guessLimit } from "./clue-rules";
import type { AiCost, ClueNote, GuessNote } from "./notes";
import { operativesOf, otherTeam, roleOf, spymasterOf, type Team, teamOf } from "./seating";
import {
  type AppealRuling,
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
    notes: [],
    appeal: null,
    away: [],
    standIns: [],
    reclaims: [],
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

/** The seat that rules on the current team's clue questions: the other spymaster. */
export function judgeOf(state: CodenamesState): number {
  return spymasterOf(otherTeam(state.currentTeam));
}

/** Whether `seat` (a person) must allow or refuse the clue question in progress. */
export function canRule(state: CodenamesState, seat: number): boolean {
  return state.appeal !== null && state.appeal.judge === seat && !isAiSeat(state, seat);
}

/** Whether `seat` (a person) may take back the clue question it asked. */
export function canWithdraw(state: CodenamesState, seat: number): boolean {
  return state.appeal !== null && state.appeal.by === seat && !isAiSeat(state, seat);
}

/** A person operative at a live table: may pin the team's clues to cards. */
export function canNote(state: CodenamesState, seat: number): boolean {
  return (
    state.phase !== "over" &&
    Number.isInteger(seat) &&
    seat >= 0 &&
    seat < state.seatCount &&
    roleOf(seat) === "operative" &&
    !isAiSeat(state, seat)
  );
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
    appeal: null,
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
    appeal: null,
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

/** Why `seat` can't put a clue (to the table or to the other spymaster) right now. */
function cluePhaseProblem(state: CodenamesState, seat: number): string | null {
  if (state.phase !== "clue") return "It isn't time for a clue.";
  if (seat !== currentSpymaster(state)) return "Only the team's spymaster gives the clue.";
  if (state.appeal !== null) return "Wait for the other spymaster's answer first.";
  return null;
}

/**
 * Why `clue` can't be given as it stands, or `null`. A clue that only shares
 * spelling with a table word can't be given outright either — it is asked
 * about first (`askProblemFor`).
 */
export function clueProblemFor(state: CodenamesState, seat: number, clue: Clue): string | null {
  return (
    cluePhaseProblem(state, seat) ?? clueProblem(clue.word, faceDownWords(state), state.language)
  );
}

/** Why `clue` can't be asked about, or `null`: only a spelling-only clash goes to the judge. */
export function askProblemFor(state: CodenamesState, seat: number, clue: Clue): string | null {
  const phase = cluePhaseProblem(state, seat);
  if (phase !== null) return phase;
  const verdict = clueVerdict(clue.word, faceDownWords(state), state.language);
  if (verdict.kind === "hard") return verdict.message;
  if (verdict.kind === "ok") return "That clue is fine as it is — just give it.";
  return null;
}

/**
 * The spymaster asks the other spymaster about a spelling-only clash
 * (rulebook, "Don't be too strict": "If the opposing spymaster allows it,
 * the clue is valid"). The clue timer stops while they wait; a refusal gives
 * the time back.
 */
export function askClue(
  state: CodenamesState,
  seat: number,
  clue: Clue,
  note: ClueNote | null,
  now: number,
): CodenamesState {
  const problem = askProblemFor(state, seat, clue);
  if (problem !== null) throw new Error(problem);
  const verdict = clueVerdict(clue.word, faceDownWords(state), state.language);
  if (verdict.kind !== "soft") throw new Error("nothing to ask about");
  return {
    ...state,
    appeal: {
      by: seat,
      judge: judgeOf(state),
      clue: { word: cleanClueWord(clue.word), count: clue.count },
      note,
      clash: verdict.clash,
      deadlineTs: now + state.beats.appealWait,
      clueMsLeft: state.deadlineTs === null ? null : Math.max(0, state.deadlineTs - now),
    },
    deadlineTs: null,
  };
}

/**
 * Close the clue question. Allowed (or unanswered — silence is consent): the
 * clue is given. Refused or withdrawn: the spymaster thinks again, with the
 * clue time they had left.
 */
export function resolveAppeal(
  state: CodenamesState,
  ruling: AppealRuling,
  reason: string | null,
  now: number,
  /** What an AI judge's ruling cost, kept with the record. */
  cost: AiCost | null = null,
): CodenamesState {
  const appeal = state.appeal;
  if (appeal === null || state.phase !== "clue") throw new Error("no clue question is open");
  const turn = currentTurn(state);
  const record = {
    word: appeal.clue.word,
    clash: appeal.clash,
    by: appeal.by,
    judge: appeal.judge,
    ruling,
    reason,
    ...(cost ? { cost } : {}),
  };
  const turns = state.turns.slice(0, -1);
  const stands = ruling === "allowed" || ruling === "unanswered";
  turns.push({
    ...turn,
    appeals: [...(turn.appeals ?? []), record],
    ...(stands ? { clue: appeal.clue } : {}),
    ...(stands && appeal.note ? { note: appeal.note } : {}),
  });
  if (stands) return { ...state, turns, appeal: null, phase: "guessing", deadlineTs: null };
  return {
    ...state,
    turns,
    appeal: null,
    deadlineTs: appeal.clueMsLeft === null ? null : now + appeal.clueMsLeft,
  };
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

/**
 * The clue-giving team's face-down agents from `targets`, distinct — a
 * person's clue targets as kept. A clue can only mean the team's own cards.
 */
export function cleanTargets(state: CodenamesState, targets: readonly number[]): number[] {
  return targets.filter(
    (card, i) =>
      Number.isInteger(card) &&
      state.revealed[card] === false &&
      state.key[card] === state.currentTeam &&
      targets.indexOf(card) === i,
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
    // A covered card is settled: the team's guesses about it go with it.
    notes: state.notes.filter((n) => n.card !== card),
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

/**
 * Each operative has ONE pointer — "this is the one I'd touch" — so the
 * team's cards read as a vote. Pointing at another card moves it; pointing
 * at the same card again takes it off.
 */
export function applyMark(state: CodenamesState, seat: number, card: number): CodenamesState {
  if (!canGuess(state, seat)) throw new Error("only the guessing team's operatives point");
  if (state.revealed[card] !== false) throw new Error("that card can't be pointed at");
  const had = state.marks.some((m) => m.card === card && m.seat === seat);
  const others = state.marks.filter((m) => m.seat !== seat);
  return { ...state, marks: had ? others : [...others, { card, seat }] };
}

/** Why `seat` can't pin the clue of turn `turn` to `card`, or `null`. */
export function noteProblem(
  state: CodenamesState,
  seat: number,
  card: number,
  turn: number,
): string | null {
  if (!canNote(state, seat)) return "only your team's operatives pin notes";
  if (!Number.isInteger(card) || state.revealed[card] !== false) {
    return "notes go on face-down cards";
  }
  const record = Number.isInteger(turn) ? state.turns[turn] : undefined;
  if (!record || record.clue === null || record.team !== teamOf(seat)) {
    return "that isn't one of your team's clues";
  }
  return null;
}

/**
 * Pin the team's clue from turn `turn` to `card` — or unpin it: a note is
 * the team's, so any of its operatives may take one off.
 */
export function applyNote(
  state: CodenamesState,
  seat: number,
  card: number,
  turn: number,
): CodenamesState {
  const problem = noteProblem(state, seat, card, turn);
  if (problem !== null) throw new Error(problem);
  const team = teamOf(seat);
  const same = (n: { card: number; turn: number; seat: number }) =>
    n.card === card && n.turn === turn && teamOf(n.seat) === team;
  return {
    ...state,
    notes: state.notes.some(same)
      ? state.notes.filter((n) => !same(n))
      : [...state.notes, { card, turn, seat }],
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
 * Every enumerable move for a person at `seat` — ruling on or withdrawing a
 * clue question, touching or pointing at a face-down card, and stopping.
 * Clues, notes and chat carry free values and are validated on their own
 * (`machine.ts`); AI seats never act through here.
 */
export function legalActionsFor(state: CodenamesState, seat: number): CodenamesAction[] {
  if (isAiSeat(state, seat)) return [];
  const actions: CodenamesAction[] = [];
  if (canRule(state, seat)) {
    actions.push({ kind: "rule-clue", allow: true }, { kind: "rule-clue", allow: false });
  }
  if (canWithdraw(state, seat)) actions.push({ kind: "withdraw-clue" });
  if (!canGuess(state, seat)) return actions;
  state.revealed.forEach((up, card) => {
    if (!up) actions.push({ kind: "guess", card });
  });
  state.revealed.forEach((up, card) => {
    if (!up) actions.push({ kind: "mark", card });
  });
  if (canEndTurn(state, seat)) actions.push({ kind: "end-turn" });
  return actions;
}
