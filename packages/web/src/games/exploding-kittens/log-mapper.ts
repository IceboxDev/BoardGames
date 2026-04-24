import type {
  ActionLogAction,
  ActionLogEntry,
  CardType,
  GameState,
} from "@boardgames/core/games/exploding-kittens/types";
import { CARD_COLORS, CARD_LABELS } from "@boardgames/core/games/exploding-kittens/types";
import type {
  LogAction,
  LogBlock,
  LogCardRef,
  LogSpan,
  LogTextSpan,
  LogVariant,
} from "../../components/action-log";
import { getCardImageUrl, getSkinsForType } from "./assets/card-art";

// ---------------------------------------------------------------------------
// Mappings
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
  "play-combo": "\uD83C\uDCCF",
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

function isHumanPlayer(players: GameState["players"], index: number): boolean {
  return players[index]?.type === "human";
}

function playerSpan(players: GameState["players"], index: number): LogTextSpan {
  const isHuman = isHumanPlayer(players, index);
  return { text: playerName(players, index), bold: true, color: isHuman ? "#7dd3fc" : "#fdba74" };
}

function cardImageForType(cardType: CardType): string | undefined {
  const skins = getSkinsForType(cardType);
  if (skins.length === 0) return undefined;
  return getCardImageUrl(skins[0].file);
}

function cardRef(cardType: CardType): LogCardRef {
  return {
    card: CARD_LABELS[cardType] ?? cardType,
    color: CARD_COLORS[cardType],
    imageUrl: cardImageForType(cardType),
  };
}

function buildSpans(entry: ActionLogEntry, players: GameState["players"]): LogSpan[] {
  const actor = playerSpan(players, entry.playerIndex);
  const actorIsHuman = isHumanPlayer(players, entry.playerIndex);

  switch (entry.action) {
    case "play-card":
      return [actor, " played ", ...(entry.cardType ? [cardRef(entry.cardType)] : [])];
    case "play-combo": {
      if (entry.detail === "five-different" && entry.cardTypes) {
        const cards: LogSpan[] = entry.cardTypes.flatMap((ct, i) =>
          i > 0 ? [" ", cardRef(ct)] : [cardRef(ct)],
        );
        return [
          actor,
          " played ",
          { text: "5 different", bold: true, color: "#d8b4fe" } as LogTextSpan,
          ": ",
          ...cards,
        ];
      }
      const comboLabel =
        entry.detail === "pair" ? "pair" : entry.detail === "triple" ? "triple" : "combo";
      return [
        actor,
        " played a ",
        { text: comboLabel, bold: true, color: "#d8b4fe" } as LogTextSpan,
        ...(entry.cardType ? [" of ", cardRef(entry.cardType)] : []),
      ];
    }
    case "draw": {
      if (actorIsHuman && entry.cardType) {
        return [actor, " drew ", cardRef(entry.cardType)];
      }
      return [actor, " drew a card"];
    }
    case "nope":
      return [actor, " played ", cardRef("nope")];
    case "defuse":
      return [actor, " played ", cardRef("defuse"), " to survive!"];
    case "exploded":
      return [actor, " exploded and is eliminated!"];
    case "reinsert":
      return [actor, " reinserted ", cardRef("exploding-kitten"), " into the deck"];
    case "favor-give": {
      const target = playerSpan(players, entry.targetPlayerIndex ?? 0);
      return [
        actor,
        " forced ",
        target,
        " to give ",
        ...(entry.cardType ? [cardRef(entry.cardType)] : ["a card"]),
      ];
    }
    case "steal": {
      const target = playerSpan(players, entry.targetPlayerIndex ?? 0);
      if (entry.detail === "random") {
        return [
          actor,
          " stole ",
          ...(entry.cardType ? [cardRef(entry.cardType)] : ["a card"]),
          " from ",
          target,
        ];
      }
      if (entry.detail === "named-success" && entry.cardType) {
        return [
          actor,
          " named ",
          cardRef(entry.cardType),
          " and stole it from ",
          target,
          " ",
          { text: "\u2713 hit", bold: true, color: "#4ade80" } as LogTextSpan,
        ];
      }
      if (entry.detail === "named-miss" && entry.cardType) {
        return [
          actor,
          " named ",
          cardRef(entry.cardType),
          " but ",
          target,
          " didn\u2019t have it ",
          { text: "\u2717 miss", bold: true, color: "#f87171" } as LogTextSpan,
        ];
      }
      return [actor, " stole from ", target];
    }
    case "peek":
      return [actor, " peeked at the top of the deck"];
    case "skip-turn":
      return [actor, actorIsHuman ? " skipped your turn" : " skipped their turn"];
    case "attack": {
      const target = playerSpan(players, entry.targetPlayerIndex ?? 0);
      return [actor, " attacked ", target, " \u2014 double turn!"];
    }
    case "shuffle":
      return [actor, " shuffled the draw pile"];
    case "discard-pick":
      return [
        actor,
        " recovered ",
        ...(entry.cardType ? [cardRef(entry.cardType)] : ["a card"]),
        " from the discard pile",
      ];
    default:
      return [actor, " did something"];
  }
}

// ---------------------------------------------------------------------------
// Public mapper
// ---------------------------------------------------------------------------

export function mapEKLog(entries: ActionLogEntry[], players: GameState["players"]): LogBlock[] {
  const grouped = new Map<number, ActionLogEntry[]>();
  for (const entry of entries) {
    const list = grouped.get(entry.turn);
    if (list) list.push(entry);
    else grouped.set(entry.turn, [entry]);
  }

  const blocks: LogBlock[] = [];
  for (const [turn, turnEntries] of grouped) {
    // Determine the main actor for this turn (first non-nope entry, or first entry)
    const mainEntry = turnEntries.find((e) => e.action !== "nope") ?? turnEntries[0];
    const label = `Turn ${turn} \u00b7 ${playerName(players, mainEntry.playerIndex)}`;

    const actions: LogAction[] = turnEntries.map((entry, i) => ({
      key: `${turn}-${i}`,
      icon: ICON_MAP[entry.action],
      spans: buildSpans(entry, players),
      variant: VARIANT_MAP[entry.action],
    }));
    blocks.push({ key: turn, label, actions });
  }
  return blocks;
}
