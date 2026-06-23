import type { ProfileEditable, ProfileStats, ProfileUserSummary } from "@boardgames/core/protocol";
import type { CSSProperties } from "react";
import { formatMonthYear } from "../../lib/profile-format.ts";
import { EditIcon, PinIcon } from "../icons";
import { Avatar } from "../ui/Avatar.tsx";
import { Badge } from "../ui/Badge.tsx";
import { Button } from "../ui/Button.tsx";
import { StatTile } from "./StatTile.tsx";

// Profile hero: accent-gradient banner, overlapping avatar, identity block,
// quick-stat tiles, and derived badges. The banner accent comes from the
// player's profile (falls back to the app accent). Edit affordance shows only
// for the owner.

type ProfileHeaderProps = {
  user: ProfileUserSummary;
  profile: ProfileEditable;
  stats: ProfileStats;
  isSelf: boolean;
  onEdit: () => void;
};

function formatPercent(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

export function ProfileHeader({ user, profile, stats, isSelf, onEdit }: ProfileHeaderProps) {
  const accent = profile.accentHex ?? "#6366f1";
  const style = { "--accent": accent } as CSSProperties;

  return (
    <header
      style={style}
      className="overflow-hidden rounded-2xl border border-white/[0.06] bg-surface-900/40"
    >
      <div className="relative h-24 bg-gradient-to-br from-[var(--accent)]/45 via-[var(--accent)]/15 to-surface-900 sm:h-32">
        {isSelf && (
          <Button
            variant="secondary"
            size="sm"
            onClick={onEdit}
            className="absolute right-3 top-3 gap-1.5"
          >
            <EditIcon />
            Edit profile
          </Button>
        )}
      </div>

      <div className="px-4 pb-5 sm:px-6">
        <div className="-mt-10 flex flex-wrap items-end gap-4 sm:-mt-12">
          <Avatar name={user.name} image={user.image} accentHex={accent} size="xl" ring />
          <div className="min-w-0 flex-1 pb-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
                {user.name}
              </h1>
              {profile.pronouns && (
                <span className="text-sm text-fg-muted">{profile.pronouns}</span>
              )}
              {user.role === "admin" && (
                <Badge tone="accent" size="sm">
                  Admin
                </Badge>
              )}
            </div>
            {profile.tagline && (
              <p className="mt-0.5 text-sm text-fg-secondary">{profile.tagline}</p>
            )}
            <p className="mt-1 flex items-center gap-1 text-2xs text-fg-muted">
              {profile.location && (
                <>
                  <PinIcon className="h-3 w-3" />
                  <span>{profile.location}</span>
                  <span aria-hidden="true">·</span>
                </>
              )}
              <span>Member since {formatMonthYear(user.memberSince)}</span>
            </p>
          </div>
        </div>

        {profile.bio && (
          <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-fg-secondary">
            {profile.bio}
          </p>
        )}

        {profile.links.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {profile.links.map((link) => (
              <a
                key={`${link.label}-${link.url}`}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full border border-white/10 bg-surface-800/60 px-3 py-1 text-xs font-medium text-fg-secondary transition hover:border-accent-400/40 hover:text-accent-200"
              >
                {link.label}
              </a>
            ))}
          </div>
        )}

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatTile
            label="Games played"
            value={stats.gamesPlayed}
            sub={`${stats.distinctGames} different`}
          />
          <StatTile
            label="Win rate"
            value={formatPercent(stats.winRate)}
            sub={`${stats.wins}W · ${stats.losses}L`}
          />
          <StatTile label="Games owned" value={stats.gamesOwned} />
          <StatTile label="Nights attended" value={stats.nightsAttended} />
        </div>
      </div>
    </header>
  );
}
