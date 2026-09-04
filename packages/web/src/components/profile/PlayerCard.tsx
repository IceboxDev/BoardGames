import type { ProfileDirectoryEntry } from "@boardgames/core/protocol";
import { Link } from "react-router-dom";
import { cn } from "../../lib/cn.ts";
import { formatDayKey } from "../../lib/date-format.ts";
import { GalleryIcon } from "../icons";
import { Avatar } from "../ui/Avatar.tsx";
import { Badge } from "../ui/Badge.tsx";
import { InteractiveCard } from "../ui/InteractiveCard.tsx";

// One player tile in the directory. Links to the full profile. Surfaces the
// quick at-a-glance signal: avatar, name, tagline, owned-game count, and the
// next night they're on (when known).

type PlayerCardProps = {
  player: ProfileDirectoryEntry;
};

export function PlayerCard({ player }: PlayerCardProps) {
  return (
    <InteractiveCard
      as={Link}
      to={`/u/${player.id}`}
      padding="sm"
      className="flex flex-col items-center gap-2 text-center"
    >
      <Avatar name={player.name} image={player.image} accentHex={player.accentHex} size="lg" ring />
      <p className="mt-1 w-full truncate text-sm font-semibold text-fg-primary group-hover:text-white">
        {player.name}
      </p>
      {player.tagline && <p className="line-clamp-2 text-xs text-fg-muted">{player.tagline}</p>}
      {/* Two FIXED rows, never a wrapping one: the next-night badge that only
          some players have used to wrap onto a second line and make those
          tiles taller than the rest of the grid row.
          The empty state renders the SAME <Badge>, differing only by
          `visibility` — never a wrapper around one. A wrapper span becomes the
          flex item and demotes the badge to an inline-level child, which
          establishes a line box and adds leading + descender space; that made
          the placeholder TALLER than a real badge and inverted the bug.
          One element, one box, equal height by construction.
          `visibility: hidden` also keeps it out of the accessibility tree, so
          it needs no aria-hidden. */}
      <div className="mt-auto flex w-full flex-col items-center gap-1.5 pt-1">
        <Badge tone="neutral" size="xs" icon={<GalleryIcon className="h-3 w-3" />}>
          {player.gamesOwned} games
        </Badge>
        <Badge
          tone="accent"
          size="xs"
          className={cn("whitespace-nowrap", !player.nextNightDateKey && "invisible")}
        >
          {player.nextNightDateKey ? formatDayKey(player.nextNightDateKey) : "—"}
        </Badge>
      </div>
    </InteractiveCard>
  );
}
