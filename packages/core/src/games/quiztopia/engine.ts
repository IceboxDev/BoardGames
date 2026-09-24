// Quiztopia's turn engine: pure transitions over `QuiztopiaGameState`.
// `applyAction` is the only entry the machine calls; it accepts exactly what
// `getLegalActions` enumerates and throws on anything else — the machine
// wraps it in `safeApply`, so a throw means "move rejected, state unchanged".
// Rulebook gaps are resolved per plan §4.9 and marked ASSUMED inline.

import { canonicalEquals } from "../../machines/action-validation.ts";
import { helpCardDef } from "./help-cards.ts";
import type { QuestionSource } from "./question-source.ts";
import {
  freshTurn,
  getLegalActions,
  helpPlayable,
  lossAtFor,
  lostCount,
  requiredFor,
  seatAfter,
  wonCount,
} from "./rules.ts";
import {
  BUILDING_COUNT,
  type BuildingStatus,
  type CurrentQuestion,
  type EngineDeps,
  type HelpCardId,
  type PenaltySeverity,
  type QuestionLogEntry,
  type QuiztopiaAction,
  type QuiztopiaGameState,
  type QuiztopiaOutcome,
  type TurnState,
} from "./types.ts";

type Gs = QuiztopiaGameState;

// ── Small immutable helpers ─────────────────────────────────────────────

function withTurn(gs: Gs, patch: Partial<TurnState>): Gs {
  return { ...gs, turn: { ...gs.turn, ...patch } };
}

function finish(gs: Gs, outcome: QuiztopiaOutcome, bakeryComplete = false): Gs {
  return { ...gs, phase: "game-over", outcome, bakeryComplete };
}

/** Opens a turn for `activeSeat`; the reader is the seat to their right. */
export function startTurn(gs: Gs, activeSeat: number, index: number): Gs {
  return { ...gs, phase: "choose-building", turn: freshTurn(gs.seats, activeSeat, index) };
}

function nextTurn(gs: Gs): Gs {
  return startTurn(gs, seatAfter(gs.seats, gs.turn.activeSeat), gs.turn.index + 1);
}

/** Pops the top card of the holder and resolves this building's question from it. */
function drawQuestion(
  gs: Gs,
  buildingIndex: number,
  source: QuestionSource,
): { next: Gs; question: CurrentQuestion } {
  const ref = gs.drawPile[0];
  if (ref === undefined) throw new Error("the card holder is empty");
  const card = source.getCard(ref);
  if (!card) throw new Error(`question source has no card "${ref}"`);
  const set = card.sets[buildingIndex];
  if (!set || set.categoryIndex !== buildingIndex) {
    throw new Error(`card "${ref}" has no set for building ${buildingIndex}`);
  }
  return {
    next: { ...gs, drawPile: gs.drawPile.slice(1), cardsUsed: gs.cardsUsed + 1 },
    question: { ...set, cardRef: ref },
  };
}

/** Discards up to `n` cards from the holder — as many as it still has. */
function discardCards(gs: Gs, n: number): Gs {
  const k = Math.min(n, gs.drawPile.length);
  if (k <= 0) return gs;
  return withTurn(
    { ...gs, drawPile: gs.drawPile.slice(k), cardsUsed: gs.cardsUsed + k },
    { discards: gs.turn.discards + k },
  );
}

function logEntry(
  gs: Gs,
  q: CurrentQuestion,
  correct: boolean | null,
  shielded: boolean,
  before: BuildingStatus,
  after: BuildingStatus,
): QuestionLogEntry {
  const t = gs.turn;
  return {
    turn: t.index,
    cardRef: q.cardRef,
    questionId: q.questionId,
    categoryIndex: q.categoryIndex,
    en: q.en,
    de: q.de,
    answerEn: q.answerEn,
    answerDe: q.answerDe,
    activeSeat: t.activeSeat,
    readerSeat: t.readerSeat,
    correct,
    shielded,
    buildingBefore: before,
    buildingAfter: after,
    helpPlayed: [...t.helpPlayed],
    tipFlips: t.tipFlips,
    plenum: t.plenum,
    penalties: t.penalties.length,
    bakery: gs.bakery,
  };
}

