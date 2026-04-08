import type {
  ActionLogEntry,
  CardType,
  SushiGoLogAction,
} from "@boardgames/core/games/sushi-go/types";
import { CARD_EMOJI, CARD_LABELS } from "@boardgames/core/games/sushi-go/types";
import type { ReactNode } from "react";
import type { LogVariant, TurnGroup } from "../../../components/action-log";
import { ActionLog as ActionLogContainer, CardTag } from "../../../components/action-log";

// ---------------------------------------------------------------------------
// Card image resolution
// ---------------------------------------------------------------------------

const cardImages = import.meta.glob<{ default: string }>("../assets/cards/*.png", { eager: true });

function getCardImageUrl(type: CardType): string {
  const key = `../assets/cards/${type}.png`;
  return cardImages[key]?.default ?? "";
}

// ---------------------------------------------------------------------------
// Variant & icon mapping
// ---------------------------------------------------------------------------

const VARIANT_MAP: Record<SushiGoLogAction, LogVariant> = {
  reveal: "action",
  chopsticks: "action",
  "round-end": "warning",
  "game-end": "special",
};

const ICON_MAP: Record<SushiGoLogAction, string> = {
  reveal: "🃏",
  chopsticks: "🃏",
  "round-end": "📊",
  "game-end": "🏆",
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

function playerTag(playerIndex: number, myIndex: number, playerCount: number): ReactNode {
  const isYou = playerIndex === myIndex;
  return (
    <span className={`font-semibold ${isYou ? "text-sky-300" : "text-orange-300"}`}>
      {playerName(playerIndex, myIndex, playerCount)}
    </span>
  );
}

function cardTag(type: CardType): ReactNode {
  return (
    <CardTag emoji={CARD_EMOJI[type]} label={CARD_LABELS[type]} imageUrl={getCardImageUrl(type)} />
  );
}

function describeEntry(entry: ActionLogEntry, myIndex: number, playerCount: number): ReactNode {
  switch (entry.action) {
    case "reveal": {
      const actor = playerTag(entry.playerIndex, myIndex, playerCount);
      const cards = entry.cards ?? [];
      if (entry.usedChopsticks && cards.length === 2) {
        return (
          <span>
            {actor} played {cardTag(cards[0].type)} + {cardTag(cards[1].type)} (chopsticks)
          </span>
        );
      }
      return (
        <span>
          {actor} played{" "}
          <span className="inline-flex flex-wrap gap-0.5">
            {cards.map((c) => (
              <span key={c.id}>{cardTag(c.type)}</span>
            ))}
          </span>
        </span>
      );
    }
    case "round-end": {
      const scores = entry.scores ?? [];
      return (
        <span>
          Round {entry.round} scored: {scores.join(", ")}
        </span>
      );
    }
    case "game-end": {
      const scores = entry.scores ?? [];
      return <span>Game over! Final scores: {scores.join(", ")}</span>;
    }
    default:
      return <span>Unknown action</span>;
  }
}

// ---------------------------------------------------------------------------
// Grouping entries into TurnGroups
// ---------------------------------------------------------------------------

function buildGroups(entries: ActionLogEntry[], myIndex: number, playerCount: number): TurnGroup[] {
  const groups: TurnGroup[] = [];

  for (let idx = 0; idx < entries.length; idx++) {
    const entry = entries[idx];
    const groupKey = `r${entry.round}-t${entry.turn}`;
    const label = `Round ${entry.round} \u00B7 Turn ${entry.turn}`;

    const last = groups[groups.length - 1];
    const logEntry = {
      key: idx,
      icon: ICON_MAP[entry.action],
      content: describeEntry(entry, myIndex, playerCount),
      variant: VARIANT_MAP[entry.action],
    };

    if (last && last.key === groupKey) {
      last.entries.push(logEntry);
    } else {
      groups.push({
        key: groupKey,
        label,
        entries: [logEntry],
      });
    }
  }

  return groups;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface ActionLogProps {
  entries: ActionLogEntry[];
  myIndex: number;
  playerCount: number;
}

export default function ActionLog({ entries, myIndex, playerCount }: ActionLogProps) {
  const groups = buildGroups(entries, myIndex, playerCount);

  return <ActionLogContainer groups={groups} emptyMessage="Game log will appear here..." />;
}
