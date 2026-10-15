import { formatClueCount } from "@boardgames/core/games/codenames/clue-rules";
import type { AppealRuling, TurnEnd, TurnRecord } from "@boardgames/core/games/codenames/types";
import type { LogAction, LogBlock, LogVariant } from "../../../components/action-log";
import { RESULT_TEXT, seatLabel, teamName } from "./labels";

const END_TEXT: Record<TurnEnd, string> = {
  miss: "Turn over",
  limit: "Used every guess",
  stopped: "Stopped guessing",
  assassin: "Hit the assassin",
  won: "Found the last agent",
  "clue-timeout": "Ran out of time for a clue",
  "guess-timeout": "Ran out of time guessing",
};

const RULING_TEXT: Record<AppealRuling, string> = {
  allowed: "allowed",
  refused: "refused",
  unanswered: "no answer — it stands",
  withdrawn: "withdrawn",
};

/**
 * One block per turn, oldest first (ActionLog shows newest first). Clue
 * questions appear only where the view carries them: to the spymasters during
 * play, to everyone after the game.
 */
export function mapCodenamesLog(
  turns: readonly TurnRecord[],
  words: readonly string[],
  names: readonly (string | null)[],
): LogBlock[] {
  return turns.map((turn, t) => {
    const actions: LogAction[] = [];
    (turn.appeals ?? []).forEach((a, i) => {
      actions.push({
        key: `a${i}`,
        icon: "⚖",
        variant: a.ruling === "refused" ? "warning" : "info",
        spans: [
          `${seatLabel(a.by, names)} asked ${seatLabel(a.judge, names)} about `,
          { text: a.word.toUpperCase(), bold: true },
          ` (${a.clash.toUpperCase()} on the table) — ${RULING_TEXT[a.ruling]}`,
        ],
      });
    });
    if (turn.clue) {
      actions.push({
        key: "clue",
        icon: "🗝",
        variant: "action",
        spans: [
          `${seatLabel(turn.team, names)}: `,
          {
            text: `${turn.clue.word.toUpperCase()} ${formatClueCount(turn.clue.count)}`,
            bold: true,
          },
        ],
      });
    }
    turn.guesses.forEach((g, i) => {
      const own = g.result === turn.team;
      const variant: LogVariant =
        g.result === "assassin"
          ? "danger"
          : own
            ? "success"
            : g.result === "bystander"
              ? "neutral"
              : "warning";
      actions.push({
        key: `g${i}`,
        icon: g.result === "assassin" ? "☠" : own ? "✓" : "✗",
        variant,
        spans: [
          `${seatLabel(g.by, names)} touched `,
          { text: (words[g.card] ?? "?").toUpperCase(), bold: true },
          ` — ${RESULT_TEXT[g.result]}`,
        ],
      });
    });
    if (turn.end) {
      actions.push({ key: "end", icon: "·", variant: "info", spans: [END_TEXT[turn.end]] });
    }
    return { key: t, label: `Turn ${t + 1} · ${teamName(turn.team)}`, actions };
  });
}