// ── Resolution ──────────────────────────────────────────────────────────

/** Right: dark → bright → won. Wrong: bright → dark → lost, unless Streik shields the turn. */
function resolveBuilding(
  before: BuildingStatus,
  correct: boolean,
  shield: boolean,
): { after: BuildingStatus; shielded: boolean } {
  if (correct) return { after: before === "dark" ? "bright" : "won", shielded: false };
  if (shield) return { after: before, shielded: true };
  return { after: before === "dark" ? "lost" : "dark", shielded: false };
}

/**
 * Turn-boundary bookkeeping, run once after every judged question. Order
 * matters: a bakery run is judged on its own terms, then the win, then the
 * loss, then deck exhaustion — which is checked only here, so a mid-turn
 * discard still lets the current question play out.
 */
export function endTurn(gs: Gs): Gs {
  const won = wonCount(gs);
  const lost = lostCount(gs);
  const deckEmpty = gs.drawPile.length === 0;

  if (gs.bakery) {
    if (won === BUILDING_COUNT) return finish(gs, "win", true);
    // The win was banked at the offer; the run just ends at the first lost
    // building or when the holder runs dry (ASSUMED).
    if (lost > 0 || deckEmpty) return finish(gs, "win", false);
    return nextTurn(gs);
  }

  if (won >= requiredFor(gs)) {
    if (lost === 0 && !deckEmpty && won < BUILDING_COUNT) return { ...gs, phase: "bakery-offer" };
    return finish(gs, "win");
  }

  if (lost >= lossAtFor(gs)) {
    // Besetzung "can also be played right after the losing answer": hold the
    // loss while a face-up copy and cards to continue with both exist.
    if (helpPlayable(gs, "besetzung") && !deckEmpty) return { ...gs, phase: "loss-pending" };
    return finish(gs, "loss-buildings");
  }

  if (deckEmpty) return finish(gs, "loss-deck");
  return nextTurn(gs);
}

function applyJudge(gs: Gs, correct: boolean): Gs {
  const t = gs.turn;
  const q = t.question;
  const bi = t.buildingIndex;
  if (!q || bi === null) throw new Error("no question to judge");

  const before = gs.buildings[bi];
  const { after, shielded } = resolveBuilding(before, correct, t.shield);
  const buildings = gs.buildings.slice();
  buildings[bi] = after;

  // A building going to the dark side turns the next help card face up
  // (bright → dark is a setback, not a loss). Revival never lowers it.
  const helpOpen =
    after === "lost" && before !== "lost"
      ? Math.min(gs.helpOpen + 1, gs.helpDeck.length)
      : gs.helpOpen;

  // Expert: a question answered alone — no tip flipped, no plenum — earns a
  // tip card back. Help cards do not break "alone" (ASSUMED).
  let tipCards = gs.tipCards;
  if (tipCards && correct && t.tipFlips === 0 && !t.plenum) {
    tipCards = { ...tipCards, active: Math.min(tipCards.active + 1, tipCards.total) };
  }

  const next: Gs = {
    ...gs,
    buildings,
    helpOpen,
    tipCards,
    questionLog: [...gs.questionLog, logEntry(gs, q, correct, shielded, before, after)],
    lastResolution: { turn: t.index, buildingIndex: bi, correct, before, after, shielded },
  };
  return endTurn(next);
}

// ── Help cards ──────────────────────────────────────────────────────────

