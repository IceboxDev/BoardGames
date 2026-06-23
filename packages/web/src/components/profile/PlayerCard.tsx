import type { ProfileDirectoryEntry } from "@boardgames/core/protocol";
import { Link } from "react-router-dom";
import { formatDateKey } from "../../lib/profile-format.ts";
import { GalleryIcon } from "../icons";
import { Avatar } from "../ui/Avatar.tsx";
import { Badge } from "../ui/Badge.tsx";

// One player tile in the directory. Links to the full profile. Surfaces the
// quick at-a-glance signal: avatar, name, tagline, owned-game count, and the
// next night they're on (when known).

type PlayerCardProps = {
  player: ProfileDirectoryEntry;
};

export function PlayerCard({ player }: PlayerCardProps) {
  return (
    <Link
      to={`/u/${player.id}`}
      className="group flex flex-col items-center gap-2 rounded-2xl border border-white/[0.06] bg-surface-900/50 p-4 text-center transition-all hover:border-white/15 hover:bg-surface-900"
    >
      <Avatar name={player.name} image={player.image} accentHex={player.accentHex} size="lg" ring />
      <p className="mt-1 w-full truncate text-sm font-semibold text-fg-primary group-hover:text-white">
        {player.name}
      </p>
      {player.tagline && <p className="line-clamp-2 text-xs text-fg-muted">{player.tagline}</p>}
      <div className="mt-auto flex flex-wrap items-center justify-center gap-1.5 pt-1">
        <Badge tone="neutral" size="xs" icon={<GalleryIcon className="h-3 w-3" />}>
          {player.gamesOwned} games
        </Badge>
        {player.nextNightDateKey && (
          <Badge tone="accent" size="xs">
            {formatDateKey(player.nextNightDateKey)}
          </Badge>
        )}
      </div>
    </Link>
  );
}
