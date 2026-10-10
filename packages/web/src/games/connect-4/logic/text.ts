/**
 * Every Connect 4 word that depends on the game: whose seat is whose, how a
 * game ended, what the solver says. The history log, the status line, the
 * game-over screen, the analysis panel and the replay all read from here, so
 * a new end reason or verdict can't be worded in one place and missed in
 * another (the `Record`s fail the typecheck).
 */

import type {
  PositionEval,
  UnsolvedReason,
  Verdict,
} from "@boardgames/core/games/connect-4/solver/analysis";
import type { EndReason, GameRecord, Seat } from "@boardgames/core/games/connect-4/types";
import { DISC_COLORS } from "../components/board/palette";
import {
  type Change,
  classFor,
  type Flaw,
  type MoveStory,
  type Outcome,
  outcomeOf,
  type ResultClass,
} from "./analysis-model";

/** The seat's colour word. */
export function colourName(seat: Seat): string {
  return DISC_COLORS[seat].name;
}

/** Who sits at a seat: their name, or the colour when there is none. */
export function seatName(seat: Seat, names: readonly string[]): string {
  return names[seat] ?? colourName(seat);
}

/** The viewer's own seat is named "You" in a solo game (`useSessionFlow`): it takes "you" grammar. */
const isYou = (name: string) => name === "You";

/** "Red wins" / "You win": a seat as the subject of a verb. */
export function seatDoes(seat: Seat, names: readonly string[], verb: string, youVerb: string) {
  const name = seatName(seat, names);
  return `${name} ${isYou(name) ? youVerb : verb}`;
}

/** "their" / "your". */
function their(seat: Seat, names: readonly string[]): string {
  return isYou(seatName(seat, names)) ? "your" : "their";
}

/** 1st, 2nd, 3rd, 4th … 11th, 12th, 13th … 21st. */
export function ordinal(n: number): string {
  const teen = n % 100 >= 11 && n % 100 <= 13;
  const suffix = teen ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th");
  return `${n}${suffix}`;
}

// ── How a game ended ────────────────────────────────────────────────────────

export interface EndWords {
  /** The seat the history line opens with (coloured), or null for a draw. */
  actor: Seat | null;
  /** The history line, after the actor's name (or whole, for a draw). */
  log: string;
  /** One line over the board while the result shows. */
  status: string;
  /** A sentence for the game-over screen. */
  summary: string;
  /** The same as a phrase, for a one-line header (no full stop). */
  brief: string;
}

const DRAWS: Record<Exclude<EndReason, "connect" | "resign">, Omit<EndWords, "actor">> = {
  full: {
    log: "Draw — the board is full",
    status: "Drawn game — the board is full",
    summary: "The board filled up with no four in a row.",
    brief: "Drawn — the board filled up",
  },
  repetition: {
    log: "Draw — the same position came up three times",
    status: "Drawn game — the same position three times",
    summary: "The same position came up three times.",
    brief: "Drawn by repetition",
  },
  stalemate: {
    log: "Draw — no way forward",
    status: "Drawn game — no way forward",
    summary: "Nobody could make progress.",
    brief: "Drawn — no way forward",
  },
};

export function endWords(game: GameRecord, names: readonly string[]): EndWords {
  const name = (s: Seat) => seatName(s, names);
  switch (game.reason) {
    case "connect": {
      const winner = game.winner ?? 0;
      return {
        actor: winner,
        log: " connects four",
        status: `${name(winner)} connects four!`,
        summary: `${name(winner)} connected four in ${game.moves.length} moves.`,
        brief: `${name(winner)} connected four in ${game.moves.length} moves`,
      };
    }
    case "resign": {
      const resigned = game.resigned ?? (game.winner === 0 ? 1 : 0);
      const winner: Seat = resigned === 0 ? 1 : 0;
      return {
        actor: resigned,
        log: " resigns",
        status: `${name(winner)} wins — ${name(resigned)} resigned`,
        summary: `${name(resigned)} resigned.`,
        brief: `${name(resigned)} resigned after ${game.moves.length} moves`,
      };
    }
    default:
      return { actor: null, ...DRAWS[game.reason] };
  }
}

