/**
 * One seat's Duet view. Total for any seat and phase. Each player sees only
 * their own side of the key until the game is over; chat is between the two
 * players (spectators see none).
 */
import {
  agentsFound,
  agentsLeftOn,
  canChat,
  canEndTurn,
  currentTurn,
  guessableCards,
  isAiSeat,
  usedStandIn,
} from "./rules";
import type {
  DuetCardView,
  DuetPlayerView,
  DuetState,
  DuetTurn,
  DuetViewPhase,
  Side,
} from "./types";

export function buildDuetView(
  state: DuetState,
  phase: DuetViewPhase,
  seat: number,
): DuetPlayerView {
  const side: Side | null = seat === 0 || seat === 1 ? seat : null;
  const over = phase === "over";
  const live = phase === "clue" || phase === "guessing" || phase === "sudden-death";
  const human = side !== null && !isAiSeat(state, side);
  const turn = currentTurn(state);

  const cards: DuetCardView[] = state.words.map((word, i) => {
    const pair = state.key[i];
    const mine = side === null ? null : (pair?.[side] ?? null);
    const theirs = side === null ? null : (pair?.[(1 - side) as Side] ?? null);
    return {
      word,
      found: state.found[i] === true,
      bystanderFor: ([0, 1] as const).filter((s) => state.bystanders[s][i]),
      mine: over || side !== null ? mine : null,
      theirs: over ? theirs : null,
    };
  });

  return {
    phase,
    seat: side ?? -1,
    language: state.language,
    ai: [state.ai[0] !== null, state.ai[1] !== null],
    tiers: [state.ai[0], state.ai[1]],
    cards,
    giver: state.giver,
    clue: phase === "guessing" ? turn.clue : null,
    guessesMade: turn.guesses.length,
    tokens: state.tokens,
    tokensTotal: state.tokensTotal,
    agentsFound: agentsFound(state),
    agentsLeft: [agentsLeftOn(state, 0), agentsLeftOn(state, 1)],
    turns: state.turns
      .filter((t) => t.clue !== null || t.end !== null || t.guesses.length > 0)
      // A clue's note names cards on its giver's side: theirs to see, or all at the end.
      .map((t) => (over || (side !== null && t.giver === side) ? t : withoutNote(t))),
    chat: side === null ? [] : state.chat,
    canChat: live && side !== null && canChat(state, side),
    mustGiveClue: phase === "clue" && human && state.giver === side,
    canGuess: human && side !== null && guessableCards(state, side).length > 0,
    canEndTurn: human && side !== null && canEndTurn(state, side),
    guessable: human && side !== null ? guessableCards(state, side) : [],
    deadlineTs: live ? state.deadlineTs : null,
    aiThinking: live ? state.aiThinking : null,
    aiStandIn: usedStandIn(state.turns),
    result: state.result,
  };
}

function withoutNote({ note: _secret, ...turn }: DuetTurn): DuetTurn {
  return turn;
}
