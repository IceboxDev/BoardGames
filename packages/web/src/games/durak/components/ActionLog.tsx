import type {
  ActionLogAction,
  ActionLogEntry,
  Card,
  DurakPlayerView,
  Rank,
  Suit,
} from "@boardgames/core/games/durak/types";
import { RANK_LABELS, SUIT_SYMBOLS } from "@boardgames/core/games/durak/types";
import type { ReactNode } from "react";
import type { LogEntry, LogVariant, TurnGroup } from "../../../components/action-log";
import { ActionLog, CardTag } from "../../../components/action-log";

// ---------------------------------------------------------------------------
// Card SVG resolution (mirrors Card.tsx)
// ---------------------------------------------------------------------------

const svgModules = import.meta.glob<string>("../../../assets/playing-cards/*.svg", {
  eager: true,
  import: "default",
});

const RANK_FILE_NAMES: Record<Rank, string> = {
  6: "6",
  7: "7",
  8: "8",
  9: "9",
  10: "10",
  11: "jack",
  12: "queen",
  13: "king",
  14: "ace",
};

function getCardSvg(rank: Rank, suit: Suit): string {
  const key = `../../../assets/playing-cards/${RANK_FILE_NAMES[rank]}_of_${suit}.svg`;
  return svgModules[key] ?? "";
}

// ---------------------------------------------------------------------------
// Variant / icon mappings
// ---------------------------------------------------------------------------

const VARIANT_MAP: Record<ActionLogAction, LogVariant> = {
  attack: "action",
  defend: "success",
  "throw-in": "action",
  take: "danger",
  pass: "neutral",
  "bout-won": "success",
  "bout-lost": "danger",
};

const ICON_MAP: Record<ActionLogAction, string> = {
  attack: "\u2694\uFE0F",
  defend: "\uD83D\uDEE1\uFE0F",
  "throw-in": "\u2795",
  take: "\uD83D\uDCE5",
  pass: "\u23ED\uFE0F",
  "bout-won": "\u2705",
  "bout-lost": "\u274C",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type PlayerInfo = DurakPlayerView["players"][number];

function playerName(players: PlayerInfo[], index: number): string {
  const p = players[index];
  if (!p) return `Player ${index}`;
  if (p.type === "human") return "You";
  const opponents = players.filter((pl) => pl.type !== "human");
  if (opponents.length === 1) return "Opponent";
  let num = 0;
  for (const pl of players) {
    if (pl.type !== "human") {
      num++;
      if (pl.index === index) return `Opponent ${num}`;
    }
  }
  return "Opponent";
}

function playerTag(players: PlayerInfo[], index: number): ReactNode {
  const p = players[index];
  const isHuman = p?.type === "human";
  return (
    <span className={`font-semibold ${isHuman ? "text-sky-300" : "text-orange-300"}`}>
      {playerName(players, index)}
    </span>
  );
}

function cardTag(card: Card): ReactNode {
  const suitSymbol = SUIT_SYMBOLS[card.suit];
  const rankLabel = RANK_LABELS[card.rank];
  const imageUrl = getCardSvg(card.rank, card.suit);
  return <CardTag emoji={suitSymbol} label={rankLabel} imageUrl={imageUrl || undefined} />;
}

function describeAction(entry: ActionLogEntry, players: PlayerInfo[]): ReactNode {
  const actor = playerTag(players, entry.playerIndex);

  switch (entry.action) {
    case "attack":
      return (
        <span>
          {actor} attacked with {entry.card && cardTag(entry.card)}
        </span>
      );
    case "defend":
      return (
        <span>
          {actor} defended {entry.attackCard && cardTag(entry.attackCard)} with{" "}
          {entry.card && cardTag(entry.card)}
        </span>
      );
    case "throw-in":
      return (
        <span>
          {actor} threw in {entry.card && cardTag(entry.card)}
        </span>
      );
    case "take":
      return <span>{actor} took all cards</span>;
    case "pass":
      return <span>{actor} passed</span>;
    case "bout-won":
      return <span>Defense successful!</span>;
    case "bout-lost":
      return <span>Defense failed {"\u2014"} cards picked up</span>;
    default:
      return <span>{actor} did something</span>;
  }
}

// ---------------------------------------------------------------------------
// Group entries into TurnGroups for the shared ActionLog
// ---------------------------------------------------------------------------

function buildGroups(entries: ActionLogEntry[], players: PlayerInfo[]): TurnGroup[] {
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
      label: `Bout ${turn}`,
      entries: logEntries,
    });
  }

  return groups;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface DurakActionLogProps {
  entries: ActionLogEntry[];
  players: DurakPlayerView["players"];
}

export default function DurakActionLog({ entries, players }: DurakActionLogProps) {
  const groups = buildGroups(entries, players);
  return <ActionLog groups={groups} emptyMessage="Game log will appear here..." />;
}
