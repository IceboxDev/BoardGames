import { useEffect, useRef } from "react";
import type { ActionLogEntry, GameState } from "../logic/types";
import { CARD_LABELS } from "../logic/types";

interface ActionLogProps {
  entries: ActionLogEntry[];
  players: GameState["players"];
}

function playerName(players: GameState["players"], index: number): string {
  const p = players[index];
  return p?.type === "human" ? "You" : `AI ${index}`;
}

function describeAction(
  entry: ActionLogEntry,
  players: GameState["players"],
  isHumanViewing: boolean,
): string {
  const actor = playerName(players, entry.playerIndex);

  switch (entry.action) {
    case "play-card":
      return `${actor} played ${CARD_LABELS[entry.cardType!]}`;
    case "play-combo":
      return `${actor} played a ${entry.detail} combo`;
    case "draw": {
      const isActorHuman = players[entry.playerIndex]?.type === "human";
      if (isActorHuman || !isHumanViewing) {
        return `${actor} drew ${entry.cardType ? CARD_LABELS[entry.cardType] : "a card"}`;
      }
      return `${actor} drew a card`;
    }
    case "nope":
      return `${actor} played Nope!`;
    case "defuse":
      return `${actor} played Defuse!`;
    case "exploded":
      return `💥 ${actor} exploded!`;
    case "reinsert":
      return `${actor} reinserted the kitten`;
    case "favor-give":
      return `${actor} took a ${entry.cardType ? CARD_LABELS[entry.cardType] : "card"} from ${playerName(players, entry.targetPlayerIndex!)}`;
    case "steal":
      return `${actor} stole from ${playerName(players, entry.targetPlayerIndex!)} (${entry.detail})`;
    case "peek":
      return `${actor} peeked at the future`;
    case "skip-turn":
      return `${actor} skipped their turn`;
    case "attack":
      return `${actor} attacked ${playerName(players, entry.targetPlayerIndex!)}`;
    case "shuffle":
      return `${actor} shuffled the deck`;
    default:
      return `${actor} did something`;
  }
}

export default function ActionLog({ entries, players }: ActionLogProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const hasHuman = players.some((p) => p.type === "human");

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  if (entries.length === 0) {
    return <div className="text-xs text-gray-600 italic">No actions yet</div>;
  }

  return (
    <div ref={scrollRef} className="flex flex-col gap-0.5 overflow-y-auto max-h-64 text-xs">
      {entries.map((entry, i) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: static list / chart data points don't reorder
          key={i}
          className={`rounded px-2 py-1 ${
            entry.action === "exploded"
              ? "bg-red-900/30 text-red-300"
              : entry.action === "nope"
                ? "bg-yellow-900/30 text-yellow-300"
                : "text-gray-400"
          }`}
        >
          <span className="text-gray-600 mr-1">T{entry.turn}</span>
          {describeAction(entry, players, hasHuman)}
        </div>
      ))}
    </div>
  );
}
