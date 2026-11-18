/**
 * The strategic read of a position, in plain sentences for an AI prompt —
 * pure, so it is tested here and the server agent only formats it. Shared by
 * Codenames and Duet.
 *
 * What a good player keeps in mind, beyond "link some words":
 *   - the number buys number + 1 guesses; the extra one is for leftovers
 *   - one leftover is covered by that +1, so it isn't worth a whole clue
 *   - ∞ is an agreement, not a size: "everything left is covered" — this
 *     clue's words plus the words still owed from earlier clues are ALL the
 *     agents left (`closesTheBoard`), so keep going until they're found
 *   - when the other side is about to win, a safe clue loses: go for it all
 *   - what the other side's clue didn't find is probably theirs
 */
import { type ClueCount, formatClueCount } from "../clue-rules";
import type { ClueInput, GuessInput, SpymasterCardKind } from "./agent";

const upper = (w: string) => w.toUpperCase();
const listWords = (words: readonly string[]) => words.map(upper).join(", ");
const clueText = (word: string, count: ClueCount) => `${upper(word)} ${formatClueCount(count)}`;

/** Your own clues' intended words that are still face down. */
export function pendingTargets(input: ClueInput): { clue: string; words: string[] }[] {
  const hidden = new Set(
    input.cards.filter((c) => !c.revealed && c.kind === "own").map((c) => c.word),
  );
  const seen = new Set<string>();
  const out: { clue: string; words: string[] }[] = [];
  for (const turn of input.history) {
    if (turn.by !== "us" || !turn.clue || !turn.intended) continue;
    const words = turn.intended.filter((w) => hidden.has(w) && !seen.has(w));
    for (const w of words) seen.add(w);
    if (words.length > 0) out.push({ clue: clueText(turn.clue.word, turn.clue.count), words });
  }
  return out;
}

/**
 * The ∞ agreement, for both games and every guesser, AI or person: a clue is
 * ∞ exactly when its targets plus the words still owed from your earlier
 * clues are every agent you have left — "everything is described, finish it
 * this turn". Short of that, the clue carries its number (WORD 2 with one
 * owed of four says one word is still undescribed).
 */
export function closesTheBoard(input: ClueInput, targets: readonly number[]): boolean {
  if (targets.length === 0) return false;
  const owed = new Set(pendingTargets(input).flatMap((p) => p.words));
  const covered = new Set(targets);
  return input.cards
    .filter((c) => !c.revealed && c.kind === "own")
    .every((c) => covered.has(c.index) || owed.has(c.word));
}

export type Urgency = "desperate" | "behind" | "even" | "ahead";

/** How the race stands for the side about to play (classic). */
export function urgencyOf(need: number, opponentNeed: number | undefined): Urgency {
  if (opponentNeed === undefined) return "even";
  if (opponentNeed <= 1 && need > 0) return "desperate";
  if (opponentNeed <= 2 && need > opponentNeed) return "behind";
  if (need + 2 <= opponentNeed) return "ahead";
  return "even";
}

/** The spymaster's situation, one sentence per point. */
export function clueSituation(input: ClueInput): string[] {
  const lines: string[] = [];
  if (input.mode === "classic") {
    lines.push(
      `Score: your team needs ${input.agentsLeft} more agent${input.agentsLeft === 1 ? "" : "s"}; the other team needs ${input.opponentAgentsLeft ?? "?"}.`,
    );
    const urgency = urgencyOf(input.agentsLeft, input.opponentAgentsLeft);
    if (urgency === "desperate") {
      lines.push(
        `URGENT: the other team needs only 1 agent and will very likely win on its next turn. A cautious clue loses the game. Aim at ALL ${input.agentsLeft} of your remaining agents if any link can carry them (give that number, or ∞), accepting more risk — only the assassin is still worth avoiding at all costs.`,
      );
    } else if (urgency === "behind") {
      lines.push(
        "The other team is close to winning. Be bold: link as many of your agents as you can this turn.",
      );
    } else if (urgency === "ahead") {
      lines.push(
        "You are well ahead: play safe. Small, precise clues win from here; never risk the assassin.",
      );
    }
  } else {
    lines.push(
      `Agents still hidden on your side of the key: ${input.agentsLeft}. Turns left on the timer: ${input.turnsLeft ?? "?"}.`,
    );
    if (input.turnsLeft !== undefined && input.turnsLeft <= 2 && input.agentsLeft >= 3) {
      lines.push(
        "Time is short: be ambitious — a clue for one word won't finish the mission in time.",
      );
    }
  }

  const pending = pendingTargets(input);
  const total = pending.reduce((n, p) => n + p.words.length, 0);
  if (total > 0) {
    lines.push(
      `Still hidden from your earlier clues: ${pending.map((p) => `${p.clue} → ${listWords(p.words)}`).join("; ")}.`,
    );
    if (total === 1 && total < input.agentsLeft) {
      lines.push(
        "Exactly one leftover: don't spend this clue on it. Clue other words — your operatives get number + 1 guesses, and the extra one is for that leftover.",
      );
    }
    const rest = input.agentsLeft - total;
    lines.push(
      rest > 0
        ? `A clue that links the other ${rest} agent${rest === 1 ? "" : "s"} covers everything you have left: it is given as ∞ — your team's agreed sign that every agent left is described (this clue + the words still owed), so they keep going until they have found them all. A smaller clue keeps its number, which tells them some agent is still undescribed.`
        : "Your earlier clues already cover every agent you have left: a clue toward any of them is given as ∞ — the agreed sign that everything is described and they should collect it all.",
    );
  }
  return lines;
}

