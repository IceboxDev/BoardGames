import type {
  ActionLogAction,
  ActionLogEntry,
  CardType,
  GameState,
} from "@boardgames/core/games/exploding-kittens/types";
import { CARD_EMOJI, CARD_LABELS } from "@boardgames/core/games/exploding-kittens/types";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import CardTooltip from "./CardTooltip";

interface ActionLogProps {
  entries: ActionLogEntry[];
  players: GameState["players"];
}

const ACTION_ICONS: Record<ActionLogAction, string> = {
  "play-card": "🃏",
  "play-combo": "🃏🃏",
  draw: "📥",
  nope: "✋",
  defuse: "🔧",
  exploded: "💥",
  reinsert: "💣",
  "favor-give": "🙏",
  steal: "🫳",
  peek: "🔮",
  "skip-turn": "🚫",
  attack: "⚔️",
  shuffle: "🔀",
  "discard-pick": "♻️",
};

const ACTION_STYLES: Record<ActionLogAction, { bg: string; text: string; border: string }> = {
  "play-card": { bg: "bg-blue-950/40", text: "text-blue-200", border: "border-blue-800/40" },
  "play-combo": { bg: "bg-purple-950/40", text: "text-purple-200", border: "border-purple-800/40" },
  draw: { bg: "bg-gray-800/40", text: "text-gray-300", border: "border-gray-700/40" },
  nope: { bg: "bg-yellow-950/40", text: "text-yellow-200", border: "border-yellow-800/40" },
  defuse: { bg: "bg-emerald-950/40", text: "text-emerald-200", border: "border-emerald-800/40" },
  exploded: { bg: "bg-red-950/50", text: "text-red-200", border: "border-red-700/50" },
  reinsert: { bg: "bg-orange-950/40", text: "text-orange-200", border: "border-orange-800/40" },
  "favor-give": { bg: "bg-amber-950/40", text: "text-amber-200", border: "border-amber-800/40" },
  steal: { bg: "bg-pink-950/40", text: "text-pink-200", border: "border-pink-800/40" },
  peek: { bg: "bg-violet-950/40", text: "text-violet-200", border: "border-violet-800/40" },
  "skip-turn": { bg: "bg-slate-800/40", text: "text-slate-300", border: "border-slate-700/40" },
  attack: { bg: "bg-red-950/40", text: "text-red-300", border: "border-red-800/40" },
  shuffle: { bg: "bg-green-950/40", text: "text-green-200", border: "border-green-800/40" },
  "discard-pick": { bg: "bg-teal-950/40", text: "text-teal-200", border: "border-teal-800/40" },
};

function playerName(players: GameState["players"], index: number): string {
  const p = players[index];
  if (!p) return `Player ${index}`;
  return p.type === "human" ? "You" : `AI ${index}`;
}

function playerTag(players: GameState["players"], index: number): ReactNode {
  const p = players[index];
  const isHuman = p?.type === "human";
  return (
    <span className={`font-semibold ${isHuman ? "text-sky-300" : "text-orange-300"}`}>
      {playerName(players, index)}
    </span>
  );
}

function cardTag(cardType: CardType): ReactNode {
  const emoji = CARD_EMOJI[cardType] ?? "";
  const label = CARD_LABELS[cardType] ?? cardType;
  return (
    <CardTooltip cardType={cardType}>
      <span className="inline-flex cursor-help items-center gap-1 rounded bg-white/10 px-1.5 py-0.5 text-[11px] font-medium text-white/90 transition hover:bg-white/20">
        {emoji} {label}
      </span>
    </CardTooltip>
  );
}

