/**
 * Codenames: Duet rules as pure functions over `DuetState` (RULES.md). An
 * illegal move throws; the machine wraps calls in `safeApply` and
 * `validateAction` rejects them first.
 *
 * Every guess is judged against the CLUE-GIVER's side of the key — the
 * guesser is finding the agents their partner sees.
 */

import { rngFrom, rngStateFromSeed } from "../../lib/rng";
import { codenamesModelOf } from "../codenames/ai/models";
import { type DuetKeyEntry, dealDuetKey, dealWords } from "../codenames/board";
import { type Clue, cleanClueWord, clueProblem } from "../codenames/clue-rules";
import type { ClueNote, GuessNote } from "../codenames/notes";
import type { Language } from "../codenames/words";
import {
  DEFAULT_DUET_BEATS,
  type DuetAction,
  type DuetBeats,
  type DuetState,
  type DuetTurn,
  type DuetTurnEnd,
  type Side,
} from "./types";

export const TOTAL_AGENTS = 15;

export interface NewDuetInput {
  seed: number;
  ai: readonly (string | null)[];
  language: Language;
  timerTokens: number;
  clueTimerSec: number;
  guessTimerSec: number;
  beats?: Partial<DuetBeats>;
}

export function createDuet(input: NewDuetInput): DuetState {
  const carrier = { rngState: rngStateFromSeed(input.seed) };
  const rng = rngFrom(carrier);
  const giver: Side = rng() < 0.5 ? 0 : 1;
  const words = dealWords(rng, input.language);
  const key = dealDuetKey(rng);
  const aiOf = (seat: number) => {
    const id = input.ai[seat];
    return id === null || id === undefined ? null : codenamesModelOf(id);
  };
  return {
    rngState: carrier.rngState,
    seed: input.seed,
    language: input.language,
    ai: [aiOf(0), aiOf(1)],
    words,
    key,
    found: words.map(() => false),
    bystanders: [words.map(() => false), words.map(() => false)],
    phase: "clue",
    giver,
    tokens: input.timerTokens,
    tokensTotal: input.timerTokens,
    turns: [{ giver, clue: null, guesses: [], end: null }],
    chat: [],
    clueTimerSec: input.clueTimerSec,
    guessTimerSec: input.guessTimerSec,
    deadlineTs: null,
    aiThinking: null,
    aiQueue: [],
    result: null,
    beats: { ...DEFAULT_DUET_BEATS, ...input.beats },
  };
}

export const partnerOf = (side: Side): Side => (1 - side) as Side;

export function isAiSeat(state: DuetState, seat: number): boolean {
  return (seat === 0 || seat === 1) && state.ai[seat] !== null;
}

/** What card `card` is on `side`'s key. */
export function entryOn(state: DuetState, side: Side, card: number): DuetKeyEntry {
  return state.key[card]?.[side] ?? "bystander";
}

export function currentTurn(state: DuetState): DuetTurn {
  const turn = state.turns[state.turns.length - 1];
  if (!turn) throw new Error("no turn in progress");
  return turn;
}

/** Agents still hidden on `side`'s key. */
export function agentsLeftOn(state: DuetState, side: Side): number {
  return state.key.filter((pair, i) => pair[side] === "agent" && !state.found[i]).length;
}

export function agentsFound(state: DuetState): number {
  return state.found.filter(Boolean).length;
}

/** Words not covered by an agent — what a clue may not echo. */
export function faceDownWords(state: DuetState): string[] {
  return state.words.filter((_, i) => !state.found[i]);
}

/** The seat touching cards now. In sudden death `giver` names the guesser. */
export function guesserOf(state: DuetState): Side {
  return state.phase === "sudden-death" ? state.giver : partnerOf(state.giver);
}

/** The key side guesses are judged against right now. */
export function judgedSide(state: DuetState): Side {
  return partnerOf(guesserOf(state));
}

/**
 * Cards `seat` may touch: not found, and not already shown to be a bystander
 * on the side the guess is judged against (it would only be one again).
 */
export function guessableCards(state: DuetState, seat: number): number[] {
  if (state.phase !== "guessing" && state.phase !== "sudden-death") return [];
  if (seat !== guesserOf(state)) return [];
  const side = judgedSide(state);
  return state.words.flatMap((_, i) => (state.found[i] || state.bystanders[side][i] ? [] : [i]));
}

export function canEndTurn(state: DuetState, seat: number): boolean {
  return (
    state.phase === "guessing" && seat === guesserOf(state) && currentTurn(state).guesses.length > 0
  );
}

/** The clue-giver keeps quiet from their clue to the end of the turn. */
export function canChat(state: DuetState, seat: number): boolean {
  if (seat !== 0 && seat !== 1) return false;
  if (state.phase === "guessing") return seat !== state.giver;
  return state.phase !== "over";
}

// ---------------------------------------------------------------------------
// Transitions
// ---------------------------------------------------------------------------

function closeTurn(state: DuetState, end: DuetTurnEnd): DuetTurn[] {
  const turns = state.turns.slice(0, -1);
  turns.push({ ...currentTurn(state), end });
  return turns;
}

function lose(state: DuetState, reason: "assassin" | "sudden-death", end: DuetTurnEnd): DuetState {
  return {
    ...state,
    turns: closeTurn(state, end),
    phase: "over",
    deadlineTs: null,
    aiQueue: [],
    aiThinking: null,
    result: { won: false, reason, agentsFound: agentsFound(state), tokensLeft: state.tokens },
  };
}

