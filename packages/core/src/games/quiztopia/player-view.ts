// The per-seat projection of a Quiztopia state. Total for any seat and
// phase: a spectator seat gets the public board, and answers are nulled
// unless this seat may see them (`answerVisibleTo`).

import { QUIZTOPIA_DIFFICULTIES } from "../../history/coop-challenge.ts";
import {
  answerVisibleTo,
  helpFaceUp,
  inMiddle,
  lossAtFor,
  lostCount,
  requiredFor,
  seatAfter,
  wonCount,
} from "./rules.ts";
import type { QuiztopiaGameState, QuiztopiaPhase, QuiztopiaPlayerView } from "./types.ts";

/** Phases in which the active seat has the move. */
const ACTIVE_PHASES: ReadonlySet<QuiztopiaPhase> = new Set([
  "choose-building",
  "question",
  "judge",
  "bakery-offer",
]);

export function difficultyLabel(difficulty: number): string {
  return QUIZTOPIA_DIFFICULTIES[difficulty] ?? QUIZTOPIA_DIFFICULTIES[0];
}

export function buildPlayerView(gs: QuiztopiaGameState, seat: number): QuiztopiaPlayerView {
  const t = gs.turn;
  const q = t.question;
  const answerVisible = q !== null && answerVisibleTo(gs, seat);

  return {
    you: seat,
    playerCount: gs.playerCount,
    seats: [...gs.seats],
    difficulty: gs.difficulty,
    difficultyLabel: difficultyLabel(gs.difficulty),
    expert: gs.expert,
    deck: gs.deck,
    language: gs.language,
    phase: gs.phase,
    activeSeat: t.activeSeat,
    readerSeat: t.readerSeat,
    nextSeat: seatAfter(gs.seats, t.activeSeat),
    buildings: [...gs.buildings],
    won: wonCount(gs),
    lost: lostCount(gs),
    required: requiredFor(gs),
    lossAt: lossAtFor(gs),
    inMiddle: inMiddle(gs),
    deckRemaining: gs.drawPile.length,
    cardsUsed: gs.cardsUsed,
    help: {
      faceUp: helpFaceUp(gs).map((c) => ({ ...c })),
      hidden: gs.helpDeck.length - gs.helpOpen,
      deckSize: gs.helpDeck.length,
    },
    tipCards: gs.tipCards ? { ...gs.tipCards } : null,
    turn: {
      index: t.index,
      buildingIndex: t.buildingIndex,
      question: q
        ? {
            cardRef: q.cardRef,
            questionId: q.questionId,
            categoryIndex: q.categoryIndex,
            en: q.en,
            de: q.de,
            answerEn: answerVisible ? q.answerEn : null,
            answerDe: answerVisible ? q.answerDe : null,
            notesEn: q.notesEn,
            notesDe: q.notesDe,
          }
        : null,
      revealed: t.revealed,
      tipFlips: t.tipFlips,
      plenum: t.plenum,
      // The reader holds the card and the peeker has seen it: neither joins a plenum.
      plenumBarred: [t.readerSeat, t.peekSeat].filter((s): s is number => s !== null),
      peekSeat: t.peekSeat,
      readerHint: t.readerHint,
      shield: t.shield,
      helpPlayed: [...t.helpPlayed],
      penalties: t.penalties.length,
      discards: t.discards,
    },
    answerVisible,
    isYourTurn: seat === t.activeSeat && ACTIVE_PHASES.has(gs.phase),
    bakery: gs.bakery,
    bakeryOffer: gs.phase === "bakery-offer",
    lossPending: gs.phase === "loss-pending",
    bakeryComplete: gs.bakeryComplete,
    lastResolution: gs.lastResolution ? { ...gs.lastResolution } : null,
    // An unjudged (redrawn) question keeps its text but never leaks its answer.
    questionLog: gs.questionLog.map((e) =>
      e.correct === null ? { ...e, answerEn: "", answerDe: "" } : { ...e },
    ),
    outcome: gs.outcome,
  };
}
