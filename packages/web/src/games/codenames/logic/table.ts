import type { ClueCount } from "@boardgames/core/games/codenames/clue-rules";
import type {
  CodenamesPlayerView,
  KeyEntry,
  Team,
  TurnEnd,
} from "@boardgames/core/games/codenames/types";

// What the live table derives from a view, for the board's chrome: the clue
// strip (with what each clue still owes, for its spymaster), the score, the
// latest turn's touches, the last turn in one line, who is away, and what the
// game is waiting on this player for. Pure, so it is tested on its own.

/** One of the viewer's team's clues, as the strip shows it. */
export interface TeamClue {
  /** The clue's turn — what a sticky note refers to. */
  turn: number;
  word: string;
  count: ClueCount;
  /** Own agents found on that clue's turn. */
  found: number;
  /** Cards carrying it as a sticky note (operatives). */
  pinned: number;
  /**
   * Spymaster only: the cards it was aimed at that are still face down, or
   * null when its targets weren't marked.
   */
  owed: number[] | null;
}

/** The viewer's team's clues, oldest first. A turn's index is its index in the game. */
export function teamClues(view: CodenamesPlayerView): TeamClue[] {
  if (view.team === null) return [];
  const spymaster = view.role === "spymaster";
  return view.turns.flatMap((turn, index) => {
    if (turn.team !== view.team || !turn.clue) return [];
    const targets = turn.note?.targets ?? [];
    return [
      {
        turn: index,
        word: turn.clue.word,
        count: turn.clue.count,
        found: turn.guesses.filter((g) => g.result === turn.team).length,
        pinned: view.cards.filter((c) => c.notes.some((n) => n.turn === index)).length,
        owed:
          spymaster && targets.length > 0
            ? targets.filter((card) => view.cards[card]?.revealed === null)
            : null,
      },
    ];
  });
}

export interface TeamScore {
  team: Team;
  /** Agents still face down. */
  left: number;
  total: number;
  /** Their turn now. */
  active: boolean;
}

/** Both teams' agents to find, the starting team first. */
export function scoreOf(view: CodenamesPlayerView): TeamScore[] {
  const live = view.phase === "clue" || view.phase === "guessing";
  return ([view.startingTeam, (1 - view.startingTeam) as Team] as const).map((team) => ({
    team,
    left: view.agentsLeft[team],
    total: team === view.startingTeam ? 9 : 8,
    active: live && view.currentTeam === team,
  }));
}

/**
 * The latest touches on the table: the live turn's once it has any, else the
 * last finished turn's — so whoever looks up between turns sees what just
 * happened, numbered in order, until the next team touches a card.
 */
export interface RecentTouches {
  team: Team;
  /** card → its place in that turn's order (1-based). */
  order: Map<number, number>;
  /** It is the turn being played now. */
  live: boolean;
}

export function recentTouches(view: CodenamesPlayerView): RecentTouches | null {
  if (view.phase !== "clue" && view.phase !== "guessing") return null;
  for (let i = view.turns.length - 1; i >= 0; i--) {
    const turn = view.turns[i];
    if (!turn || turn.guesses.length === 0) continue;
    return {
      team: turn.team,
      order: new Map(turn.guesses.map((g, n) => [g.card, n + 1])),
      live: turn.end === null,
    };
  }
  return null;
}

/** The last finished turn, for a one-line "what just happened". */
export interface LastTurn {
  team: Team;
  clue: { word: string; count: ClueCount } | null;
  touches: { word: string; result: KeyEntry; own: boolean }[];
  end: TurnEnd;
}

export function lastTurn(view: CodenamesPlayerView): LastTurn | null {
  for (let i = view.turns.length - 1; i >= 0; i--) {
    const turn = view.turns[i];
    if (!turn || turn.end === null) continue;
    return {
      team: turn.team,
      clue: turn.clue,
      touches: turn.guesses.map((g) => ({
        word: view.cards[g.card]?.word ?? "?",
        result: g.result,
        own: g.result === turn.team,
      })),
      end: turn.end,
    };
  }
  return null;
}

/** Someone who dropped out, as the people still at the table see it. */
export interface AwayNotice {
  seat: number;
  since: number;
  handoverAt: number;
  /** The game can't go on without this seat right now. */
  blocking: boolean;
}

/** Whether the game is waiting on `seat` this moment. */
function blockingSeat(view: CodenamesPlayerView, seat: number): boolean {
  if (view.appeal !== null) return view.appeal.judge === seat;
  if (view.phase === "clue") return seat === view.currentTeam;
  if (view.phase !== "guessing") return false;
  const ops = view.seats.filter((s) => s.team === view.currentTeam && s.role === "operative");
  const present = ops.filter((s) => !s.ai && s.awaySince === null);
  const mine = ops.some((s) => s.seat === seat);
  // The team guesses through its people; with none left at the table, the gone one blocks.
  return mine && !ops.find((s) => s.seat === seat)?.ai && present.length === 0;
}

/** The away seats this viewer could hand to the AI (or soon can), most urgent first. */
export function awayNotices(view: CodenamesPlayerView): AwayNotice[] {
  if (!view.canHandOver) return [];
  return view.seats
    .flatMap((s) =>
      s.awaySince !== null && s.handoverAt !== null && !s.standIn && s.seat !== view.seat
        ? [
            {
              seat: s.seat,
              since: s.awaySince,
              handoverAt: s.handoverAt,
              blocking: blockingSeat(view, s.seat),
            },
          ]
        : [],
    )
    .sort((a, b) => Number(b.blocking) - Number(a.blocking) || a.since - b.since);
}

/** What the game is waiting on this player for, for the tab title — or null. */
export function alertLabel(view: CodenamesPlayerView): string | null {
  if (view.mustRuleClue) return "Your ruling";
  if (view.mustGiveClue) return "Your clue";
  if (view.canGuess) return "Your guess";
  return null;
}
