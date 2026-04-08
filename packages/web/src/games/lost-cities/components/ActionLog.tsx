import type {
  ActionLogEntry,
  Card,
  ExpeditionColor,
  PlayerIndex,
} from "@boardgames/core/games/lost-cities/types";
import { COLOR_HEX, COLOR_LABELS } from "@boardgames/core/games/lost-cities/types";
import type { ReactNode } from "react";
import type { LogEntry, LogVariant, TurnGroup } from "../../../components/action-log";
import { ActionLog, CardTag } from "../../../components/action-log";

// ---------------------------------------------------------------------------
// Card image URL helper (mirrors Card.tsx logic)
// ---------------------------------------------------------------------------

const cardImages = import.meta.glob<{ default: string }>("../assets/cards/**/*.png", {
  eager: true,
});

function getCardImageUrl(card: Card): string {
  const localIdx = card.id % 12;
  const filename = localIdx < 3 ? `wager-${localIdx + 1}` : `${card.value}`;
  const key = `../assets/cards/${card.color}/${filename}.png`;
  return cardImages[key]?.default ?? "";
}

// ---------------------------------------------------------------------------
// Variant / icon mappings
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

function cardFallback(card: Card): ReactNode {
  const hex = COLOR_HEX[card.color];
  const value = card.type === "wager" ? "W" : String(card.value);
  return (
    <div
      className="flex h-[220px] w-full flex-col items-center justify-center rounded-lg"
      style={{ backgroundColor: hex }}
    >
      <span className="text-4xl font-bold text-white drop-shadow-lg">{value}</span>
      <span className="mt-1 text-xs font-medium text-white/80">{COLOR_LABELS[card.color]}</span>
    </div>
  );
}

function cardTag(card: Card): ReactNode {
  if (card.id === -1) return null;
  const value = card.type === "wager" ? "W" : String(card.value);
  const label = `${COLOR_LABELS[card.color]} ${value}`;
  const imageUrl = getCardImageUrl(card);
  return (
    <CardTag
      label={label}
      imageUrl={imageUrl || undefined}
      tooltipContent={imageUrl ? undefined : cardFallback(card)}
    />
  );
}

function colorBadge(color: ExpeditionColor): ReactNode {
  return (
    <span
      className="inline-block h-2 w-2 rounded-full align-middle"
      style={{ backgroundColor: COLOR_HEX[color] }}
    />
  );
}

function describeAction(entry: ActionLogEntry, playerNames: [string, string]): ReactNode {
  const actor = (
    <span className={`font-semibold ${entry.player === 0 ? "text-sky-300" : "text-orange-300"}`}>
      {playerNames[entry.player]}
    </span>
  );
  const card = entry.card.id !== -1 ? cardTag(entry.card) : null;

  switch (entry.action) {
    case "play-expedition":
      return (
        <span>
          {actor} played {card} {colorBadge(entry.card.color)} to expedition
        </span>
      );
    case "play-discard":
      return (
        <span>
          {actor} discarded {card} {colorBadge(entry.card.color)}
        </span>
      );
    case "draw-pile":
      return (
        <span>
          {actor} drew {card ?? "a card"} from draw pile
        </span>
      );
    case "draw-discard":
      return (
        <span>
          {actor} drew {card ?? "a card"} from{" "}
          {entry.color !== undefined && (
            <>
              {colorBadge(entry.color)} {COLOR_LABELS[entry.color]}{" "}
            </>
          )}
          discard
        </span>
      );
  }
}

// ---------------------------------------------------------------------------
// Group entries into TurnGroups for the shared ActionLog
// ---------------------------------------------------------------------------

function buildGroups(entries: ActionLogEntry[], playerNames: [string, string]): TurnGroup[] {
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

  const groups: TurnGroup[] = [];
  for (const [key, group] of grouped) {
    const logEntries: LogEntry[] = group.entries.map((entry, i) => ({
      key: `${key}-${i}`,
      icon: ICON_MAP[entry.action],
      content: describeAction(entry, playerNames),
      variant: VARIANT_MAP[entry.action],
    }));
    groups.push({
      key,
      label: `Turn ${group.turn} — ${playerNames[group.player]}`,
      entries: logEntries,
    });
  }

  return groups;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface LCActionLogProps {
  entries: ActionLogEntry[];
  playerNames?: [string, string];
}

export default function LCActionLog({ entries, playerNames }: LCActionLogProps) {
  const names: [string, string] = playerNames ?? ["You", "Opponent"];
  const groups = buildGroups(entries, names);
  return <ActionLog groups={groups} emptyMessage="No actions yet" />;
}
