import type { LogEntry, RevealedPlay } from "@boardgames/core/games/7-wonders/types";
import { cardIdName } from "@boardgames/core/games/7-wonders/types";
import type { LogAction, LogBlock, LogSpan } from "../../components/action-log";
import { AGE_LABEL, COLOR_HEX, defOf } from "./card-utils";

function label(playerIndex: number, myIndex: number): string {
  return playerIndex === myIndex ? "You" : `P${playerIndex + 1}`;
}

function cardSpan(cardId: string): LogSpan {
  return { card: cardIdName(cardId), color: COLOR_HEX[defOf(cardId).color] };
}

function playAction(play: RevealedPlay, myIndex: number, key: string | number): LogAction {
  const who = label(play.playerIndex, myIndex);
  if (play.action === "discard") {
    return {
      key,
      icon: "🗑️",
      spans: [`${who} discarded a card for 3🪙`],
      variant: "neutral",
    };
  }
  if (play.action === "build-wonder") {
    return {
      key,
      icon: "🏗️",
      spans: [`${who} built a wonder stage`],
      variant: "special",
    };
  }
  const spans: LogSpan[] = [`${who} built `, cardSpan(play.cardId)];
  if (play.payment?.kind === "chain") spans.push({ text: " (chain)", italic: true });
  if (play.payment?.kind === "free-build") spans.push({ text: " (Olympia)", italic: true });
  if (play.payment?.kind === "resources" && play.payment.left + play.payment.right > 0) {
    spans.push({
      text: ` (paid ${play.payment.left + play.payment.right}🪙 to neighbors)`,
      italic: true,
    });
  }
  return { key, icon: "🃏", spans, variant: "action" };
}

export function mapSevenWondersLog(log: LogEntry[], myIndex: number): LogBlock[] {
  const blocks: LogBlock[] = [];

  log.forEach((entry, i) => {
    switch (entry.type) {
      case "age-start":
        blocks.push({
          key: i,
          label: `${AGE_LABEL[entry.age]} begins`,
          actions: [],
        });
        break;

      case "reveal":
        blocks.push({
          key: i,
          label: `${AGE_LABEL[entry.age]} · Turn ${entry.turn}`,
          actions: entry.plays.map((play, j) => playAction(play, myIndex, `${i}-${j}`)),
        });
        break;

      case "pending": {
        const who = label(entry.playerIndex, myIndex);
        const wonder = entry.kind === "halikarnassos" ? "Halikarnassos" : "Babylon";
        const actions: LogAction[] = entry.play
          ? [playAction(entry.play, myIndex, `${i}-p`)]
          : [
              {
                key: `${i}-p`,
                icon: "⏭️",
                spans: [`${who} passed`],
                variant: "neutral" as const,
              },
            ];
        blocks.push({ key: i, label: `${wonder} — ${who}`, actions });
        break;
      }

      case "military":
        blocks.push({
          key: i,
          label: `${AGE_LABEL[entry.age]} · War`,
          actions: entry.outcomes.map((o) => {
            const sum = o.tokens.reduce((a, b) => a + b, 0);
            return {
              key: `${i}-${o.playerIndex}`,
              icon: "⚔️",
              spans: [
                `${label(o.playerIndex, myIndex)} ${sum > 0 ? `wins +${sum}` : sum < 0 ? `loses ${sum}` : "ties"}`,
              ],
              variant:
                sum > 0
                  ? ("success" as const)
                  : sum < 0
                    ? ("danger" as const)
                    : ("neutral" as const),
            };
          }),
        });
        break;

      case "game-end":
        blocks.push({
          key: i,
          label: "Final scores",
          actions: [
            {
              key: `${i}-w`,
              icon: "🏆",
              spans: [
                `${label(entry.winner, myIndex)} wins with ${entry.totals[entry.winner]} points`,
              ],
              variant: "success",
            },
          ],
        });
        break;
    }
  });

  return blocks.reverse();
}
