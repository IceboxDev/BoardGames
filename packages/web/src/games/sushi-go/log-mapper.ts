import type {
  ActionLogEntry,
  CardType,
  SushiGoLogAction,
} from "@boardgames/core/games/sushi-go/types";
import { CARD_COLORS, CARD_LABELS } from "@boardgames/core/games/sushi-go/types";
import type {
  LogAction,
  LogBlock,
  LogCardRef,
  LogSpan,
  LogTextSpan,
  LogVariant,
} from "../../components/action-log";

// ---------------------------------------------------------------------------
// Card image resolution
// ---------------------------------------------------------------------------

const cardImages = import.meta.glob<{ default: string }>("./assets/cards/*.png", { eager: true });

function getCardImageUrl(type: CardType): string {
  const key = `./assets/cards/${type}.png`;
  return cardImages[key]?.default ?? "";
}

// ---------------------------------------------------------------------------
// Mappings
// ---------------------------------------------------------------------------

const VARIANT_MAP: Record<SushiGoLogAction, LogVariant> = {
  reveal: "action",
  chopsticks: "action",
  "round-end": "warning",
  "game-end": "special",
};

const ICON_MAP: Record<SushiGoLogAction, string> = {
  reveal: "\uD83C\uDCCF",
  chopsticks: "\uD83C\uDCCF",
  "round-end": "\uD83D\uDCCA",
  "game-end": "\uD83C\uDFC6",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function playerName(playerIndex: number, myIndex: number, playerCount: number): string {
  if (playerIndex === myIndex) return "You";
  if (playerCount === 2) return "Opponent";
  let num = 0;
  for (let i = 0; i < playerCount; i++) {
    if (i === myIndex) continue;
    num++;
    if (i === playerIndex) return `Opponent ${num}`;
  }
  return "Opponent";
}

function playerSpan(playerIndex: number, myIndex: number, playerCount: number): LogTextSpan {
  const isYou = playerIndex === myIndex;
  return {
    text: playerName(playerIndex, myIndex, playerCount),
    bold: true,
    color: isYou ? "#7dd3fc" : "#fdba74",
  };
}

function cardRef(type: CardType): LogCardRef {
  return {
    card: CARD_LABELS[type],
    color: CARD_COLORS[type],
    imageUrl: getCardImageUrl(type) || undefined,
  };
}

function buildSpans(entry: ActionLogEntry, myIndex: number, playerCount: number): LogSpan[] {
  switch (entry.action) {
    case "reveal":
    case "chopsticks": {
      const actor = playerSpan(entry.playerIndex, myIndex, playerCount);
      const cards = entry.cards ?? [];
      if (entry.usedChopsticks && cards.length === 2) {
        return [
          actor,
          " played ",
          cardRef(cards[0].type),
          " + ",
          cardRef(cards[1].type),
          " (chopsticks)",
        ];
      }
      const cardSpans: LogSpan[] = cards.flatMap((c, i) =>
        i > 0 ? [" ", cardRef(c.type)] : [cardRef(c.type)],
      );
      return [actor, " played ", ...cardSpans];
    }
    case "round-end": {
      const scores = entry.scores ?? [];
      return [`Round ${entry.round} scored: ${scores.join(", ")}`];
    }
    case "game-end": {
      const scores = entry.scores ?? [];
      return [`Game over! Final scores: ${scores.join(", ")}`];
    }
    default:
      return ["Unknown action"];
  }
}

// ---------------------------------------------------------------------------
// Public mapper
// ---------------------------------------------------------------------------

export function mapSushiGoLog(
  entries: ActionLogEntry[],
  myIndex: number,
  playerCount: number,
): LogBlock[] {
  const blocks: LogBlock[] = [];

  for (let idx = 0; idx < entries.length; idx++) {
    const entry = entries[idx];
    const blockKey = `r${entry.round}-t${entry.turn}`;
    const label = `Round ${entry.round} \u00b7 Turn ${entry.turn}`;

    const logAction: LogAction = {
      key: idx,
      icon: ICON_MAP[entry.action],
      spans: buildSpans(entry, myIndex, playerCount),
      variant: VARIANT_MAP[entry.action],
    };

    const last = blocks[blocks.length - 1];
    if (last && last.key === blockKey) {
      last.actions.push(logAction);
    } else {
      blocks.push({ key: blockKey, label, actions: [logAction] });
    }
  }

  return blocks;
}
