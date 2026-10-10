/**
 * The whole of a Go session as pure data and pure transitions: the machine
 * (`machine.ts`) only decides WHEN these run. Seat index = colour.
 *
 * Over the board game itself this adds clocks, take-backs, resignation and the
 * scoring phase:
 *   two passes → a dead-stone proposal → each side may toggle chains, accept
 *   or resume play. Both accept → counted. A toggle clears both acceptances;
 *   an accept names the proposal (`key`) it agrees to. After MAX_RESUMES
 *   resumptions every stone counts as alive (settle it on the board).
 */

import {
  chargeMove,
  initialClock,
  msUntilFlag,
  type SeatClock,
  type TimeControl,
} from "../../machines/clock";
import { isLegal, legalPoints, newGame, play, rewind } from "./game";
import { type GoConfig, type GoStrategy, komiFor } from "./manifest";
import { areaScore, chainStones, type ScoreBreakdown } from "./scoring";
import { type Color, EMPTY, type GoGame, other } from "./types";
import type { GoAction, GoResult } from "./view";

export const MAX_RESUMES = 3;
/** One side accepted and the other went quiet this long: the game is counted. */
export const SCORING_IDLE_MS = 3 * 60_000;

export interface GoScoring {
  readonly dead: readonly number[];
  readonly accepted: readonly [boolean, boolean];
  /** The AI's own view of the dead stones, when an AI sits at the table. */
  readonly aiDead: readonly number[] | null;
  readonly proposing: boolean;
}

export interface GoSession {
  readonly game: GoGame;
  readonly timeControl: TimeControl;
  /** Strategy per colour; `null` for a person. */
  readonly seats: readonly [GoStrategy | null, GoStrategy | null];
  readonly seed: number;
  readonly clocks: readonly [SeatClock, SeatClock];
  readonly turnStartedAt: number;
  /** Thinking time of each move in `game.moves`. */
  readonly moveMs: readonly number[];
  readonly undoRequest: { readonly by: Color } | null;
  readonly undos: readonly { readonly atMove: number; readonly by: Color }[];
  readonly scoring: GoScoring | null;
  readonly resumes: number;
  readonly end: GoResult | null;
  readonly aiDegraded: boolean;
}

export function startSession(
  config: GoConfig,
  seats: readonly [GoStrategy | null, GoStrategy | null],
  seed: number,
  now: number,
): GoSession {
  const clock = initialClock(config.timeControl);
  return {
    game: newGame({ size: config.size, komi: komiFor(config), handicap: config.handicap }),
    timeControl: config.timeControl,
    seats,
    seed,
    clocks: [clock, clock],
    turnStartedAt: now,
    moveMs: [],
    undoRequest: null,
    undos: [],
    scoring: null,
    resumes: 0,
    end: null,
    aiDegraded: false,
  };
}

// ── Queries ────────────────────────────────────────────────────────────────

export function isAi(s: GoSession, color: Color): boolean {
  return s.seats[color] !== null;
}

export function isLocked(s: GoSession): boolean {
  return s.resumes >= MAX_RESUMES;
}

/** A short stable name for a proposal. */
export function proposalKey(s: GoSession): string {
  const dead = s.scoring?.dead ?? [];
  let h = 0x811c9dc5;
  for (const p of dead) {
    h ^= p;
    h = Math.imul(h, 0x01000193);
  }
  return `${s.game.moves.length}.${s.resumes}.${dead.length}.${(h >>> 0).toString(36)}`;
}

export function scoringBreakdown(s: GoSession): ScoreBreakdown {
  const { game } = s;
  return areaScore(game.board, game.size, s.scoring?.dead ?? [], game.komi, game.handicap);
}

/** How long the side to move may still think, from `now`. */
export function msLeftOnTurn(s: GoSession, now: number): number {
  return msUntilFlag(s.timeControl, s.clocks[s.game.toMove]) - (now - s.turnStartedAt);
}

