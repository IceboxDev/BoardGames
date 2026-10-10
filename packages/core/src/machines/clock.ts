/**
 * Game clocks — pure time-control arithmetic any turn-based game can reuse.
 * The machine owns WHEN a turn started; this file owns what a move costs and
 * how long until a flag falls.
 *
 *   - none     — untimed.
 *   - fischer  — main time; each move adds `incrementSec` (capped at `maxSec`).
 *   - byoyomi  — Japanese: main time, then `periods` periods of `periodSec`.
 *                A move inside a period resets it; overrunning one uses it up.
 */

import { z } from "zod";

export const TimeControlSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("none") }),
  z.object({
    kind: z.literal("fischer"),
    mainSec: z
      .number()
      .int()
      .min(10)
      .max(3 * 3600),
    incrementSec: z.number().int().min(0).max(600),
    maxSec: z
      .number()
      .int()
      .min(10)
      .max(6 * 3600)
      .optional(),
  }),
  z.object({
    kind: z.literal("byoyomi"),
    mainSec: z
      .number()
      .int()
      .min(0)
      .max(3 * 3600),
    periods: z.number().int().min(1).max(30),
    periodSec: z.number().int().min(5).max(600),
  }),
]);
export type TimeControl = z.infer<typeof TimeControlSchema>;

/** One seat's clock between moves. */
export interface SeatClock {
  /** Main time left (ms). */
  readonly mainMs: number;
  /** Byo-yomi periods left; 0 for other kinds. */
  readonly periodsLeft: number;
}

export function initialClock(tc: TimeControl): SeatClock {
  switch (tc.kind) {
    case "none":
      return { mainMs: 0, periodsLeft: 0 };
    case "fischer":
      return { mainMs: tc.mainSec * 1000, periodsLeft: 0 };
    case "byoyomi":
      return { mainMs: tc.mainSec * 1000, periodsLeft: tc.periods };
  }
}

/** How long the seat may think on this move before its flag falls; Infinity when untimed. */
export function msUntilFlag(tc: TimeControl, clock: SeatClock): number {
  switch (tc.kind) {
    case "none":
      return Number.POSITIVE_INFINITY;
    case "fischer":
      return clock.mainMs;
    case "byoyomi":
      return clock.mainMs + clock.periodsLeft * tc.periodSec * 1000;
  }
}

/** The clock after a move that took `elapsedMs`, or `null` when the flag fell first. */
export function chargeMove(tc: TimeControl, clock: SeatClock, elapsedMs: number): SeatClock | null {
  const elapsed = Math.max(0, elapsedMs);
  switch (tc.kind) {
    case "none":
      return clock;
    case "fischer": {
      const left = clock.mainMs - elapsed;
      if (left <= 0) return null;
      const cap = tc.maxSec === undefined ? Number.POSITIVE_INFINITY : tc.maxSec * 1000;
      return { mainMs: Math.min(cap, left + tc.incrementSec * 1000), periodsLeft: 0 };
    }
    case "byoyomi": {
      if (elapsed < clock.mainMs)
        return { mainMs: clock.mainMs - elapsed, periodsLeft: clock.periodsLeft };
      const overflow = elapsed - clock.mainMs;
      const periodMs = tc.periodSec * 1000;
      const used = Math.floor(overflow / periodMs);
      const left = clock.periodsLeft - used;
      if (left <= 0) return null;
      return { mainMs: 0, periodsLeft: left };
    }
  }
}

/** What a clock face shows `elapsedMs` into the seat's turn. */
export interface ClockFace {
  /** Main time left, or the current period's time once main time is gone (ms). */
  readonly showMs: number;
  readonly inOvertime: boolean;
  readonly periodsLeft: number;
}

export function clockFace(tc: TimeControl, clock: SeatClock, elapsedMs: number): ClockFace {
  const elapsed = Math.max(0, elapsedMs);
  if (tc.kind === "byoyomi") {
    if (elapsed < clock.mainMs) {
      return { showMs: clock.mainMs - elapsed, inOvertime: false, periodsLeft: clock.periodsLeft };
    }
    const periodMs = tc.periodSec * 1000;
    const overflow = elapsed - clock.mainMs;
    const used = Math.floor(overflow / periodMs);
    const left = Math.max(0, clock.periodsLeft - used);
    return {
      showMs: left > 0 ? periodMs - (overflow % periodMs) : 0,
      inOvertime: true,
      periodsLeft: left,
    };
  }
  return { showMs: Math.max(0, clock.mainMs - elapsed), inOvertime: false, periodsLeft: 0 };
}

/** setTimeout's ceiling — a longer delay fires at once, so timers clamp to it. */
export const MAX_TIMER_MS = 2_147_483_647;
