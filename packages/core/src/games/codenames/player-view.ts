/**
 * One seat's view of the table. Total: any seat (spectators are -1) in any
 * phase gets a view and nothing throws.
 *
 * Redaction: the key goes to spymasters only until the game is over; team
 * chat and pointers go to the viewer's own team only. A clue's note (the
 * cards it meant) is as secret as the key: its own team's spymaster, or
 * everyone at game over. `rngState` never leaves.
 */

import {
  agentsLeft,
  canChat,
  canEndTurn,
  canGuess,
  currentSpymaster,
  guessesLeft,
  isAiSeat,
  usedStandIn,
} from "./rules";
import { roleOf, teamOf } from "./seating";
import type { CardView, CodenamesPlayerView, CodenamesState, TurnRecord, ViewPhase } from "./types";

export function buildPlayerView(
  state: CodenamesState,
  phase: ViewPhase,
  seat: number,
): CodenamesPlayerView {
  const seated = Number.isInteger(seat) && seat >= 0 && seat < state.seatCount;
  const team = seated ? teamOf(seat) : null;
  const role = seated ? roleOf(seat) : null;
  const over = phase === "over";
  const seesKey = over || role === "spymaster";
  const turn = state.turns[state.turns.length - 1];

  const cards: CardView[] = state.words.map((word, i) => ({
    word,
    revealed: state.revealed[i] ? (state.key[i] ?? null) : null,
    key: seesKey ? (state.key[i] ?? null) : null,
    marks:
      team === null
        ? []
        : state.marks.filter((m) => m.card === i && teamOf(m.seat) === team).map((m) => m.seat),
  }));

  const live = phase === "clue" || phase === "guessing";
  return {
    phase,
    seat: seated ? seat : -1,
    team,
    role,
    language: state.language,
    seats: Array.from({ length: state.seatCount }, (_, s) => ({
      seat: s,
      team: teamOf(s),
      role: roleOf(s),
      ai: isAiSeat(state, s),
      tier: state.ai[s] ?? null,
    })),
    cards,
    startingTeam: state.startingTeam,
    currentTeam: state.currentTeam,
    clue: phase === "guessing" ? (turn?.clue ?? null) : null,
    guessesMade: turn?.guesses.length ?? 0,
    guessesLeft: phase === "guessing" ? guessesLeft(state) : 0,
    agentsLeft: agentsLeft(state),
    turns: state.turns
      .filter((t) => t.clue !== null || t.end !== null || t.guesses.length > 0)
      .map((t) => (over || (role === "spymaster" && t.team === team) ? t : withoutNote(t))),
    chat: team === null ? [] : state.chat.filter((m) => m.team === team),
    canChat: live && seated && canChat(state, seat),
    mustGiveClue:
      phase === "clue" && seated && seat === currentSpymaster(state) && !isAiSeat(state, seat),
    canGuess: seated && !isAiSeat(state, seat) && canGuess(state, seat),
    canEndTurn: seated && !isAiSeat(state, seat) && canEndTurn(state, seat),
    deadlineTs: live ? state.deadlineTs : null,
    aiThinking: live ? state.aiThinking : null,
    aiStandIn: usedStandIn(state.turns),
    result: state.result,
  };
}

function withoutNote({ note: _secret, ...turn }: TurnRecord): TurnRecord {
  return turn;
}