export function legalActionsFor(s: GoSession, seat: number): GoAction[] {
  if (s.end || (seat !== 0 && seat !== 1)) return [];
  const color = seat as Color;
  if (isAi(s, color)) return [];
  const out: GoAction[] = [{ type: "resign" }];
  if (s.scoring) {
    if (s.scoring.proposing) return out;
    out.push({ type: "resume" });
    if (!s.scoring.accepted[color]) out.push({ type: "accept-score", key: proposalKey(s) });
    if (!isLocked(s)) {
      for (let p = 0; p < s.game.board.length; p++) {
        if (s.game.board[p] !== EMPTY) out.push({ type: "toggle-dead", point: p });
      }
    }
    return out;
  }
  const { game } = s;
  if (game.toMove === color) {
    for (const p of legalPoints(game)) out.push({ type: "play", point: p });
    out.push({ type: "pass" });
  }
  const last = game.moves.at(-1);
  if (isAi(s, other(color))) {
    if (game.moves.some((m) => m.color === color)) out.push({ type: "undo" });
  } else if (last && last.color === color && game.toMove !== color && !s.undoRequest) {
    out.push({ type: "undo" });
  }
  if (s.undoRequest && s.undoRequest.by !== color) {
    out.push({ type: "undo-accept" }, { type: "undo-decline" });
  }
  return out;
}

// ── Transitions ────────────────────────────────────────────────────────────

function ended(s: GoSession, end: GoResult): GoSession {
  return { ...s, end, scoring: null, undoRequest: null };
}

function letter(c: Color): string {
  return c === 0 ? "B" : "W";
}

/** A stone or pass by the side to move, with its clock charged. */
export function applyMove(s: GoSession, point: number | null, now: number): GoSession {
  const color = s.game.toMove;
  const elapsed = now - s.turnStartedAt;
  const charged = chargeMove(s.timeControl, s.clocks[color], elapsed);
  if (charged === null) return timeout(s);
  const game = play(s.game, point);
  const clocks: [SeatClock, SeatClock] = [s.clocks[0], s.clocks[1]];
  clocks[color] = charged;
  let next: GoSession = {
    ...s,
    game,
    clocks,
    turnStartedAt: now,
    moveMs: [...s.moveMs, elapsed],
    undoRequest: null,
  };
  if (game.consecutivePasses >= 2) {
    next = {
      ...next,
      scoring: { dead: [], accepted: [false, false], aiDead: null, proposing: !isLocked(next) },
    };
    if (isLocked(next)) next = aiRespond(next, now);
  }
  return next;
}

export function timeout(s: GoSession): GoSession {
  const loser = s.game.toMove;
  const winner = other(loser);
  return ended(s, {
    reason: "timeout",
    winner,
    result: `${letter(winner)}+T`,
    breakdown: null,
    dead: [],
  });
}

export function resign(s: GoSession, by: Color): GoSession {
  const winner = other(by);
  return ended(s, {
    reason: "resign",
    winner,
    result: `${letter(winner)}+R`,
    breakdown: null,
    dead: [],
  });
}

function takeBack(s: GoSession, toMoveCount: number, by: Color, now: number): GoSession {
  return {
    ...s,
    game: rewind(s.game, toMoveCount),
    moveMs: s.moveMs.slice(0, toMoveCount),
    undos: [...s.undos, { atMove: toMoveCount, by }],
    undoRequest: null,
    turnStartedAt: now,
  };
}

/** Count the board with the agreed dead stones. */
export function finalizeScore(s: GoSession): GoSession {
  const breakdown = scoringBreakdown(s);
  return ended(s, {
    reason: "score",
    winner: breakdown.winner,
    result: breakdown.result,
    breakdown,
    dead: [...(s.scoring?.dead ?? [])],
  });
}

function resume(s: GoSession, now: number): GoSession {
  return {
    ...s,
    scoring: null,
    resumes: s.resumes + 1,
    game: { ...s.game, consecutivePasses: 0 },
    turnStartedAt: now,
  };
}

