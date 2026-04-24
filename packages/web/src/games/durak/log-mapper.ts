import type {
  ActionLogAction,
  ActionLogEntry,
  Card,
  DurakPlayerView,
  Rank,
  Suit,
} from "@boardgames/core/games/durak/types";
import { RANK_LABELS, SUIT_COLORS, SUIT_SYMBOLS } from "@boardgames/core/games/durak/types";
import type {
  LogAction,
  LogBlock,
  LogCardRef,
  LogSpan,
  LogTextSpan,
  LogVariant,
} from "../../components/action-log";

// ---------------------------------------------------------------------------
// Card SVG resolution
// ---------------------------------------------------------------------------

const svgModules = import.meta.glob<string>("../../assets/playing-cards/*.svg", {
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
  const key = `../../assets/playing-cards/${RANK_FILE_NAMES[rank]}_of_${suit}.svg`;
  return svgModules[key] ?? "";
}

// ---------------------------------------------------------------------------
// Mappings
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

function playerSpan(players: PlayerInfo[], index: number): LogTextSpan {
  const p = players[index];
  const isHuman = p?.type === "human";
  return { text: playerName(players, index), bold: true, color: isHuman ? "#7dd3fc" : "#fdba74" };
}

function cardRef(card: Card): LogCardRef {
  const suitColor = SUIT_COLORS[card.suit];
  return {
    card: `${RANK_LABELS[card.rank]}${SUIT_SYMBOLS[card.suit]}`,
    color: suitColor === "red" ? "#ef4444" : "#9ca3af",
    imageUrl: getCardSvg(card.rank, card.suit) || undefined,
  };
}

function buildSpans(entry: ActionLogEntry, players: PlayerInfo[]): LogSpan[] {
  const actor = playerSpan(players, entry.playerIndex);

  switch (entry.action) {
    case "attack":
      return [actor, " attacked with ", ...(entry.card ? [cardRef(entry.card)] : [])];
    case "defend":
      return [
        actor,
        " defended ",
        ...(entry.attackCard ? [cardRef(entry.attackCard)] : []),
        " with ",
        ...(entry.card ? [cardRef(entry.card)] : []),
      ];
    case "throw-in":
      return [actor, " threw in ", ...(entry.card ? [cardRef(entry.card)] : [])];
    case "take":
      return [actor, " took all cards"];
    case "pass":
      return [actor, " passed"];
    case "bout-won":
      return ["Defense successful!"];
    case "bout-lost":
      return ["Defense failed \u2014 cards picked up"];
    default:
      return [actor, " did something"];
  }
}

/** bout-won/bout-lost are logged after turnCount++ — group them with the preceding bout. */
function groupKey(entry: ActionLogEntry): number {
  if (entry.action === "bout-won" || entry.action === "bout-lost") {
    return Math.max(0, entry.turn - 1);
  }
  return entry.turn;
}

// ---------------------------------------------------------------------------
// Public mapper
// ---------------------------------------------------------------------------

export function mapDurakLog(entries: ActionLogEntry[], players: PlayerInfo[]): LogBlock[] {
  const grouped = new Map<number, ActionLogEntry[]>();
  for (const entry of entries) {
    const key = groupKey(entry);
    const list = grouped.get(key);
    if (list) list.push(entry);
    else grouped.set(key, [entry]);
  }

  const blocks: LogBlock[] = [];
  for (const [turn, turnEntries] of grouped) {
    const actions: LogAction[] = turnEntries.map((entry, i) => ({
      key: `${turn}-${i}`,
      icon: ICON_MAP[entry.action],
      spans: buildSpans(entry, players),
      variant: VARIANT_MAP[entry.action],
    }));
    blocks.push({ key: turn, label: `Turn ${turn + 1}`, actions });
  }
  return blocks;
}