function win(state: DuetState): DuetState {
  return {
    ...state,
    turns: closeTurn(state, "won"),
    phase: "over",
    deadlineTs: null,
    aiQueue: [],
    aiThinking: null,
    result: { won: true, reason: "all-found", agentsFound: TOTAL_AGENTS, tokensLeft: state.tokens },
  };
}

/**
 * A turn spends one timer token. The next clue comes from the other player,
 * unless they have no agents left to clue for; out of tokens → sudden death.
 */
function nextTurn(state: DuetState, end: DuetTurnEnd): DuetState {
  const turns = closeTurn(state, end);
  const tokens = Math.max(0, state.tokens - 1);
  const base = { ...state, turns, tokens, deadlineTs: null, aiQueue: [] };
  if (tokens === 0) {
    // Sudden death: no more clues. Guessers alternate, starting with the
    // player who would have guessed next, skipping one with nothing to find.
    const guesser = suddenDeathGuesser(base, state.giver);
    return {
      ...base,
      phase: "sudden-death",
      giver: guesser,
      turns: [...turns, { giver: null, clue: null, guesses: [], end: null }],
    };
  }
  const preferred = partnerOf(state.giver);
  const giver = agentsLeftOn(base, preferred) > 0 ? preferred : state.giver;
  return {
    ...base,
    phase: "clue",
    giver,
    turns: [...turns, { giver, clue: null, guesses: [], end: null }],
  };
}

/** The sudden-death guesser after `previous`: alternate, unless one has nothing to find. */
function suddenDeathGuesser(state: DuetState, previous: Side): Side {
  const next = partnerOf(previous);
  // `next` finds the agents on their partner's (`previous`'s) key.
  return agentsLeftOn(state, previous) > 0 ? next : previous;
}

export function clueProblemFor(state: DuetState, seat: number, clue: Clue): string | null {
  if (state.phase !== "clue") return "It isn't time for a clue.";
  if (seat !== state.giver) return "It's your partner's turn to give the clue.";
  return clueProblem(clue.word, faceDownWords(state), state.language);
}

export function applyClue(state: DuetState, seat: number, clue: Clue, note?: ClueNote): DuetState {
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

/** Keep an AI guesser's reading with the live turn. */
export function attachGuessNote(state: DuetState, note: GuessNote): DuetState {
  const turn = currentTurn(state);
  const turns = state.turns.slice(0, -1);
  turns.push({ ...turn, guessNotes: [...(turn.guessNotes ?? []), note] });
  return { ...state, turns };
}

/** Distinct agents on the clue-giver's side not yet found — a person's clue targets as kept. */
export function cleanTargets(state: DuetState, targets: readonly number[]): number[] {
  return targets.filter(
    (card, i) =>
      Number.isInteger(card) &&
      state.found[card] === false &&
      state.key[card]?.[state.giver] === "agent" &&
      targets.indexOf(card) === i,
  );
}

export function usedStandIn(turns: readonly DuetState["turns"][number][]): boolean {
  return turns.some((t) => t.note?.standIn === true || (t.guessNotes ?? []).some((n) => n.standIn));
}

export function applyGuess(state: DuetState, seat: number, card: number): DuetState {
  if (!guessableCards(state, seat).includes(card)) throw new Error("that card can't be touched");
  const side = judgedSide(state);
  const result = entryOn(state, side, card);
  const turns = state.turns.slice(0, -1);
  const turn = currentTurn(state);
  turns.push({ ...turn, guesses: [...turn.guesses, { card, by: seat as Side, result }] });
  const next: DuetState = { ...state, turns, aiQueue: state.aiQueue.filter((c) => c !== card) };

  if (result === "assassin") {
    return lose(next, "assassin", "assassin");
  }
  if (result === "bystander") {
    const bystanders: [boolean[], boolean[]] = [
      next.bystanders[0].slice(),
      next.bystanders[1].slice(),
    ];
    bystanders[side][card] = true;
    const marked = { ...next, bystanders };
    if (state.phase === "sudden-death") return lose(marked, "sudden-death", "bystander");
    return nextTurn(marked, "bystander");
  }
  const found = next.found.slice();
  found[card] = true;
  const covered = { ...next, found };
  if (agentsFound(covered) === TOTAL_AGENTS) return win(covered);
  if (state.phase === "sudden-death") {
    return { ...covered, giver: suddenDeathGuesser(covered, seat as Side) };
  }
  // Out of agents on the giver's side: nothing left to guess this turn.
  if (agentsLeftOn(covered, side) === 0) return nextTurn(covered, "stopped");
  return covered;
}

export function applyEndTurn(state: DuetState, seat: number): DuetState {
  if (!canEndTurn(state, seat)) throw new Error("touch at least one card first");
  return nextTurn(state, "stopped");
}

export function applyTimeout(state: DuetState): DuetState {
  if (state.phase === "clue") return nextTurn(state, "clue-timeout");
  if (state.phase === "guessing") return nextTurn(state, "guess-timeout");
  return state;
}

export function applyChat(state: DuetState, seat: number, text: string): DuetState {
  if (!canChat(state, seat)) throw new Error("the clue-giver keeps quiet until the turn ends");
  const clean = text.trim();
  if (clean.length === 0) throw new Error("empty message");
  return {
    ...state,
    chat: [...state.chat, { seat: seat as Side, text: clean, turn: state.turns.length - 1 }],
  };
}

/** Enumerable moves for a person: touching a card and stopping. */
export function legalActionsFor(state: DuetState, seat: number): DuetAction[] {
  if (isAiSeat(state, seat)) return [];
  const actions: DuetAction[] = guessableCards(state, seat).map((card) => ({
    kind: "guess",
    card,
  }));
  if (canEndTurn(state, seat)) actions.push({ kind: "end-turn" });
  return actions;
}
