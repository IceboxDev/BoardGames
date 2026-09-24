// Derived facts about a Quiztopia state and the legal-action enumeration.
// Everything here is pure and total: `getLegalActions` returns [] for any
// seat that is not at the table and once the game is over, and it lists
// EXACTLY the actions `applyAction` accepts — the validator, the engine and
// the UI all drive from this one list, so they can never disagree.

import { QUIZTOPIA_REQUIRED, quiztopiaLossAt } from "../../history/coop-challenge.ts";
import type {
  HelpCardId,
  HelpCardState,
  QuiztopiaAction,
  QuiztopiaGameState,
  TurnState,
} from "./types.ts";

// ── Seating ─────────────────────────────────────────────────────────────

/** The seat that plays after `seat`: to the LEFT, i.e. next in table order. */
export function seatAfter(seats: readonly number[], seat: number): number {
  const i = seats.indexOf(seat);
  if (i === -1) throw new Error(`seat ${seat} is not at the table`);
  return seats[(i + 1) % seats.length];
}

/**
 * The seat that reads the card for `seat`: to the RIGHT, i.e. previous in
 * table order. Null when playing alone — solo has no reader and the answer
 * stays hidden until reveal.
 */
export function readerFor(seats: readonly number[], seat: number): number | null {
  if (seats.length < 2) return null;
  const i = seats.indexOf(seat);
  if (i === -1) throw new Error(`seat ${seat} is not at the table`);
  return seats[(i - 1 + seats.length) % seats.length];
}

export function isSeated(gs: QuiztopiaGameState, seat: number): boolean {
  return Number.isInteger(seat) && gs.seats.includes(seat);
}

/** A blank turn record for `activeSeat`; the reader is derived from the seating. */
export function freshTurn(seats: readonly number[], activeSeat: number, index: number): TurnState {
  return {
    index,
    activeSeat,
    readerSeat: readerFor(seats, activeSeat),
    buildingIndex: null,
    question: null,
    revealed: false,
    tipFlips: 0,
    plenum: false,
    peekSeat: null,
    readerHint: null,
    shield: false,
    helpPlayed: [],
    penalties: [],
    discards: 0,
  };
}

// ── Counts + thresholds ─────────────────────────────────────────────────

export function wonCount(gs: QuiztopiaGameState): number {
  return gs.buildings.filter((b) => b === "won").length;
}

export function lostCount(gs: QuiztopiaGameState): number {
  return gs.buildings.filter((b) => b === "lost").length;
}

/** Buildings still in play (dark or bright). */
export function inMiddle(gs: QuiztopiaGameState): number {
  return gs.buildings.filter((b) => b === "dark" || b === "bright").length;
}

/** Buildings the tier needs won (rulebook table, shared with match history). */
export function requiredFor(gs: QuiztopiaGameState): number {
  return QUIZTOPIA_REQUIRED[gs.difficulty] ?? QUIZTOPIA_REQUIRED[0];
}

/** Lost-building count that ends the game (one more than the tier tolerates). */
export function lossAtFor(gs: QuiztopiaGameState): number {
  return quiztopiaLossAt(gs.difficulty);
}

// ── Help cards ──────────────────────────────────────────────────────────

export function helpFaceUp(gs: QuiztopiaGameState): HelpCardState[] {
  return gs.helpDeck.slice(0, gs.helpOpen);
}

/** Face-up and not yet used — the only two things every help card needs. */
export function helpPlayable(gs: QuiztopiaGameState, id: HelpCardId): boolean {
  return helpFaceUp(gs).some((c) => c.id === id && !c.used);
}

// ── Visibility ──────────────────────────────────────────────────────────

/**
 * Who may see the answer: everyone after reveal, the reader from turn start
 * (they hold the physical card) and the seat that peeked via Datenleak.
 */
export function answerVisibleTo(gs: QuiztopiaGameState, seat: number): boolean {
  const t = gs.turn;
  return t.revealed || seat === t.readerSeat || seat === t.peekSeat;
}

