import { formatClueCount } from "@boardgames/core/games/codenames/clue-rules";
import { TOTAL_AGENTS } from "@boardgames/core/games/codenames-duet/manifest";
import type {
  DuetKeyEntry,
  DuetKeyPair,
  DuetPlayerView,
  DuetResult,
  DuetTurn,
  DuetTurnEnd,
  Side,
} from "@boardgames/core/games/codenames-duet/types";
import type { LogAction, LogBlock } from "../../components/action-log";
import {
  type AwayNotice,
  awayNoticesOf,
  type CoverTone,
  type GridCard,
  guessParts,
  type Highlight,
  type LastTurnSummary,
  latestTouchOrder,
  noteTargets,
  type RaceSeries,
  type ReviewGuess,
  type ReviewModel,
  type ReviewTurn,
  type StripClue,
  type TargetFate,
  type TouchMark,
  tierName,
  type Verdict,
} from "../codenames/table";

export const SIDE_NAMES = ["Agent A", "Agent B"] as const;

export function sideLabel(seat: number, names: readonly (string | null)[]): string {
  return names[seat] ?? SIDE_NAMES[seat] ?? "Spectator";
}

const KEY_TONE: Record<DuetKeyEntry, CoverTone | null> = {
  agent: "green",
  assassin: "ink",
  bystander: null,
};

const live = (view: DuetPlayerView) =>
  view.phase === "clue" || view.phase === "guessing" || view.phase === "sudden-death";

export interface DuetGridContext {
  showKey: boolean;
  /** The clue-giver's chosen targets. */
  chosen: readonly number[];
  /** Cards the clue-giver may choose as targets. */
  choosable: (card: number) => boolean;
  /** The viewer's opened strip clue: its face-down targets. */
  owed: ReadonlySet<number>;
}

/**
 * The live board from one seat's view: covers, the viewer's own key side,
 * bystander badges, the clue-giver's targets, an opened clue's leftovers and
 * the latest touches in order — what the classic board shows, Duet's way.
 */
export function duetGridCards(view: DuetPlayerView, ctx: DuetGridContext): GridCard[] {
  const guessable = new Set(view.guessable);
  const recent = live(view) ? latestTouchOrder(view.turns) : null;
  return view.cards.map((card, i) => {
    const deadForBoth = card.bystanderFor.length === 2;
    const touch = recent?.order.get(i);
    return {
      word: card.word,
      cover: card.found ? "green" : deadForBoth ? "tan" : null,
      keyTone: !card.found && ctx.showKey && card.mine ? KEY_TONE[card.mine] : null,
      badges: deadForBoth
        ? []
        : card.bystanderFor.map((s) => ({ label: SIDE_NAMES[s].slice(-1), tone: "tan" })),
      pickable: guessable.has(i) || ctx.choosable(i),
      chosen: ctx.chosen.includes(i),
      owed: !card.found && ctx.owed.has(i),
      ...(touch !== undefined ? { touch, touchTone: "green" as const } : {}),
    };
  });
}

/** The viewer's own clues for the strip, with what each still owes (its targets not yet found). */
export function duetStripClues(view: DuetPlayerView): StripClue[] {
  if (view.seat !== 0 && view.seat !== 1) return [];
  return view.turns.flatMap((turn, index) => {
    if (turn.giver !== view.seat || !turn.clue) return [];
    const targets = turn.note?.targets ?? [];
    return [
      {
        turn: index,
        word: turn.clue.word,
        count: turn.clue.count,
        found: turn.guesses.filter((g) => g.result === "agent").length,
        pinned: 0,
        owed: targets.length > 0 ? targets.filter((c) => view.cards[c]?.found === false) : null,
      },
    ];
  });
}

const TOUCH_MARK: Record<DuetKeyEntry, TouchMark> = {
  agent: "own",
  bystander: "bystander",
  assassin: "assassin",
};

const NO_TOUCH: Partial<Record<DuetTurnEnd, string>> = {
  "clue-timeout": "ran out of time for a clue",
  "guess-timeout": "ran out of time to guess",
};

