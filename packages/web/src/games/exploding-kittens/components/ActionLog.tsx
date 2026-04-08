import type {
  ActionLogAction,
  ActionLogEntry,
  CardType,
  GameState,
} from "@boardgames/core/games/exploding-kittens/types";
import { CARD_EMOJI, CARD_LABELS } from "@boardgames/core/games/exploding-kittens/types";
import type { ReactNode } from "react";
import type { LogEntry, LogVariant, TurnGroup } from "../../../components/action-log";
import { ActionLog, CardTag } from "../../../components/action-log";
import { getCardImageUrl, getSkinsForType } from "../assets/card-art";

// ---------------------------------------------------------------------------
// Variant / icon mappings
// ---------------------------------------------------------------------------

const VARIANT_MAP: Record<ActionLogAction, LogVariant> = {
  "play-card": "action",
  "play-combo": "special",
  draw: "info",
  nope: "warning",
  defuse: "success",
  exploded: "danger",
  reinsert: "warning",
  "favor-give": "warning",
  steal: "action",
  peek: "special",
  "skip-turn": "neutral",
  attack: "danger",
  shuffle: "info",
  "discard-pick": "action",
};

const ICON_MAP: Record<ActionLogAction, string> = {
  "play-card": "\uD83C\uDCCF",
  "play-combo": "\uD83C\uDCCF\uD83C\uDCCF",
  draw: "\uD83D\uDCE5",
  nope: "\u270B",
  defuse: "\uD83D\uDD27",
  exploded: "\uD83D\uDCA5",
  reinsert: "\uD83D\uDCA3",
  "favor-give": "\uD83D\uDE4F",
  steal: "\uD83E\uDEF3",
  peek: "\uD83D\uDD2E",
  "skip-turn": "\uD83D\uDEAB",
  attack: "\u2694\uFE0F",
  shuffle: "\uD83D\uDD00",
  "discard-pick": "\u267B\uFE0F",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function playerName(players: GameState["players"], index: number): string {
  const p = players[index];
  if (!p) return `Player ${index}`;
  if (p.type === "human") return "You";
  const opponents = players.filter((pl) => pl.type !== "human");
  if (opponents.length === 1) return "Opponent";
  let num = 0;
  for (const pl of players) {
    if (pl.type !== "human") {
      num++;
      if (pl === p) return `Opponent ${num}`;
    }
  }
  return "Opponent";
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

function cardImageForType(cardType: CardType): string | undefined {
  const skins = getSkinsForType(cardType);
  if (skins.length === 0) return undefined;
  return getCardImageUrl(skins[0].file);
}

function cardTag(cardType: CardType): ReactNode {
  const emoji = CARD_EMOJI[cardType] ?? "";
  const label = CARD_LABELS[cardType] ?? cardType;
  return <CardTag emoji={emoji} label={label} imageUrl={cardImageForType(cardType)} />;
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
            <span className="font-medium text-green-400">{"\u2713"} hit</span>
          </span>
        );
      }
      if (entry.detail === "named-miss" && entry.cardType) {
        return (
          <span>
            {actor} named {cardTag(entry.cardType)} but {target} didn't have it{" "}
            <span className="font-medium text-red-400">{"\u2717"} miss</span>
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

// ---------------------------------------------------------------------------
// Group entries into TurnGroups for the shared ActionLog
// ---------------------------------------------------------------------------

function buildGroups(entries: ActionLogEntry[], players: GameState["players"]): TurnGroup[] {
  const grouped = new Map<number, ActionLogEntry[]>();
  for (const entry of entries) {
    const list = grouped.get(entry.turn);
    if (list) {
      list.push(entry);
    } else {
      grouped.set(entry.turn, [entry]);
    }
  }

  const groups: TurnGroup[] = [];
  for (const [turn, turnEntries] of grouped) {
    const logEntries: LogEntry[] = turnEntries.map((entry, i) => ({
      key: `${turn}-${i}`,
      icon: ICON_MAP[entry.action],
      content: describeAction(entry, players),
      variant: VARIANT_MAP[entry.action],
    }));
    groups.push({
      key: turn,
      label: `Turn ${turn}`,
      entries: logEntries,
    });
  }

  return groups;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface EKActionLogProps {
  entries: ActionLogEntry[];
  players: GameState["players"];
}

export default function EKActionLog({ entries, players }: EKActionLogProps) {
  const groups = buildGroups(entries, players);
  return <ActionLog groups={groups} emptyMessage="Game log will appear here..." />;
}