// ── The solver ──────────────────────────────────────────────────────────────

/** An outcome in words: "Red wins with their 7th disc from here", "Draw with best play". */
export function outcomeText(outcome: Outcome, names: readonly string[]): string {
  switch (outcome.kind) {
    case "draw":
      return "Draw with best play";
    case "unknown":
      return "Not solved";
    case "over":
      return outcome.winner === null
        ? "Drawn — the board is full"
        : `${seatDoes(outcome.winner, names, "has", "have")} four in a row`;
    case "win": {
      const wins = seatDoes(outcome.winner, names, "wins", "win");
      if (outcome.discs === 0) return `${wins} with best play`;
      if (outcome.discs === 1) return `${wins} with ${their(outcome.winner, names)} next disc`;
      return `${wins} with ${their(outcome.winner, names)} ${ordinal(outcome.discs)} disc from here`;
    }
  }
}

/** A verdict in words, `seat` being the side the verdict is from. */
export function verdictText(verdict: Verdict, seat: Seat, names: readonly string[]): string {
  return outcomeText(outcomeOf(verdict, seat), names);
}

/**
 * An outcome as a chip: `#7` (in the winner's colour: they win with their
 * 7th disc from here), `=` a draw, `won` / `drawn` a finished game, `?` unsolved.
 */
export function chipText(outcome: Outcome): string {
  switch (outcome.kind) {
    case "draw":
      return "=";
    case "unknown":
      return "?";
    case "over":
      return outcome.winner === null ? "drawn" : "won";
    case "win":
      return outcome.discs === 0 ? "win" : `#${outcome.discs}`;
  }
}

/** What a chip means, for its tooltip. */
export function chipTitle(outcome: Outcome, names: readonly string[]): string {
  return outcome.kind === "win" && outcome.discs > 0
    ? `${outcomeText(outcome, names)} (#${outcome.discs})`
    : outcomeText(outcome, names);
}

const RESULT_WORD: Record<ResultClass, string> = { win: "win", draw: "draw", loss: "loss" };

/** A short label for what a move changed. */
export const CHANGE_LABEL: Record<Change, string> = {
  kept: "Keeps the result",
  "kept-result": "Keeps the result",
  "slower-win": "Slower win",
  "faster-loss": "Faster loss",
  "win-to-draw": "Win → draw",
  "draw-to-loss": "Draw → loss",
  "win-to-loss": "Win → loss",
  unknown: "Not solved",
};

/** "3", "3 or 5", "2, 3 or 5" (1-based). */
export function columnsText(columns: readonly number[]): string {
  const words = columns.map((c) => String(c + 1));
  return words.length <= 1
    ? (words[0] ?? "")
    : `${words.slice(0, -1).join(", ")} or ${words.at(-1)}`;
}

/** "column 3" / "columns 3 or 5". */
export function columnsPhrase(columns: readonly number[]): string {
  return `${columns.length === 1 ? "column" : "columns"} ${columnsText(columns)}`;
}

/** "1 disc" / "3 discs". */
function discsText(n: number): string {
  return `${n} ${n === 1 ? "disc" : "discs"}`;
}

/** The chip of an outcome, in brackets for prose: " (#9)", or nothing. */
function chipNote(outcome: Outcome): string {
  return outcome.kind === "win" && outcome.discs > 0 ? ` (#${outcome.discs})` : "";
}