/** One earlier clue as the guessers can judge it from the public record. */
function clueTally(turn: GuessInput["history"][number]): {
  text: string;
  number: number | null;
  found: string[];
} | null {
  if (!turn.clue) return null;
  const mine = turn.by === "us" ? "own" : "opponent";
  return {
    text: clueText(turn.clue.word, turn.clue.count),
    number: typeof turn.clue.count === "number" ? turn.clue.count : null,
    found: turn.guesses.filter((g) => g.result === mine).map((g) => g.word),
  };
}

/**
 * Your own earlier clues that may still have words hidden, by the public
 * record: the number said, minus your agents touched on that turn. Their
 * words are what the extra (+1) guess is for.
 */
export function unfinishedClues(input: GuessInput): { word: string; missing: number }[] {
  return input.history.flatMap((turn) => {
    if (turn.by !== "us") return [];
    const t = clueTally(turn);
    if (!t || t.number === null || t.number === 0 || !turn.clue) return [];
    const missing = t.number - t.found.length;
    return missing > 0 ? [{ word: turn.clue.word, missing }] : [];
  });
}

export interface GuessSituation {
  lines: string[];
  urgency: Urgency;
}

/** The guessers' situation, from public information only. */
/**
 * `stopByScore`: the code decides where the turn stops (`stop-rule.ts`), so the
 * guesser gets no "be bold / play safe" advice — only honest probabilities are asked of it.
 */
export function guessSituation(input: GuessInput, stopByScore = false): GuessSituation {
  const lines: string[] = [];
  const urgency =
    input.mode === "classic" ? urgencyOf(input.agentsLeft, input.opponentAgentsLeft) : "even";

  if (input.mode === "classic") {
    lines.push(
      `Score: your team needs ${input.agentsLeft} more agent${input.agentsLeft === 1 ? "" : "s"}; the other team needs ${input.opponentAgentsLeft ?? "?"}.`,
    );
  } else if (input.turnsLeft !== undefined) {
    lines.push(
      `Agents still hidden on your partner's key: ${input.agentsLeft}. Turns left: ${input.turnsLeft}.`,
    );
  }
  if (stopByScore) {
    // No advice on boldness: the score decides from the probabilities.
  } else if (urgency === "desperate") {
    lines.push(
      "URGENT: the other team needs just 1 agent and will very likely win on its next turn. Stopping early loses: use every guess you are allowed, including the +1, on your best remaining candidates.",
    );
  } else if (urgency === "ahead") {
    lines.push("You are ahead: touch only what you are confident in, and stop when unsure.");
  }

  if (input.clue.count === 0) {
    lines.push(
      `A 0 clue: NONE of your agents relate to ${upper(input.clue.word)} — avoid words that fit it. Spend your guesses on leftovers from earlier clues.`,
    );
  } else if (input.clue.count === "unlimited") {
    const owed = unfinishedClues(input);
    const owedTotal = owed.reduce((n, c) => n + c.missing, 0);
    const own = Math.max(1, input.agentsLeft - owedTotal);
    lines.push(
      `∞ is your team's agreement: EVERYTHING left is covered. ${upper(input.clue.word)} plus the words still owed from earlier clues${owed.length > 0 ? ` (${owed.map((c) => `${upper(c.word)}: ${c.missing}`).join(", ")})` : ""} are ALL ${input.agentsLeft} of your remaining agents — so ${upper(input.clue.word)} itself points to about ${own}. ${stopByScore ? "List every word that could be one of them." : `Keep going until you have found all ${input.agentsLeft}; stop only when no candidate is left that you would really pick.`}`,
    );
  } else if (input.mode === "classic" && stopByScore) {
    lines.push(
      `You may touch up to ${input.clue.count + 1} words: the number + 1. ${upper(input.clue.word)} itself points to ${input.clue.count}; the extra touch may go to a word left over from an earlier clue of yours or to one more word for ${upper(input.clue.word)}.`,
    );
  } else if (input.mode === "classic") {
    lines.push(
      `You may guess up to the number + 1, but at most ${input.clue.count} for ${upper(input.clue.word)} itself — your spymaster said exactly ${input.clue.count}. The extra guess is ONLY for a word left over from an earlier clue of yours; with none open, stop after ${input.clue.count}.`,
    );
  }

  for (const turn of input.history) {
    const t = clueTally(turn);
    if (!t || t.number === null || t.number === 0) continue;
    const missing = t.number - t.found.length;
    if (missing <= 0) continue;
    if (turn.by === "us") {
      lines.push(
        `Your earlier clue ${t.text} found ${t.found.length}${t.found.length ? ` (${listWords(t.found)})` : ""}: up to ${missing} more word${missing === 1 ? "" : "s"} for it may still be hidden — good candidates for the extra guess.`,
      );
    } else if (input.mode === "classic") {
      lines.push(
        `The other team's clue ${t.text} found only ${t.found.length}: hidden words that fit ${t.text.split(" ")[0]} are probably THEIR agents — avoid them.`,
      );
    }
  }
  return { lines, urgency };
}