function applyHelp(
  gs: Gs,
  seat: number,
  helpId: HelpCardId,
  buildingIndex: number | undefined,
  source: QuestionSource,
): Gs {
  const helpDeck = gs.helpDeck.map((c) => (c.id === helpId ? { ...c, used: true } : c));
  const marked = withTurn({ ...gs, helpDeck }, { helpPlayed: [...gs.turn.helpPlayed, helpId] });

  switch (helpCardDef(helpId).effect) {
    case "return-lost-building": {
      if (buildingIndex === undefined) throw new Error("Besetzung needs a building");
      const buildings = marked.buildings.slice();
      buildings[buildingIndex] = "dark";
      const revived = { ...marked, buildings };
      // On the losing answer the turn had already been judged: re-run the
      // boundary so play passes on (the loss no longer holds).
      return gs.phase === "loss-pending" ? endTurn(revived) : revived;
    }
    case "peek-answer":
      return withTurn(marked, { peekSeat: seat });
    case "reader-tip":
      return withTurn(marked, { readerHint: "word" });
    case "reader-mime":
      return withTurn(marked, { readerHint: "mime" });
    case "redraw-question": {
      const q = marked.turn.question;
      const bi = marked.turn.buildingIndex;
      if (!q || bi === null) throw new Error("no question to redraw");
      // The dropped question is logged unjudged (`correct: null`); tip flips,
      // the shield and a Datenleak peek carry over to the new one (ASSUMED).
      const status = marked.buildings[bi];
      const entry = logEntry(marked, q, null, false, status, status);
      const { next, question } = drawQuestion(marked, bi, source);
      return withTurn(
        { ...next, questionLog: [...next.questionLog, entry] },
        { question, discards: next.turn.discards + 1 },
      );
    }
    case "shield":
      return withTurn(marked, { shield: true });
  }
}

// ── Expert mode ─────────────────────────────────────────────────────────

function applyFlip(gs: Gs): Gs {
  const tip = gs.tipCards;
  if (!tip) throw new Error("no tip cards in play");
  const tipFlips = gs.turn.tipFlips + 1;
  // The second flip opens the plenum: everyone (bar the peeker) discusses.
  return withTurn(
    { ...gs, tipCards: { ...tip, active: tip.active - 1 } },
    { tipFlips, plenum: gs.turn.plenum || tipFlips >= 2 },
  );
}

function applyReactivate(gs: Gs): Gs {
  const tip = gs.tipCards;
  if (!tip) throw new Error("no tip cards in play");
  const discarded = discardCards(gs, 1);
  return { ...discarded, tipCards: { ...tip, active: tip.active + 1 } };
}

/** Flip what tip cards are left, then discard question cards for the shortfall. */
function applyPenalty(gs: Gs, seat: number, severity: PenaltySeverity): Gs {
  const tip = gs.tipCards;
  if (!tip) throw new Error("no tip cards in play");
  const n = severity === "tip" ? 1 : 2;
  const flips = Math.min(n, tip.active);
  const flipped: Gs = { ...gs, tipCards: { ...tip, active: tip.active - flips } };
  const discarded = discardCards(flipped, n - flips);
  return withTurn(discarded, { penalties: [...discarded.turn.penalties, { severity, by: seat }] });
}

// ── Entry point ─────────────────────────────────────────────────────────

/**
 * Apply one action for `seat`. The action must be structurally one of
 * `getLegalActions(gs, seat)`; the matched ENGINE object is what gets
 * applied, so nothing beyond the discriminator ever reaches game logic.
 */
export function applyAction(gs: Gs, seat: number, action: QuiztopiaAction, deps: EngineDeps): Gs {
  const match = getLegalActions(gs, seat).find((a) => canonicalEquals(a, action));
  if (!match) {
    throw new Error(`illegal action "${action.kind}" for seat ${seat} in phase ${gs.phase}`);
  }

  switch (match.kind) {
    case "choose-building": {
      const { next, question } = drawQuestion(gs, match.buildingIndex, deps.source);
      return {
        ...withTurn(next, { buildingIndex: match.buildingIndex, question }),
        phase: "question",
      };
    }
    case "reveal":
      return { ...withTurn(gs, { revealed: true }), phase: "judge" };
    case "judge":
      return applyJudge(gs, match.correct);
    case "play-help":
      return applyHelp(gs, seat, match.helpId, match.buildingIndex, deps.source);
    case "flip-tip-card":
      return applyFlip(gs);
    case "reactivate-tip":
      return applyReactivate(gs);
    case "penalty":
      return applyPenalty(gs, seat, match.severity);
    case "bakery":
      return match.accept ? nextTurn({ ...gs, bakery: true }) : finish(gs, "win");
    case "accept-loss":
      return finish(gs, "loss-buildings");
  }
}
