import { agentsFor } from "@boardgames/core/games/codenames/seating";
import type {
  CodenamesResult,
  KeyEntry,
  Team,
  TurnEnd,
  TurnRecord,
} from "@boardgames/core/games/codenames/types";
import {
  guessParts,
  type Highlight,
  noteTargets,
  type RaceSeries,
  type ReviewModel,
  type ReviewTurn,
  tierName,
  type Verdict,
} from "../table/review-model";
import { seatLabel, TEAM_TONE, teamName, toneOf } from "./labels";

// The classic game's review model (the shapes and the shared screen are in
// `../table/`; Duet builds the same shapes in `codenames-duet/logic.ts`).

export const END_TEXT: Record<TurnEnd, string> = {
  miss: "Turn over",
  limit: "Used every guess",
  stopped: "Stopped guessing",
  assassin: "Hit the assassin",
  won: "Found the last agent",
  "clue-timeout": "Ran out of time for a clue",
  "guess-timeout": "Ran out of time guessing",
};

interface ClassicGame {
  words: readonly string[];
  key: readonly KeyEntry[];
  startingTeam: Team;
  turns: readonly TurnRecord[];
  /** Per seat: the AI tier id, or null for a person. */
  ai: readonly (string | null)[];
  names: readonly (string | null)[];
}

function verdictOf(entry: KeyEntry, team: Team): Verdict {
  if (entry === "assassin") return "assassin";
  if (entry === "bystander") return "bystander";
  return entry === team ? "hit" : "opponent";
}