/** The last finished turn in one line, for whoever looked away. */
export function duetLastTurn(
  view: DuetPlayerView,
  names: readonly (string | null)[],
): LastTurnSummary | null {
  for (let i = view.turns.length - 1; i >= 0; i--) {
    const turn = view.turns[i];
    if (!turn || turn.end === null) continue;
    return {
      who: turn.giver === null ? "Sudden death" : sideLabel(turn.giver, names),
      tone: turn.giver === null ? "ink" : "green",
      clue: turn.clue,
      touches: turn.guesses.map((g) => ({
        word: view.cards[g.card]?.word ?? "?",
        mark: TOUCH_MARK[g.result],
      })),
      idle: NO_TOUCH[turn.end] ?? "touched nothing",
    };
  }
  return null;
}

/** The seat the game is waiting on: the clue-giver, else the one touching cards. */
export function waitedOnSeat(view: DuetPlayerView): Side | null {
  if (view.phase === "clue" || view.phase === "sudden-death") return view.giver;
  if (view.phase === "guessing") return (1 - view.giver) as Side;
  return null;
}

/** The partner gone from the table, once the viewer may (or soon may) hand their seat over. */
export function duetAwayNotices(view: DuetPlayerView): AwayNotice[] {
  return awayNoticesOf(
    view.seats,
    view.seat,
    view.canHandOver,
    (seat) => seat === waitedOnSeat(view),
  );
}

/** What the game is waiting on this player for, for the tab title — or null. */
export function duetAlertLabel(view: DuetPlayerView): string | null {
  if (view.mustGiveClue) return "Your clue";
  if (view.canGuess) {
    if (view.phase === "sudden-death") return "Your pick";
    // The clue itself, so a player in another tab knows what to look for.
    return view.clue
      ? `Your guess: ${view.clue.word.toUpperCase()} ${formatClueCount(view.clue.count)}`
      : "Your guess";
  }
  return null;
}

/** The result line under a finished game — the same on the game-over screen and in a replay. */
export function duetDetail(result: DuetResult, campaignLine: string | null = null): string {
  const spare = `${result.tokensLeft} turn${result.tokensLeft === 1 ? "" : "s"} to spare`;
  return [
    campaignLine,
    DUET_REASON[result.reason] ?? result.reason,
    `${result.agentsFound} / ${TOTAL_AGENTS} agents`,
    spare,
  ]
    .filter(Boolean)
    .join(" · ");
}

export const DUET_REASON: Record<string, string> = {
  "all-found": "All fifteen agents found",
  assassin: "An assassin was contacted",
  "sudden-death": "A miss in sudden death",
};

const END_TEXT: Record<DuetTurnEnd, string> = {
  bystander: "Hit a bystander",
  stopped: "Stopped guessing",
  assassin: "Hit an assassin",
  won: "Found the last agent",
  "clue-timeout": "Ran out of time for a clue",
  "guess-timeout": "Ran out of time guessing",
};

export function mapDuetLog(
  turns: readonly DuetTurn[],
  words: readonly string[],
  names: readonly (string | null)[],
): LogBlock[] {
  return turns.map((turn, t) => {
    const actions: LogAction[] = [];
    if (turn.clue && turn.giver !== null) {
      actions.push({
        key: "clue",
        icon: "🗝",
        variant: "action",
        spans: [
          `${sideLabel(turn.giver, names)}: `,
          {
            text: `${turn.clue.word.toUpperCase()} ${formatClueCount(turn.clue.count)}`,
            bold: true,
          },
        ],
      });
    }
    turn.guesses.forEach((g, i) => {
      actions.push({
        key: `g${i}`,
        icon: g.result === "agent" ? "✓" : g.result === "assassin" ? "☠" : "✗",
        variant: g.result === "agent" ? "success" : g.result === "assassin" ? "danger" : "neutral",
        spans: [
          `${sideLabel(g.by, names)} touched `,
          { text: (words[g.card] ?? "?").toUpperCase(), bold: true },
          ` — ${g.result === "agent" ? "an agent" : g.result === "assassin" ? "an assassin" : "a bystander"}`,
        ],
      });
    });
    if (turn.end)
      actions.push({ key: "end", icon: "·", variant: "info", spans: [END_TEXT[turn.end]] });
    return { key: t, label: turn.giver === null ? "Sudden death" : `Turn ${t + 1}`, actions };
  });
}

