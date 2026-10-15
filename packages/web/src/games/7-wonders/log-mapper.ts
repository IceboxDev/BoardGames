import type { LogEntry, RevealedPlay } from "@boardgames/core/games/7-wonders/types";
import { cardIdName } from "@boardgames/core/games/7-wonders/types";
import type { LogAction, LogBlock, LogSpan } from "../../components/action-log";
import { AGE_LABEL, COLOR_HEX, defOf } from "./card-utils";

type Names = readonly string[];

function label(playerIndex: number, myIndex: number, names: Names): string {
  if (playerIndex === myIndex) return "You";
  return names[playerIndex] ?? `P${playerIndex + 1}`;
}

function cardSpan(cardId: string): LogSpan {
  return { card: cardIdName(cardId), color: COLOR_HEX[defOf(cardId).color] };
}

// Every line is in the past tense, so "You" and a city read the same:
// "You built Baths", "Rhodes built Baths".

const STAGE = ["Ⅰ", "Ⅱ", "Ⅲ", "Ⅳ"] as const;

function playAction(
  play: RevealedPlay,
  myIndex: number,
  names: Names,
  key: string | number,
  /** The wonder stage this play built (1-based), for wonder builds. */
  stage = 0,
  /** "from the discard" for Halikarnassos's free build. */
  fromDiscard = false,
): LogAction {
  const who = label(play.playerIndex, myIndex, names);
  if (play.action === "discard") {
    return {
      key,
      icon: "🗑️",
      spans: [`${who} sold a card for 3🪙`],
      variant: "neutral",
    };
  }
  if (play.action === "build-wonder") {
    return {
      key,
      icon: "🏗️",
      spans: [`${who} built wonder stage ${STAGE[stage - 1] ?? ""}`.trimEnd()],
      variant: "special",
    };
  }
  const spans: LogSpan[] = [`${who} built `, cardSpan(play.cardId)];
  const paid = play.payment?.kind === "resources" ? play.payment.left + play.payment.right : 0;
  const note = fromDiscard
    ? "free, from the discard pile"
    : play.payment?.kind === "chain"
      ? "free, by chain"
      : play.payment?.kind === "free-build"
        ? "free, by the Statue of Zeus"
        : paid > 0
          ? `paid ${paid}🪙 to neighbours`
          : null;
  if (note) spans.push({ text: ` (${note})`, italic: true });
  return { key, icon: "🃏", spans, variant: "action" };
}

/** One city's two border battles at the end of an Age, as a sentence. */
export function warLine(who: string, tokens: readonly number[]): string {
  const won = tokens.filter((t) => t > 0).length;
  const lost = tokens.filter((t) => t < 0).length;
  const tied = tokens.length - won - lost;
  const sum = tokens.reduce((a, b) => a + b, 0);
  const parts = [
    won && (won === tokens.length ? "won both battles" : "won one battle"),
    lost &&
      (lost === tokens.length ? "lost both battles" : won ? "lost the other" : "lost one battle"),
    tied &&
      (tied === tokens.length ? "tied both battles" : won || lost ? "tied the other" : "tied one"),
  ].filter(Boolean);
  const vp = sum === 0 ? "no change" : `${sum > 0 ? "+" : "−"}${Math.abs(sum)} VP`;
  return `${who} ${parts.join(" and ")} · ${vp}`;
}

export function mapSevenWondersLog(
  log: LogEntry[],
  myIndex: number,
  names: Names = [],
): LogBlock[] {
  const blocks: LogBlock[] = [];
  // Wonder stages built so far, per seat — each build names its stage.
  const stages = new Map<number, number>();
  const nextStage = (seat: number) => {
    const n = (stages.get(seat) ?? 0) + 1;
    stages.set(seat, n);
    return n;
  };
  const act = (play: RevealedPlay, key: string, fromDiscard = false) =>
    playAction(
      play,
      myIndex,
      names,
      key,
      play.action === "build-wonder" ? nextStage(play.playerIndex) : 0,
      fromDiscard,
    );

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
          actions: entry.plays.map((play, j) => act(play, `${i}-${j}`)),
        });
        break;

      case "pending": {
        const who = label(entry.playerIndex, myIndex, names);
        const halikarnassos = entry.kind === "halikarnassos";
        const actions: LogAction[] = entry.play
          ? [act(entry.play, `${i}-p`, halikarnassos)]
          : [
              {
                key: `${i}-p`,
                icon: "⏭️",
                spans: [
                  halikarnassos
                    ? `${who} built nothing from the discard pile`
                    : `${who} played no seventh card`,
                ],
                variant: "neutral" as const,
              },
            ];
        blocks.push({
          key: i,
          label: halikarnassos
            ? "Mausoleum · build from the discard"
            : "Hanging Gardens · seventh card",
          actions,
        });
        break;
      }

      case "military":
        blocks.push({
          key: i,
          label: `End of ${AGE_LABEL[entry.age]} · War`,
          actions: entry.outcomes.map((o) => {
            const sum = o.tokens.reduce((a, b) => a + b, 0);
            return {
              key: `${i}-${o.playerIndex}`,
              icon: "⚔️",
              spans: [warLine(label(o.playerIndex, myIndex, names), o.tokens)],
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
          label: "Game over",
          actions: [
            {
              key: `${i}-w`,
              icon: "🏆",
              spans: [
                `${label(entry.winner, myIndex, names)} won with ${entry.totals[entry.winner]} VP`,
              ],
              variant: "success",
            },
          ],
        });
        break;
    }
  });

  return blocks;
}
