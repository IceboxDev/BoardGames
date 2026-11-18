import type { ClueCount } from "@boardgames/core/games/codenames/clue-rules";
import type { SeatPresenceView } from "@boardgames/core/games/codenames/seat-presence";
import type { CoverTone } from "./WordGrid";

// What every word-card table (Codenames, Duet) derives from its view for the
// shared chrome, in shapes that know nothing of teams or key sides: each game
// maps its own view into these (`codenames/logic/table.ts`,
// `codenames-duet/logic.ts`). Pure, so they are tested on their own.

/** One of the viewer's clues, as the clue strip shows it. */
export interface StripClue {
  /** The clue's turn — what a sticky note refers to. */
  turn: number;
  word: string;
  count: ClueCount;
  /** Agents found on that clue's turn. */
  found: number;
  /** Cards carrying it as a sticky note (operatives). */
  pinned: number;
  /**
   * Its giver only: the cards it was aimed at that are still face down, or
   * null when its targets weren't marked.
   */
  owed: number[] | null;
}

/** How one touch went, for whoever reads the line. */
export type TouchMark = "own" | "bystander" | "opponent" | "assassin";

/** The last finished turn in one line: who played, the clue, each touch. */
export interface LastTurnSummary {
  who: string;
  tone: CoverTone;
  clue: { word: string; count: ClueCount } | null;
  touches: { word: string; mark: TouchMark }[];
  /** What to say when nothing was touched ("ran out of time to guess"). */
  idle: string;
}

/** Someone who dropped out, as the people still at the table see it. */
export interface AwayNotice {
  seat: number;
  since: number;
  handoverAt: number;
  /** The game can't go on without this seat right now. */
  blocking: boolean;
}

/** The away seats this viewer could hand to the AI (or soon can), most urgent first. */
export function awayNoticesOf(
  seats: readonly (SeatPresenceView & { seat: number })[],
  viewer: number,
  canHandOver: boolean,
  blocking: (seat: number) => boolean,
): AwayNotice[] {
  if (!canHandOver) return [];
  return seats
    .flatMap((s) =>
      s.awaySince !== null && s.handoverAt !== null && !s.standIn && s.seat !== viewer
        ? [
            {
              seat: s.seat,
              since: s.awaySince,
              handoverAt: s.handoverAt,
              blocking: blocking(s.seat),
            },
          ]
        : [],
    )
    .sort((a, b) => Number(b.blocking) - Number(a.blocking) || a.since - b.since);
}

/**
 * The latest touches on the table: the live turn's once it has any, else the
 * last finished turn's — numbered in order (card → 1-based place), so whoever
 * looks up between turns sees what just happened.
 */
export function latestTouchOrder<T extends { guesses: readonly { card: number }[] }>(
  turns: readonly T[],
): { turn: T; order: Map<number, number> } | null {
  for (let i = turns.length - 1; i >= 0; i--) {
    const turn = turns[i];
    if (!turn || turn.guesses.length === 0) continue;
    return { turn, order: new Map(turn.guesses.map((g, n) => [g.card, n + 1])) };
  }
  return null;
}

/** A line under the result: a room waiting on its host, a refused rematch. */
export type ReviewNotice = { text: string; tone: "info" | "error" };

/**
 * The room's line under a game-over result, the same in every table game: why
 * a rematch couldn't start, else (a guest) that the host decides what's next.
 */
export function roomNotice({
  error,
  waitingForHost,
}: {
  error: string | null;
  waitingForHost: boolean;
}): ReviewNotice | null {
  if (error) return { text: error, tone: "error" };
  if (waitingForHost) {
    return { text: "Waiting for the host — they can start a rematch at this table", tone: "info" };
  }
  return null;
}