// ---------------------------------------------------------------------------
// The review (shared screen: `codenames/components/review/ReviewScreen.tsx`)
// ---------------------------------------------------------------------------

interface DuetGame {
  words: readonly string[];
  key: readonly DuetKeyPair[];
  turns: readonly DuetTurn[];
  tokensTotal: number;
  /** Each seat's AI tier id, or null for a person. */
  tiers: readonly (string | null)[];
  names: readonly (string | null)[];
}

const ENTRY_TONE: Record<DuetKeyEntry, CoverTone> = {
  agent: "green",
  bystander: "tan",
  assassin: "ink",
};

const VERDICT: Record<DuetKeyEntry, Verdict> = {
  agent: "hit",
  bystander: "bystander",
  assassin: "assassin",
};

/** One card's tint when no side is singled out: an agent on either side, else an assassin. */
function unionTone(pair: DuetKeyPair | undefined): CoverTone | null {
  if (!pair) return null;
  if (pair.includes("agent")) return "green";
  if (pair.includes("assassin")) return "ink";
  return null;
}

export function buildDuetReview(game: DuetGame): ReviewModel {
  const word = (card: number) => (game.words[card] ?? "?").toUpperCase();
  const foundAt = new Map<number, number>();
  game.turns.forEach((t, i) => {
    for (const g of t.guesses)
      if (g.result === "agent" && !foundAt.has(g.card)) foundAt.set(g.card, i);
  });

  const turns: ReviewTurn[] = game.turns.map((t, index) => {
    const side = t.giver;
    const toneOn = (card: number): CoverTone =>
      ENTRY_TONE[side === null ? "bystander" : (game.key[card]?.[side] ?? "bystander")];
    const notes = guessParts(t.guessNotes);
    const touched = new Set(t.guesses.map((g) => g.card));
    const guesserSeat = t.guesses[0]?.by ?? (side === null ? null : ((1 - side) as Side));
    const guesses: ReviewGuess[] = t.guesses.map((g) => {
      const pick = notes.pickNote(g.card);
      return {
        card: g.card,
        word: word(g.card),
        by: sideLabel(g.by, game.names),
        tone: ENTRY_TONE[g.result],
        verdict: VERDICT[g.result],
        confidence: pick?.confidence ?? null,
        why: pick?.why ?? null,
      };
    });
    return {
      index,
      tone: "green",
      side: side === null ? "Sudden death" : `${sideLabel(side, game.names)}'s clue`,
      giver: side === null ? null : sideLabel(side, game.names),
      giverAi: side === null ? null : tierName(game.tiers[side]),
      guesser: guesserSeat === null ? null : sideLabel(guesserSeat, game.names),
      guesserAi: guesserSeat === null ? null : tierName(game.tiers[guesserSeat]),
      clue: t.clue,
      reasoning: t.note?.reasoning ?? null,
      standIn: t.note?.standIn ?? false,
      ...noteTargets(t.note, game.words, toneOn, (card): TargetFate => {
        const at = foundAt.get(card);
        return at === undefined ? "never" : at === index ? "now" : "later";
      }),
      guesses,
      guessReasoning: notes.reasoning,
      guessStandIn: notes.standIn,
      unplayed: notes.planned
        .filter((p) => !touched.has(p.card))
        .map((p) => ({ word: word(p.card), confidence: p.confidence, why: p.why })),
      end: t.end ? END_TEXT[t.end] : "",
      hits: guesses.filter((g) => g.verdict === "hit").length,
    };
  });

  const points = [TOTAL_AGENTS];
  let left = TOTAL_AGENTS;
  for (const t of game.turns) {
    left -= t.guesses.filter((g) => g.result === "agent").length;
    points.push(left);
  }
  const series: RaceSeries[] = [{ label: "Agents", tone: "green", points, total: TOTAL_AGENTS }];

  return {
    turns,
    series,
    highlights: duetHighlights(turns, game.tokensTotal),
    boardAt: (shown) => {
      const before = shown === null ? game.turns : game.turns.slice(0, shown);
      const covered = new Set<number>();
      const bystanderFor = new Map<number, Side[]>();
      for (const t of before) {
        for (const g of t.guesses) {
          if (g.result === "agent") covered.add(g.card);
          else if (g.result === "bystander" && t.giver !== null) {
            const sides = bystanderFor.get(g.card) ?? [];
            if (!sides.includes(t.giver)) bystanderFor.set(g.card, [...sides, t.giver]);
          }
        }
      }
      const turn = shown === null ? null : game.turns[shown];
      const order = new Map(turn?.guesses.map((g, i) => [g.card, i + 1]) ?? []);
      const targets = new Set(turn?.note?.targets ?? []);
      const side = turn?.giver ?? null;
      return game.words.map((w, card): GridCard => {
        const pair = game.key[card];
        const thisTurn = turn?.guesses.find((g) => g.card === card);
        const cover: CoverTone | null = covered.has(card)
          ? "green"
          : thisTurn
            ? ENTRY_TONE[thisTurn.result]
            : (bystanderFor.get(card)?.length ?? 0) === 2
              ? "tan"
              : null;
        const keyTone =
          cover !== null
            ? null
            : side !== null
              ? ENTRY_TONE[pair?.[side] ?? "bystander"] === "tan"
                ? null
                : ENTRY_TONE[pair?.[side] ?? "bystander"]
              : unionTone(pair);
        const touch = order.get(card);
        const focus = touch !== undefined || targets.has(card);
        const sides = bystanderFor.get(card) ?? [];
        return {
          word: w,
          cover,
          keyTone,
          badges:
            cover === null
              ? sides.map((s) => ({ label: SIDE_NAMES[s].slice(-1), tone: "tan" }))
              : [],
          pickable: false,
          ...(shown !== null ? { emphasis: focus ? ("focus" as const) : ("fade" as const) } : {}),
          ...(targets.has(card) ? { target: true } : {}),
          ...(touch !== undefined ? { touch } : {}),
        };
      });
    },
  };
}