// ── Legal actions ───────────────────────────────────────────────────────

/** Besetzung is one entry per lost building, so the client never picks a target the engine can't apply. */
function pushBesetzung(gs: QuiztopiaGameState, out: QuiztopiaAction[]): void {
  if (!helpPlayable(gs, "besetzung")) return;
  gs.buildings.forEach((status, buildingIndex) => {
    if (status === "lost") out.push({ kind: "play-help", helpId: "besetzung", buildingIndex });
  });
}

function pushStreik(gs: QuiztopiaGameState, out: QuiztopiaAction[]): void {
  if (helpPlayable(gs, "streik") && !gs.turn.shield)
    out.push({ kind: "play-help", helpId: "streik" });
}

/** Expert penalties are pressed by any seat (someone owns up, or the table agrees). */
function pushPenalties(gs: QuiztopiaGameState, out: QuiztopiaAction[]): void {
  if (!gs.tipCards) return;
  out.push({ kind: "penalty", severity: "tip" }, { kind: "penalty", severity: "answer" });
}

/**
 * Every action `seat` may take right now. Total: an unknown seat, a seat not
 * at the table, or a finished game yields [].
 */
export function getLegalActions(gs: QuiztopiaGameState, seat: number): QuiztopiaAction[] {
  if (!isSeated(gs, seat)) return [];
  if (gs.outcome !== null || gs.phase === "game-over") return [];

  const out: QuiztopiaAction[] = [];
  const t = gs.turn;
  const active = seat === t.activeSeat;

  switch (gs.phase) {
    case "choose-building": {
      if (active) {
        gs.buildings.forEach((status, buildingIndex) => {
          if (status === "dark" || status === "bright") {
            out.push({ kind: "choose-building", buildingIndex });
          }
        });
      }
      pushBesetzung(gs, out);
      break;
    }

    case "question": {
      if (active) out.push({ kind: "reveal" });
      pushBesetzung(gs, out);
      // Datenleak: a seat that neither answers nor reads. In 2p the only
      // other seat is the reader, so it is never legal there.
      if (
        helpPlayable(gs, "datenleak") &&
        !active &&
        seat !== t.readerSeat &&
        t.peekSeat === null
      ) {
        out.push({ kind: "play-help", helpId: "datenleak" });
      }
      if (t.readerSeat !== null && t.readerHint === null) {
        if (helpPlayable(gs, "insidertipp")) {
          out.push({ kind: "play-help", helpId: "insidertipp" });
        }
        if (helpPlayable(gs, "benefizvorstellung")) {
          out.push({ kind: "play-help", helpId: "benefizvorstellung" });
        }
      }
      if (helpPlayable(gs, "alternative-fakten") && gs.drawPile.length > 0) {
        out.push({ kind: "play-help", helpId: "alternative-fakten" });
      }
      pushStreik(gs, out);
      if (gs.tipCards) {
        // Two flips open the plenum; nobody flips after that.
        if (!active && gs.tipCards.active > 0 && t.tipFlips < 2 && !t.plenum) {
          out.push({ kind: "flip-tip-card" });
        }
        if (gs.tipCards.active === 0 && gs.drawPile.length > 0) {
          out.push({ kind: "reactivate-tip" });
        }
        pushPenalties(gs, out);
      }
      break;
    }

    case "judge": {
      if (active) out.push({ kind: "judge", correct: true }, { kind: "judge", correct: false });
      pushBesetzung(gs, out);
      pushStreik(gs, out);
      pushPenalties(gs, out);
      break;
    }

    case "bakery-offer": {
      if (active) out.push({ kind: "bakery", accept: true }, { kind: "bakery", accept: false });
      break;
    }

    case "loss-pending": {
      pushBesetzung(gs, out);
      out.push({ kind: "accept-loss" });
      break;
    }
  }

  return out;
}