function sameSet(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((p) => set.has(p));
}

/**
 * The AI's side of the scoring phase: it accepts a proposal that matches its
 * own reading (any proposal once locked), and resumes play when a person has
 * accepted one it disagrees with. Settles the game when both sides agree.
 */
export function aiRespond(s: GoSession, now: number): GoSession {
  const sc = s.scoring;
  if (!sc || sc.proposing) return s;
  const accepted: [boolean, boolean] = [sc.accepted[0], sc.accepted[1]];
  for (const c of [0, 1] as const) {
    if (!isAi(s, c)) continue;
    const agrees = isLocked(s) || sc.aiDead === null || sameSet(sc.dead, sc.aiDead);
    if (agrees) accepted[c] = true;
    else if (accepted[other(c)]) return resume(s, now);
  }
  const next = { ...s, scoring: { ...sc, accepted } };
  return accepted[0] && accepted[1] ? finalizeScore(next) : next;
}

/** The dead-stone proposal arrived. */
export function setProposal(s: GoSession, dead: readonly number[], now: number): GoSession {
  if (!s.scoring) return s;
  const onBoard = dead.filter((p) => s.game.board[p] !== EMPTY);
  const sorted = [...new Set(onBoard)].sort((a, b) => a - b);
  return aiRespond(
    {
      ...s,
      scoring: {
        dead: sorted,
        accepted: [false, false],
        aiDead: s.seats.some((x) => x !== null) ? sorted : null,
        proposing: false,
      },
    },
    now,
  );
}

/** One seat's action — already checked against `legalActionsFor`. */
export function applyAction(s: GoSession, seat: Color, action: GoAction, now: number): GoSession {
  switch (action.type) {
    case "play":
      return applyMove(s, action.point, now);
    case "pass":
      return applyMove(s, null, now);
    case "resign":
      return resign(s, seat);
    case "undo": {
      if (isAi(s, other(seat))) {
        let i = s.game.moves.length - 1;
        while (i >= 0 && s.game.moves[i]?.color !== seat) i--;
        return i < 0 ? s : takeBack(s, i, seat, now);
      }
      return { ...s, undoRequest: { by: seat } };
    }
    case "undo-accept": {
      const req = s.undoRequest;
      if (!req) return s;
      return takeBack(s, s.game.moves.length - 1, req.by, now);
    }
    case "undo-decline":
      return { ...s, undoRequest: null };
    case "toggle-dead": {
      const sc = s.scoring;
      if (!sc) return s;
      const chain = chainStones(s.game.board, s.game.size, action.point);
      const current = new Set(sc.dead);
      const allDead = chain.every((p) => current.has(p));
      for (const p of chain) {
        if (allDead) current.delete(p);
        else current.add(p);
      }
      const dead = [...current].sort((a, b) => a - b);
      return aiRespond({ ...s, scoring: { ...sc, dead, accepted: [false, false] } }, now);
    }
    case "accept-score": {
      const sc = s.scoring;
      if (!sc) return s;
      const accepted: [boolean, boolean] = [sc.accepted[0], sc.accepted[1]];
      accepted[seat] = true;
      const next = { ...s, scoring: { ...sc, accepted } };
      if (accepted[0] && accepted[1]) return finalizeScore(next);
      return aiRespond(next, now);
    }
    case "resume":
      return resume(s, now);
  }
}

/** An AI's move, re-checked: an illegal one becomes a pass rather than a crash. */
export function applyAiMove(
  s: GoSession,
  point: number | null,
  degraded: boolean,
  now: number,
): GoSession {
  if (s.end || s.scoring || !isAi(s, s.game.toMove)) return s;
  const legal = point === null || isLegal(s.game, point);
  const next = applyMove(s, legal ? point : null, now);
  return degraded ? { ...next, aiDegraded: true } : next;
}
