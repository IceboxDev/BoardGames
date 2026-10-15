/**
 * One seat's view of the table. Total: any seat (spectators are -1) in any
 * phase gets a view and nothing throws.
 *
 * Redaction: the key goes to spymasters only until the game is over; team
 * chat goes to the viewer's own team only; pointers and sticky notes to the
 * viewer's own team's OPERATIVES only (not its spymaster, who must not be
 * seen reacting to them). A clue's note (the cards it meant) is as secret as
 * the key: its own team's spymaster, or everyone at game over. A clue
 * question is between the two spymasters — the word, the table word it
 * brushes and the turn's record of questions reach only them until the game
 * is over; everyone else sees that a question is open. `rngState` never leaves.
 */

import { handoverAt } from "./presence";
import {
  agentsLeft,
  canChat,
  canEndTurn,
  canGuess,
  canNote,
  canRule,
  canWithdraw,
  currentSpymaster,
  guessesLeft,
  isAiSeat,
  usedStandIn,
} from "./rules";
import { roleOf, teamOf } from "./seating";
import type {
  AppealView,
  CardView,
  CodenamesPlayerView,
  CodenamesState,
  TurnRecord,
  ViewPhase,
} from "./types";

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
  const seesAppeals = over || role === "spymaster";
  const turn = state.turns[state.turns.length - 1];
  // Pointers and notes are the operatives' working-out: their own team's only.
  const teamWork = team !== null && role === "operative";

  const cards: CardView[] = state.words.map((word, i) => ({
    word,
    revealed: state.revealed[i] ? (state.key[i] ?? null) : null,
    key: seesKey ? (state.key[i] ?? null) : null,
    marks: teamWork
      ? state.marks.filter((m) => m.card === i && teamOf(m.seat) === team).map((m) => m.seat)
      : [],
    notes: teamWork
      ? state.notes
          .filter((n) => n.card === i && teamOf(n.seat) === team)
          .map((n) => ({ turn: n.turn, seat: n.seat }))
      : [],
  }));

  const open = state.appeal;
  const appeal: AppealView | null =
    open === null
      ? null
      : {
          by: open.by,
          judge: open.judge,
          word: seesAppeals ? open.clue.word : null,
          clash: seesAppeals ? open.clash : null,
          count: seated && seat === open.by ? open.clue.count : null,
          deadlineTs: open.deadlineTs,
        };

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
      awaySince: live ? (state.away.find((a) => a.seat === s)?.since ?? null) : null,
      handoverAt: live && !state.standIns.includes(s) ? handoverAt(state, s) : null,
      standIn: state.standIns.includes(s),
      returning: live && state.reclaims.includes(s),
    })),
    cards,
    startingTeam: state.startingTeam,
    currentTeam: state.currentTeam,
    clue: phase === "guessing" ? (turn?.clue ?? null) : null,
    guessesMade: turn?.guesses.length ?? 0,
    guessesLeft: phase === "guessing" ? guessesLeft(state) : 0,
    agentsLeft: agentsLeft(state),
    // Only the live turn before its clue (and, for a spymaster, before any
    // question) is left out, so a turn's index here is its index in the game
    // (sticky notes and chat refer to turns by it).
    turns: state.turns
      .map((t) => {
        const noted = over || (role === "spymaster" && t.team === team) ? t : withoutNote(t);
        return seesAppeals ? noted : withoutAppeals(noted);
      })
      .filter(
        (t) =>
          t.clue !== null || t.end !== null || t.guesses.length > 0 || (t.appeals?.length ?? 0) > 0,
      ),
    chat: team === null ? [] : state.chat.filter((m) => m.team === team),
    canChat: live && seated && canChat(state, seat),
    mustGiveClue:
      phase === "clue" &&
      seated &&
      open === null &&
      seat === currentSpymaster(state) &&
      !isAiSeat(state, seat),
    appeal: live ? appeal : null,
    mustRuleClue: live && seated && canRule(state, seat),
    canWithdrawClue: live && seated && canWithdraw(state, seat),
    canNote: live && seated && canNote(state, seat),
    canHandOver: live && seated && !isAiSeat(state, seat),
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

function withoutAppeals({ appeals: _secret, ...turn }: TurnRecord): TurnRecord {
  return turn;
}