/** A reader's pick below this confidence is one a real operative wouldn't take. */
export const READ_CONFIDENCE = 0.5;

/** What each target the reader didn't confidently find costs a clue (an even game). */
const UNREAD_TARGET = 0.25;

/**
 * How the race shifts a clue's risks. Behind (or out of time), a big clue
 * that half-lands still beats a safe single, so a target the reader missed
 * costs less; ahead, a miss that hands the other side a turn or a point
 * costs more. The assassin is fatal whatever the score.
 */
const RISK: Record<Urgency, { unread: number; miss: number }> = {
  desperate: { unread: 0.05, miss: 0.6 },
  behind: { unread: 0.12, miss: 0.8 },
  even: { unread: UNREAD_TARGET, miss: 1 },
  ahead: { unread: 0.3, miss: 1.4 },
};

/**
 * The spymaster's race, Duet included: classic reads the score; Duet reads
 * the timer (agents still hidden on this side against the turns left).
 */
export function clueUrgency(input: ClueInput): Urgency {
  if (input.mode === "classic") return urgencyOf(input.agentsLeft, input.opponentAgentsLeft);
  const turns = input.turnsLeft;
  if (turns === undefined) return "even";
  if (turns <= 1) return "desperate";
  if (input.agentsLeft > turns * 2) return "behind";
  if (input.agentsLeft <= turns) return "ahead";
  return "even";
}

/** One word of a keyless reader's ranking, with how sure it was. */
export interface ReadPick {
  card: number;
  confidence: number;
}

/**
 * How well a keyless reader's ranking serves a clue, read the way an
 * operative plays it: the first word is always touched, every later one
 * only while the reader is still sure of it (`READ_CONFIDENCE`), at most the
 * clue's number. +1 per own agent touched, until the first miss — priced by
 * what it hits: the assassin loses the game, an opponent's agent hands them a
 * point, a bystander only ends the turn (worse as the very first touch).
 *
 * A clue then pays for each of its `targets` the reader didn't confidently
 * find: its number promised a word the table won't see. So a long shot the
 * reader happened to rank (ICE at 25 % for CYCLONE) earns nothing, and a
 * 4-word stretch that lands one loses to the clean single — while a big
 * clue that reads cleanly still beats a small one.
 */
export function readScore(
  ranking: readonly ReadPick[],
  kindOf: (card: number) => SpymasterCardKind | undefined,
  count: ClueCount,
  targets: readonly number[],
  urgency: Urgency = "even",
): number {
  const risk = RISK[urgency];
  const reach = typeof count === "number" && count > 0 ? count : ranking.length;
  const found = new Set<number>();
  let score = 0;
  for (const [i, pick] of ranking.slice(0, reach).entries()) {
    if (i > 0 && pick.confidence < READ_CONFIDENCE) break;
    const kind = kindOf(pick.card);
    if (kind === "own") {
      score += 1;
      found.add(pick.card);
      continue;
    }
    if (kind === "assassin") return score - 6;
    score -= (kind === "opponent" ? 1 : score === 0 ? 0.4 : 0.1) * risk.miss;
    break;
  }
  return score - targets.filter((t) => !found.has(t)).length * risk.unread;
}
