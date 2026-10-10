/**
 * The strategic read of a position, in plain sentences for an AI prompt —
 * pure, so it is tested here and the server agent only formats it. Shared by
 * Codenames and Duet.
 *
 * What a good player keeps in mind, beyond "link some words":
 *   - the number buys number + 1 guesses; the extra one is for leftovers
 *   - one leftover is covered by that +1, so it isn't worth a whole clue
 *   - two or more leftovers the team can place → ∞ lets them collect them
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
    if (total === 1) {
      lines.push(
        "Exactly one leftover: don't spend this clue on it. Clue other words — your operatives get number + 1 guesses, and the extra one is for that leftover.",
      );
    } else if (input.mode === "classic") {
      lines.push(
        `${total} leftovers your operatives can place from earlier clues: consider ∞ (unlimited) with a clue for new words, so they can collect the leftovers too — or clue new words and let the +1 take one of them.`,
      );
    }
    if (input.mode === "classic" && total >= input.agentsLeft) {
      lines.push(
        "Your operatives may already have everything they need: ∞ (or a 0 clue warning them off a dangerous meaning) can finish the game.",
      );
    }
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
export function guessSituation(input: GuessInput): GuessSituation {
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
  if (urgency === "desperate") {
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
    lines.push(
      "∞ means your spymaster thinks you already have enough from this and earlier clues: collect the leftovers too, not just this clue's words.",
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

/**
 * How well a keyless reader's ranking serves a clue: +1 per own agent in
 * order, stopping at the first miss — a bystander costs a little, an
 * opponent's agent more, the assassin a lot.
 */
export function readScore(
  ranking: readonly number[],
  kindOf: (card: number) => SpymasterCardKind | undefined,
  count: ClueCount,
): number {
  const reach = typeof count === "number" && count > 0 ? count : ranking.length;
  let score = 0;
  for (const card of ranking.slice(0, reach)) {
    const kind = kindOf(card);
    if (kind === "own") {
      score += 1;
      continue;
    }
    score -= kind === "assassin" ? 6 : kind === "opponent" ? 1 : 0.4;
    break;
  }
  return score;
}
