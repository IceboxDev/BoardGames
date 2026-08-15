import type { ProfileMatchSummaryResponse } from "@boardgames/core/protocol";
import { Link } from "react-router-dom";
import { formatShortDate } from "../../../lib/date-format.ts";
import { UsersIcon } from "../../icons";
import { Avatar } from "../../ui/Avatar.tsx";
import { EmptyState } from "../../ui/EmptyState.tsx";
import { coPlayerCounts } from "./summary-stats.ts";

const TOP_COMPANIONS = 6;

/** Most frequent co-players, with avatar links to their profiles. */
export function PlayedWithPanel({
  items,
  players,
}: {
  items: ProfileMatchSummaryResponse["items"];
  players: ProfileMatchSummaryResponse["players"];
}) {
  const companions = coPlayerCounts(items).slice(0, TOP_COMPANIONS);
  if (companions.length === 0) {
    return (
      <EmptyState
        icon={<UsersIcon className="h-4 w-4" />}
        title="No shared games yet"
        description="Companions appear once matches are recorded together."
      />
    );
  }

  return (
    <ul className="space-y-1">
      {companions.map((companion) => {
        const info = players[companion.userId];
        return (
          <li key={companion.userId}>
            <Link
              to={`/u/${companion.userId}`}
              className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition hover:bg-white/[0.04]"
            >
              <Avatar name={info?.name ?? "Unknown player"} image={info?.image ?? null} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-fg-primary">
                  {info?.name ?? "Unknown player"}
                </span>
                <span className="block text-3xs text-fg-muted">
                  {companion.games} game{companion.games === 1 ? "" : "s"} together · last{" "}
                  {formatShortDate(companion.lastPlayedAt)}
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
