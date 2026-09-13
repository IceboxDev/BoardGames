import type { SensoPlayerView } from "@boardgames/core/games/senso-battle-for-japan/types";
import { CLAN_KANJI, CLAN_LABELS } from "@boardgames/core/games/senso-battle-for-japan/types";
import { seatShortLabel } from "../../logic/seat-labels";

/**
 * The centre's one sentence for the current trick state. `short` drops the
 * romanised clan name (the phone canvas has no room beside the side slots).
 */
export function statusLine(
  view: Pick<
    SensoPlayerView,
    "phase" | "completedTrick" | "table" | "leader" | "leadSuit" | "me" | "players"
  >,
  names: readonly (string | null)[],
  settling: boolean,
  short = false,
): string {
  if (settling && view.completedTrick) {
    return `${seatShortLabel(view, view.completedTrick.winner, names)} wins the conflict`;
  }
  if (view.phase !== "trick") return "";
  if (view.table.length === 0) return `${seatShortLabel(view, view.leader, names)} to lead`;
  if (view.leadSuit === null)
    return short ? "Ninja led — play anything" : "A Ninja was led — play anything";
  const kanji = CLAN_KANJI[view.leadSuit];
  return short ? `Lead: ${kanji}` : `Lead: ${kanji} ${CLAN_LABELS[view.leadSuit]}`;
}
