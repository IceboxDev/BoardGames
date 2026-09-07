import type { SensoPlayerView } from "@boardgames/core/games/senso-battle-for-japan/types";
import { factionLabel } from "@boardgames/core/games/senso-battle-for-japan/types";

/** "You", the room name, or the faction with an AI tag. */
export function seatLabel(
  view: Pick<SensoPlayerView, "me" | "players">,
  seat: number,
  names: readonly (string | null)[],
): string {
  if (seat === view.me) return "You";
  const name = names[seat];
  if (name) return name;
  const player = view.players[seat];
  if (!player) return `Seat ${seat + 1}`;
  return player.type === "ai" ? `${factionLabel(player.clan)} (AI)` : factionLabel(player.clan);
}

/** Short form for tight spots (trick table, log): first name or the faction. */
export function seatShortLabel(
  view: Pick<SensoPlayerView, "me" | "players">,
  seat: number,
  names: readonly (string | null)[],
): string {
  if (seat === view.me) return "You";
  const name = names[seat];
  if (name) return name.split(/\s+/)[0] ?? name;
  return factionLabel(view.players[seat]?.clan ?? null);
}
