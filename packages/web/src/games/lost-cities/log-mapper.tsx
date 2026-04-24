import type {
  ActionLogEntry,
  Card as CardData,
  PlayerIndex,
} from "@boardgames/core/games/lost-cities/types";
import { COLOR_HEX, COLOR_LABELS } from "@boardgames/core/games/lost-cities/types";
import type {
  LogAction,
  LogBlock,
  LogCardRef,
  LogSpan,
  LogTextSpan,
  LogVariant,
} from "../../components/action-log";
import Card from "./components/Card";

// ---------------------------------------------------------------------------
// Mappings
// ---------------------------------------------------------------------------

type LCAction = ActionLogEntry["action"];

const VARIANT_MAP: Record<LCAction, LogVariant> = {
  "play-expedition": "action",
  "play-discard": "neutral",
  "draw-pile": "info",
  "draw-discard": "info",
};

const ICON_MAP: Record<LCAction, string> = {
  "play-expedition": "\uD83C\uDFD4\uFE0F",
  "play-discard": "\uD83D\uDDD1\uFE0F",
  "draw-pile": "\uD83C\uDCCF",
  "draw-discard": "\u267B\uFE0F",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function cardRef(card: CardData): LogCardRef | null {
  if (card.id === -1) return null;
  const value = card.type === "wager" ? "W" : String(card.value);
  const label = `${COLOR_LABELS[card.color]} ${value}`;
  return {
    card: label,
    color: COLOR_HEX[card.color],
    tooltipContent: <Card card={card} size="hand" disabled />,
  };
}

function buildSpans(entry: ActionLogEntry, playerNames: [string, string]): LogSpan[] {
  const actor: LogTextSpan = {
    text: playerNames[entry.player],
    bold: true,
    color: entry.player === 0 ? "#7dd3fc" : "#fdba74",
  };
  const card = cardRef(entry.card);

  switch (entry.action) {
    case "play-expedition":
      return [actor, " played ", ...(card ? [card] : []), " to expedition"];
    case "play-discard":
      return [actor, " discarded ", ...(card ? [card] : [])];
    case "draw-pile":
      return [actor, " drew ", ...(card ? [card] : ["a card"]), " from draw pile"];
    case "draw-discard":
      if (entry.color !== undefined) {
        return [
          actor,
          " drew ",
          ...(card ? [card] : ["a card"]),
          " from ",
          { text: COLOR_LABELS[entry.color], bold: true, color: COLOR_HEX[entry.color] },
          " discard",
        ];
      }
      return [actor, " drew ", ...(card ? [card] : ["a card"]), " from discard"];
  }
}

// ---------------------------------------------------------------------------
// Public mapper
// ---------------------------------------------------------------------------

export function mapLostCitiesLog(
  entries: ActionLogEntry[],
  playerNames: [string, string] = ["You", "Opponent"],
): LogBlock[] {
  const grouped = new Map<
    string,
    { turn: number; player: PlayerIndex; entries: ActionLogEntry[] }
  >();

  for (const entry of entries) {
    const key = `${entry.turn}-${entry.player}`;
    const group = grouped.get(key);
    if (group) {
      group.entries.push(entry);
    } else {
      grouped.set(key, { turn: entry.turn, player: entry.player, entries: [entry] });
    }
  }

  const blocks: LogBlock[] = [];
  for (const [key, group] of grouped) {
    const actions: LogAction[] = group.entries.map((entry, i) => ({
      key: `${key}-${i}`,
      icon: ICON_MAP[entry.action],
      spans: buildSpans(entry, playerNames),
      variant: VARIANT_MAP[entry.action],
    }));
    blocks.push({
      key,
      label: `Turn ${group.turn + 1} \u00b7 ${playerNames[group.player]}`,
      actions,
    });
  }
  return blocks;
}