export function buildClassicReview(game: ClassicGame): ReviewModel {
  const tone = (card: number) => toneOf(game.key[card] ?? "bystander");
  const word = (card: number) => (game.words[card] ?? "?").toUpperCase();

  // When (which turn) and by whom each card was covered.
  const coveredAt = new Map<number, { turn: number; team: Team }>();
  game.turns.forEach((t, i) => {
    for (const g of t.guesses) coveredAt.set(g.card, { turn: i, team: t.team });
  });

  const turns: ReviewTurn[] = game.turns.map((t, index) => {
    const notes = guessParts(t.guessNotes);
    const guesserSeat = t.guesses[0]?.by ?? null;
    const touched = new Set(t.guesses.map((g) => g.card));
    const { targets, leftover } = noteTargets(t.note, game.words, tone, (card) => {
      const at = coveredAt.get(card);
      if (at === undefined) return "never";
      if (at.turn === index) return "now";
      return at.team === t.team ? "later" : "them";
    });
    const guesses = t.guesses.map((g) => {
      const pick = notes.pickNote(g.card);
      return {
        card: g.card,
        word: word(g.card),
        by: seatLabel(g.by, game.names),
        tone: toneOf(g.result),
        verdict: verdictOf(g.result, t.team),
        confidence: pick?.confidence ?? null,
        why: pick?.why ?? null,
      };
    });
    return {
      index,
      tone: TEAM_TONE[t.team],
      side: teamName(t.team),
      giver: seatLabel(t.team, game.names),
      giverAi: tierName(game.ai[t.team]),
      guesser: guesserSeat === null ? null : seatLabel(guesserSeat, game.names),
      guesserAi: guesserSeat === null ? null : tierName(game.ai[guesserSeat]),
      clue: t.clue,
      appeals: (t.appeals ?? []).map((a) => ({
        word: a.word.toUpperCase(),
        clash: a.clash.toUpperCase(),
        judge: seatLabel(a.judge, game.names),
        ruling: a.ruling,
        reason: a.reason,
      })),
      reasoning: t.note?.reasoning ?? null,
      standIn: t.note?.standIn ?? false,
      targets,
      leftover,
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

  // Agents found by each team after every turn (whoever uncovered them).
  const found: [number[], number[]] = [[0], [0]];
  const tally: [number, number] = [0, 0];
  for (const t of game.turns) {
    for (const g of t.guesses) {
      const entry = g.result;
      if (entry === 0 || entry === 1) tally[entry]++;
    }
    found[0].push(tally[0]);
    found[1].push(tally[1]);
  }
  const totalOf = (team: Team) => agentsFor(team, game.startingTeam);
  const series: RaceSeries[] = ([game.startingTeam, (1 - game.startingTeam) as Team] as const).map(
    (team) => ({
      label: teamName(team),
      tone: TEAM_TONE[team],
      points: found[team].map((n) => totalOf(team) - n),
      total: totalOf(team),
    }),
  );

  return {
    turns,
    series,
    highlights: classicHighlights(turns),
    boardAt: (shown) => {
      const before = new Set<number>();
      if (shown !== null) {
        for (const t of game.turns.slice(0, shown)) for (const g of t.guesses) before.add(g.card);
      }
      const turn = shown === null ? null : game.turns[shown];
      const order = new Map(turn?.guesses.map((g, i) => [g.card, i + 1]) ?? []);
      const targets = new Set(turn?.note?.targets ?? []);
      const finalCovered = new Set(coveredAt.keys());
      return game.words.map((w, card) => {
        const coveredNow = shown === null ? finalCovered.has(card) : before.has(card);
        const touch = order.get(card);
        const cover = coveredNow || touch !== undefined ? tone(card) : null;
        const focus = touch !== undefined || targets.has(card);
        return {
          word: w,
          cover,
          keyTone: cover === null ? tone(card) : null,
          pickable: false,
          ...(shown !== null ? { emphasis: focus ? ("focus" as const) : ("fade" as const) } : {}),
          ...(targets.has(card) ? { target: true } : {}),
          ...(touch !== undefined ? { touch } : {}),
        };
      });
    },
  };
}

/** The game's best moments, from the turns alone. */
export function classicHighlights(turns: readonly ReviewTurn[]): Highlight[] {
  const out: Highlight[] = [];
  const clued = turns.filter((t) => t.clue);
  const best = [...clued].sort((a, b) => b.hits - a.hits || a.index - b.index)[0];
  if (best && best.hits > 0 && best.clue) {
    out.push({
      label: "Best clue",
      value: `${best.clue.word.toUpperCase()} ${best.clue.count === "unlimited" ? "∞" : best.clue.count}`,
      detail: `${best.side} · ${best.hits} agent${best.hits === 1 ? "" : "s"} in one turn`,
      tone: best.tone,
    });
  }
  const meld = clued.find(
    (t) => t.targets && t.targets.length >= 2 && t.targets.every((x) => x.fate === "now"),
  );
  if (meld?.clue && meld !== best) {
    out.push({
      label: "Mind meld",
      value: meld.clue.word.toUpperCase(),
      detail: `Every target found: ${meld.targets?.map((x) => x.word).join(", ")}`,
      tone: meld.tone,
    });
  }
  const costly =
    turns.flatMap((t) =>
      t.guesses.filter((g) => g.verdict === "assassin").map((g) => ({ t, g })),
    )[0] ??
    turns.flatMap((t) =>
      t.guesses.filter((g) => g.verdict === "opponent").map((g) => ({ t, g })),
    )[0];
  if (costly) {
    out.push({
      label: costly.g.verdict === "assassin" ? "Fatal touch" : "Costliest touch",
      value: costly.g.word,
      detail: `${costly.t.side} on ${costly.t.clue ? costly.t.clue.word.toUpperCase() : "no clue"}${costly.g.verdict === "assassin" ? " — the assassin" : " — the other team's agent"}`,
      tone: costly.g.tone,
    });
  }
  for (const side of [...new Set(turns.map((t) => t.side))]) {
    const mine = turns.filter((t) => t.side === side);
    const touches = mine.flatMap((t) => t.guesses);
    if (touches.length === 0) continue;
    const hits = touches.filter((g) => g.verdict === "hit").length;
    out.push({
      label: `${side} accuracy`,
      value: `${Math.round((hits / touches.length) * 100)}%`,
      detail: `${hits} of ${touches.length} touches · ${mine.filter((t) => t.clue).length} clues`,
      tone: mine[0]?.tone ?? "neutral",
    });
  }
  return out;
}

/** The result line under a finished game — the same on the game-over screen and in a replay. */
export function classicDetail(result: CodenamesResult, turnCount: number): string {
  const loser = (1 - result.winner) as Team;
  const how =
    result.reason === "assassin"
      ? `${teamName(loser)} touched the assassin`
      : `${teamName(result.winner)} found every agent`;
  return `${how} · Red ${result.agentsFound[0]} · Blue ${result.agentsFound[1]} · ${turnCount} turns`;
}