/** What a move did, as a sentence for the move card. */
export function storyText(story: MoveStory, names: readonly string[]): string {
  const mover = story.player;
  const result = classFor(story.before, mover);
  const holds = result ? RESULT_WORD[result] : "result";
  if (story.after.kind === "win" && story.after.winner === mover && story.after.discs === 1) {
    return "Connects four — the game is won.";
  }
  switch (story.change) {
    case "kept":
    case "kept-result":
      if (story.onlyMove) return `The only move that keeps the ${holds}.`;
      if (story.discsLost > 0) {
        return result === "loss"
          ? `Good — holds out${chipNote(story.after)}, a disc short of the longest defence${chipNote(story.before)}.`
          : `Good — keeps the ${holds}${chipNote(story.after)}, a disc off the fastest${chipNote(story.before)}.`;
      }
      if (result === "loss")
        return `The best defence — it holds out longest${chipNote(story.before)}.`;
      return `${story.grade === "best" ? "Best" : "Good"} — keeps the ${holds}${chipNote(story.after)}.`;
    case "slower-win":
      return `Still winning, but ${discsText(story.discsLost)} slower: ${chipText(story.after)} instead of ${chipText(story.before)}.`;
    case "faster-loss":
      return `Loses ${discsText(story.discsLost)} sooner than it had to: ${chipText(story.after)} instead of ${chipText(story.before)}.`;
    case "win-to-draw":
      return `Throws away the win: ${seatDoes(mover, names, "was", "were")} winning${chipNote(story.before)}, now it's a draw.`;
    case "win-to-loss":
      return `Turns a win into a loss: ${outcomeText(story.after, names)}.`;
    case "draw-to-loss":
      return `Loses the draw: ${outcomeText(story.after, names)}.`;
    case "unknown":
      return "The solver couldn't judge this move.";
  }
}

/** "Best: column 3 or 5." when the move wasn't one of them. */
export function bestText(story: MoveStory): string {
  if (story.best.length === 0 || story.best.includes(story.column)) return "";
  return `Best: ${columnsPhrase(story.best)}.`;
}

const FLAW_WORDS: Record<Flaw, readonly [one: string, many: string]> = {
  inaccuracy: ["inaccuracy", "inaccuracies"],
  mistake: ["mistake", "mistakes"],
  blunder: ["blunder", "blunders"],
};

/** Counts of a flaw: "1 inaccuracy", "2 inaccuracies". */
export function flawCount(flaw: Flaw, n: number): string {
  return `${n} ${FLAW_WORDS[flaw][n === 1 ? 0 : 1]}`;
}

const UNSOLVED: Record<UnsolvedReason, (board: string, reach: number) => string> = {
  popout: () => "PopOut can't be solved — positions repeat",
  "too-early": (board, reach) =>
    `${board} is too big to solve this early — exact from disc ${reach}`,
  budget: () => "Too deep to solve in time",
};

/** Why the solver has no verdict, in words. */
export function unsolvedText(
  reason: UnsolvedReason,
  board: { cols: number; rows: number },
  reach: number,
): string {
  return UNSOLVED[reason](`${board.cols}×${board.rows}`, reach);
}

/** The columns an evaluation recommends (drops only — a pop is shown on its arrow). */
export function bestColumns(evaluation: PositionEval): number[] {
  return evaluation.best.filter((b) => b.type === "drop").map((b) => b.column);
}

// ── Learning from mistakes ──────────────────────────────────────────────────

/** The task for one practice position. */
export function practicePrompt(story: MoveStory, names: readonly string[]): string {
  const result = classFor(story.before, story.player);
  const keep = result === "win" ? "keeps the win" : "keeps the draw";
  return `Move ${story.index + 1}: ${seatName(story.player, names)} played column ${story.column + 1} — ${CHANGE_LABEL[story.change].toLowerCase()}. Find a move that ${keep}.`;
}

/** What a practice answer led to. */
export function practiceFeedback(
  result: "best" | "keeps" | "misses",
  column: number,
  outcome: Outcome,
  best: readonly number[],
  names: readonly string[],
): string {
  const col = `Column ${column + 1}`;
  switch (result) {
    case "best":
      return `${col} — the best move.`;
    case "keeps":
      return `${col} keeps the result, but ${columnsPhrase(best)} ${best.length === 1 ? "is" : "are"} faster.`;
    case "misses":
      return `${col} → ${outcomeText(outcome, names)}. Try again.`;
  }
}

/** The answer, once shown. */
export function practiceAnswer(best: readonly number[]): string {
  return `The answer: ${columnsPhrase(best)}.`;
}

/** The end of a practice run. */
export function practiceDone(found: number, total: number): string {
  return `You found ${found} of ${total} on your own.`;
}