function describeAction(entry: ActionLogEntry, players: GameState["players"]): ReactNode {
  const actor = playerTag(players, entry.playerIndex);

  switch (entry.action) {
    case "play-card":
      return (
        <span>
          {actor} played {entry.cardType && cardTag(entry.cardType)}
        </span>
      );
    case "play-combo": {
      const comboLabel =
        entry.detail === "pair" ? "pair" : entry.detail === "triple" ? "triple" : "five-different";
      if (entry.detail === "five-different" && entry.cardTypes) {
        return (
          <span>
            {actor} played <span className="font-medium text-purple-300">5 different</span>:{" "}
            <span className="inline-flex flex-wrap gap-0.5">
              {entry.cardTypes.map((ct, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: append-only card type list
                <span key={i}>{cardTag(ct)}</span>
              ))}
            </span>
          </span>
        );
      }
      return (
        <span>
          {actor} played a <span className="font-medium text-purple-300">{comboLabel}</span> combo
          {entry.cardType && <> of {cardTag(entry.cardType)}</>}
        </span>
      );
    }
    case "draw": {
      const isActorHuman = players[entry.playerIndex]?.type === "human";
      if (isActorHuman && entry.cardType) {
        return (
          <span>
            {actor} drew {cardTag(entry.cardType)}
          </span>
        );
      }
      return <span>{actor} drew a card</span>;
    }
    case "nope":
      return (
        <span>
          {actor} played {cardTag("nope")}
        </span>
      );
    case "defuse":
      return (
        <span>
          {actor} played {cardTag("defuse")} to survive!
        </span>
      );
    case "exploded":
      return <span>{actor} exploded and is eliminated!</span>;
    case "reinsert":
      return (
        <span>
          {actor} reinserted {cardTag("exploding-kitten")} into the deck
        </span>
      );
    case "favor-give":
      return (
        <span>
          {actor} forced {playerTag(players, entry.targetPlayerIndex ?? 0)} to give{" "}
          {entry.cardType ? cardTag(entry.cardType) : "a card"}
        </span>
      );
    case "steal": {
      const target = playerTag(players, entry.targetPlayerIndex ?? 0);
      if (entry.detail === "random") {
        return (
          <span>
            {actor} stole {entry.cardType ? cardTag(entry.cardType) : "a card"} from {target}
          </span>
        );
      }
      if (entry.detail === "named-success" && entry.cardType) {
        return (
          <span>
            {actor} named {cardTag(entry.cardType)} and stole it from {target}{" "}
            <span className="font-medium text-green-400">✓ hit</span>
          </span>
        );
      }
      if (entry.detail === "named-miss" && entry.cardType) {
        return (
          <span>
            {actor} named {cardTag(entry.cardType)} but {target} didn't have it{" "}
            <span className="font-medium text-red-400">✗ miss</span>
          </span>
        );
      }
      return (
        <span>
          {actor} stole from {target}
        </span>
      );
    }
    case "peek":
      return <span>{actor} peeked at the top of the deck</span>;
    case "skip-turn":
      return <span>{actor} skipped their turn</span>;
    case "attack":
      return (
        <span>
          {actor} attacked {playerTag(players, entry.targetPlayerIndex ?? 0)} — they take 2 turns!
        </span>
      );
    case "shuffle":
      return <span>{actor} shuffled the draw pile</span>;
    case "discard-pick":
      return (
        <span>
          {actor} recovered {entry.cardType ? cardTag(entry.cardType) : "a card"} from the discard
          pile
        </span>
      );
    default:
      return <span>{actor} did something</span>;
  }
}

interface TurnGroup {
  turn: number;
  entries: ActionLogEntry[];
}

function groupByTurn(entries: ActionLogEntry[]): TurnGroup[] {
  const groups: TurnGroup[] = [];
  for (const entry of entries) {
    const last = groups[groups.length - 1];
    if (last && last.turn === entry.turn) {
      last.entries.push(entry);
    } else {
      groups.push({ turn: entry.turn, entries: [entry] });
    }
  }
  return groups;
}

export default function ActionLog({ entries, players }: ActionLogProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [prevCount, setPrevCount] = useState(entries.length);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: entries.length - prevCount <= 3 ? "smooth" : "instant",
      });
    }
    setPrevCount(entries.length);
  }, [entries.length, prevCount]);

  if (entries.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center rounded-lg border border-dashed border-gray-700 text-sm text-gray-500">
        Game log will appear here...
      </div>
    );
  }

  const groups = groupByTurn(entries);

  return (
    <div
      ref={scrollRef}
      className="flex flex-col gap-3 overflow-y-auto overscroll-contain pr-1"
      style={{ maxHeight: "calc(100vh - 12rem)" }}
    >
      {groups.map((group) => (
        <div key={group.turn}>
          <div className="sticky top-0 z-10 mb-1 flex items-center gap-2 bg-surface-950/80 py-1 backdrop-blur-sm">
            <span className="rounded bg-gray-700/60 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gray-400">
              Turn {group.turn}
            </span>
            <div className="h-px flex-1 bg-gray-700/40" />
          </div>
          <div className="flex flex-col gap-1">
            {group.entries.map((entry) => {
              const style = ACTION_STYLES[entry.action];
              const icon = ACTION_ICONS[entry.action];
              const globalIdx = entries.indexOf(entry);
              const isNew = globalIdx >= prevCount - 1;
              return (
                <div
                  key={globalIdx}
                  className={`flex items-start gap-2 rounded-lg border px-2.5 py-2 text-[13px] leading-snug transition-colors ${style.bg} ${style.text} ${style.border} ${isNew ? "ring-1 ring-white/10" : ""}`}
                >
                  <span className="mt-0.5 shrink-0 text-sm">{icon}</span>
                  <span className="min-w-0">{describeAction(entry, players)}</span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
