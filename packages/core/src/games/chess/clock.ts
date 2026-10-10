/**
 * A Fischer-increment chess clock as plain data. The server is the only
 * timekeeper: it presses the clock when a move arrives and flags a side when
 * its time runs out. Browsers count down from the last view (`ClockView`).
 */

import type { Color } from "./engine/types";
import type { ClockView, TimeControl } from "./schemas";

export interface ClockState {
  readonly remainingMs: Readonly<Record<Color, number>>;
  /** Whose time is running, or `null` once the game is over. */
  readonly running: Color | null;
  /** When `running`'s current stint began (epoch ms). */
  readonly since: number;
  readonly incrementMs: number;
}

export function startClock(control: TimeControl, firstToMove: Color, now: number): ClockState {
  return {
    remainingMs: { w: control.initialMs, b: control.initialMs },
    running: firstToMove,
    since: now,
    incrementMs: control.incrementMs,
  };
}

/** Time left for `color` at `now`. */
export function remaining(clock: ClockState, color: Color, now: number): number {
  const left = clock.remainingMs[color];
  return clock.running === color ? left - Math.max(0, now - clock.since) : left;
}

/** Has the running side run out at `now`? */
export function flagged(clock: ClockState, now: number): boolean {
  return clock.running !== null && remaining(clock, clock.running, now) <= 0;
}

/** Milliseconds from `now` until the running side flags (`Infinity` when stopped). */
export function msUntilFlag(clock: ClockState, now: number): number {
  if (clock.running === null) return Number.POSITIVE_INFINITY;
  return Math.max(0, remaining(clock, clock.running, now));
}

/** The mover finishes a move: charge the stint, add the increment, start the other side. */
export function pressClock(clock: ClockState, now: number): ClockState {
  const mover = clock.running;
  if (mover === null) return clock;
  const left = remaining(clock, mover, now) + clock.incrementMs;
  return {
    ...clock,
    remainingMs: { ...clock.remainingMs, [mover]: left },
    running: mover === "w" ? "b" : "w",
    since: now,
  };
}

/** Freeze the clock (game over): charge the running stint and stop. */
export function stopClock(clock: ClockState, now: number): ClockState {
  const mover = clock.running;
  if (mover === null) return clock;
  return {
    ...clock,
    remainingMs: { ...clock.remainingMs, [mover]: Math.max(0, remaining(clock, mover, now)) },
    running: null,
    since: now,
  };
}

/**
 * Hand the move to `color` without charging anyone — after a takeback the
 * side to move changes, but nobody "spent" the rewound time twice.
 */
export function resumeFor(clock: ClockState, color: Color, now: number): ClockState {
  const stopped = stopClock(clock, now);
  return { ...stopped, running: color, since: now };
}

export function clockView(clock: ClockState, now: number): ClockView {
  return {
    remainingMs: {
      w: Math.max(0, remaining(clock, "w", now)),
      b: Math.max(0, remaining(clock, "b", now)),
    },
    running: clock.running,
    incrementMs: clock.incrementMs,
    serverNow: now,
  };
}