function duetHighlights(turns: readonly ReviewTurn[], tokensTotal: number): Highlight[] {
  const out: Highlight[] = [];
  const best = [...turns]
    .filter((t) => t.clue)
    .sort((a, b) => b.hits - a.hits || a.index - b.index)[0];
  if (best?.clue && best.hits > 0) {
    out.push({
      label: "Best clue",
      value: `${best.clue.word.toUpperCase()} ${best.clue.count === "unlimited" ? "∞" : best.clue.count}`,
      detail: `${best.giver ?? ""} · ${best.hits} agent${best.hits === 1 ? "" : "s"} in one turn`,
      tone: "green",
    });
  }
  const fatal = turns.flatMap((t) => t.guesses.filter((g) => g.verdict === "assassin"))[0];
  if (fatal) {
    out.push({
      label: "Fatal touch",
      value: fatal.word,
      detail: `${fatal.by} found an assassin`,
      tone: "ink",
    });
  }
  const touches = turns.flatMap((t) => t.guesses);
  if (touches.length > 0) {
    const hits = touches.filter((g) => g.verdict === "hit").length;
    out.push({
      label: "Accuracy",
      value: `${Math.round((hits / touches.length) * 100)}%`,
      detail: `${hits} agents in ${touches.length} touches`,
      tone: "neutral",
    });
  }
  const clueTurns = turns.filter((t) => t.giver !== null).length;
  out.push({
    label: "Timer",
    value: `${clueTurns} / ${tokensTotal}`,
    detail: turns.some((t) => t.giver === null) ? "Went to sudden death" : "Turns used",
    tone: "tan",
  });
  return out;
}
