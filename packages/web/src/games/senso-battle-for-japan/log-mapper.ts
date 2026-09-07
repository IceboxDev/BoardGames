import type {
  Clan,
  LogEntry,
  RewardAction,
  SensoPlayerView,
} from "@boardgames/core/games/senso-battle-for-japan/types";
import {
  CLAN_KANJI,
  CLAN_LABELS,
  factionLabel,
  regionLabel,
} from "@boardgames/core/games/senso-battle-for-japan/types";
import type {
  LogAction,
  LogBlock,
  LogCardRef,
  LogSpan,
  LogTextSpan,
  LogVariant,
} from "../../components/action-log";
import { CLAN_ACCENT, factionColor } from "./colors";
import { cardLabel } from "./logic/cards";
import { seatShortLabel } from "./logic/seat-labels";

type View = Pick<SensoPlayerView, "me" | "players">;

function playerSpan(view: View, seat: number, names: readonly (string | null)[]): LogTextSpan {
  const clan = view.players[seat]?.clan ?? null;
  return { text: seatShortLabel(view, seat, names), bold: true, color: factionColor(clan) };
}

function clanSpan(clan: Clan): LogTextSpan {
  return { text: `${CLAN_KANJI[clan]} ${CLAN_LABELS[clan]}`, bold: true, color: CLAN_ACCENT[clan] };
}

function cardRef(card: LogCardRef["card"] extends string ? string : never): LogCardRef {
  return { card };
}

function region(r: number): string {
  return `region ${regionLabel(r)}`;
}

function rewardSentence(action: RewardAction, victim: Clan | null): LogSpan[] {
  switch (action.type) {
    case "balance-swap":
      return [" climbed a square in ", region(action.region)];
    case "balance-move":
      return [" marched from ", region(action.region), " into ", region(action.to)];
    case "balance-replace":
      return [
        " marched from ",
        region(action.region),
        " into ",
        region(action.to),
        ...(victim ? [", pushing out ", clanSpan(victim)] : []),
      ];
    case "determination":
      return [" reinforced ", region(action.region)];
    case "aggression":
      return victim
        ? [" struck ", clanSpan(victim), " in ", region(action.region)]
        : [" struck a cube in ", region(action.region)];
  }
}

function entryBlockRound(entry: LogEntry): number {
  switch (entry.kind) {
    case "advantage-row":
      return entry.half === 1 ? 1 : 5;
    case "bonus":
    case "bonus-pass":
      return 4;
    case "game-over":
      return 8;
    default:
      return entry.round;
  }
}

function toAction(
  entry: LogEntry,
  index: number,
  view: View,
  names: readonly (string | null)[],
): LogAction {
  const key = `${entryBlockRound(entry)}-${index}`;
  switch (entry.kind) {
    case "round-start":
      return {
        key,
        icon: "🏯",
        variant: "info",
        spans: [
          `Round ${entry.round} begins — `,
          clanSpan(entry.trump),
          " holds the advantage; ",
          playerSpan(view, entry.firstPlayer, names),
          `${entry.firstPlayer === view.me ? " lead" : " leads"} (${entry.cardsEach} cards each)`,
        ],
      };
    case "trick-won": {
      const winning = entry.plays.find((p) => p.seat === entry.winner);
      return {
        key,
        icon: "⚔️",
        variant: entry.winner === view.me ? "success" : "action",
        spans: [
          playerSpan(view, entry.winner, names),
          ` won conflict ${entry.trick}`,
          ...(winning ? [" with ", cardRef(cardLabel(winning.card))] : []),
        ],
      };
    }
    case "reward": {
      const victim = entry.effects.find((e) => e.kind === "removed")?.clan ?? null;
      const as = entry.action.as;
      return {
        key,
        icon:
          entry.action.type === "aggression"
            ? "💥"
            : entry.action.type === "determination"
              ? "➕"
              : "➡️",
        variant: entry.action.type === "aggression" ? "danger" : "action",
        spans: [
          playerSpan(view, entry.player, names),
          ...(as ? [" (as ", clanSpan(as), ")"] : []),
          ...rewardSentence(entry.action, victim),
        ],
      };
    }
    case "reward-pass":
      return {
        key,
        icon: "⏭️",
        variant: "neutral",
        spans: [playerSpan(view, entry.player, names), " waived their reward"],
      };
    case "bonus":
      return {
        key,
        icon: "🎁",
        variant: "special",
        spans: [
          playerSpan(view, entry.player, names),
          " placed a bonus cube in ",
          region(entry.region),
        ],
      };
    case "bonus-pass":
      return {
        key,
        icon: "⏭️",
        variant: "neutral",
        spans: [playerSpan(view, entry.player, names), " skipped the bonus cube"],
      };
    case "advantage-row":
      return {
        key,
        icon: "🔀",
        variant: "info",
        spans: [
          entry.half === 1 ? "Faction advantage: " : "New faction advantage row: ",
          ...entry.row.flatMap((clan, i): LogSpan[] =>
            i === 0 ? [clanSpan(clan)] : [" · ", clanSpan(clan)],
          ),
        ],
      };
    case "game-over": {
      const winner = entry.winner;
      const spans: LogSpan[] =
        winner === null
          ? ["The clans fought to a standstill"]
          : [playerSpan(view, winner, names), ` takes the throne with ${entry.scores[winner]} VP`];
      return { key, icon: "🏆", variant: "success", spans };
    }
  }
}

function blockLabel(round: number, entries: LogEntry[]): string {
  const start = entries.find((e) => e.kind === "round-start");
  if (start && start.kind === "round-start") {
    return `Round ${round} · ${CLAN_KANJI[start.trump]} ${factionLabel(start.trump)}`;
  }
  return `Round ${round}`;
}

/** Group the public log into one block per round for the history rail. */
export function mapSensoLog(
  log: readonly LogEntry[],
  view: View,
  names: readonly (string | null)[] = [],
): LogBlock[] {
  const grouped = new Map<number, LogEntry[]>();
  for (const entry of log) {
    const round = entryBlockRound(entry);
    const list = grouped.get(round);
    if (list) list.push(entry);
    else grouped.set(round, [entry]);
  }
  const blocks: LogBlock[] = [];
  for (const [round, entries] of grouped) {
    blocks.push({
      key: round,
      label: blockLabel(round, entries),
      actions: entries.map((entry, i) => toAction(entry, i, view, names)),
    });
  }
  return blocks;
}

export type { LogVariant };
