import type { ProfileEditable, ProfileStats, ProfileUserSummary } from "@boardgames/core/protocol";
import type { CSSProperties } from "react";
import { DEFAULT_ACCENT } from "../../lib/accent.ts";
import { formatMonthYear } from "../../lib/date-format.ts";
import { CameraIcon, EditIcon, PinIcon } from "../icons";
import { Avatar } from "../ui/Avatar.tsx";
import { Badge } from "../ui/Badge.tsx";
import { Button, ButtonLink } from "../ui/Button.tsx";
import { Surface } from "../ui/Surface.tsx";
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
  /** Whether the viewer may change this avatar (owner or admin). */
  canChangeAvatar: boolean;
  onEdit: () => void;
  /** Open the AI avatar generator (avatar becomes a click target). */
  onChangeAvatar: () => void;
};

function formatPercent(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

// Raw W/L split under the (placement-weighted) win-rate headline. Non-W/L
// plays are named for what they are — moderated (Storyteller / DM), ongoing
// (campaign still open), scored (Just One-style co-op) — all explicit server
// counts, never a remainder. Sessions of a concluded campaign appear in no
// bucket: the campaign's single win/loss sits on its concluding session.
function winLossSub(stats: ProfileStats): string {
  const parts = [`${stats.wins}W`, `${stats.losses}L`];
  if (stats.draws > 0) parts.push(`${stats.draws}D`);
  if (stats.moderated > 0) parts.push(`${stats.moderated} ran`);
  if (stats.ongoing > 0) parts.push(`${stats.ongoing} ongoing`);
  if (stats.scored > 0) parts.push(`${stats.scored} scored`);
  return parts.join(" · ");
}

export function ProfileHeader({
  user,
  profile,
  stats,
  isSelf,
  canChangeAvatar,
  onEdit,
  onChangeAvatar,
}: ProfileHeaderProps) {
  const accent = profile.accentHex ?? DEFAULT_ACCENT;
  const style = { "--accent": accent } as CSSProperties;

  return (
    <Surface
      as="header"
      variant="raised"
      padding="none"
      style={style}
      className="relative overflow-hidden"
    >
      {/* Banner is a plain (non-positioned) background block; the content below
          uses `relative z-10` so the overlapping avatar + name paint ON TOP of
          it. A positioned banner paints over static content per CSS stacking
          rules — that was the bug (banner covered the avatar/name). */}
      <div className="h-24 bg-gradient-to-br from-[var(--accent)]/45 via-[var(--accent)]/15 to-surface-900 sm:h-32" />

      {isSelf && (
        // Positioning lives on a wrapper, never on the Button itself: Button's
        // base is `relative` (its loading-spinner anchor), and passing
        // `absolute` through className made the two position classes fight in
        // the stylesheet — `relative` won by generated-CSS order and the
        // button fell into normal flow at the card's left edge, floating over
        // the avatar. A wrapper owns the placement; the primitive stays whole.
        <div className="absolute right-3 top-3 z-20">
          <Button variant="secondary" size="sm" onClick={onEdit} className="gap-1.5">
            <EditIcon />
            Edit profile
          </Button>
        </div>
      )}

      <div className="relative z-10 px-4 pb-5 sm:px-6">
        <div className="-mt-10 flex flex-wrap items-end gap-4 sm:-mt-12">
          {canChangeAvatar ? (
            // biome-ignore lint/correctness/noRestrictedElements: avatar doubles as the change-photo trigger
            <button
              type="button"
              onClick={onChangeAvatar}
              aria-label="Change profile picture"
              className="group/avatar relative shrink-0 rounded-full"
            >
              <Avatar name={user.name} image={user.image} accentHex={accent} size="xl" ring />
              <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/45 text-white opacity-0 transition group-hover/avatar:opacity-100">
                <CameraIcon className="h-5 w-5" />
              </span>
            </button>
          ) : (
            <Avatar name={user.name} image={user.image} accentHex={accent} size="xl" ring />
          )}
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
              <ButtonLink
                key={`${link.label}-${link.url}`}
                href={link.url}
                external
                size="xs"
                shape="pill"
                className="bg-surface-800/60 hover:text-accent-200"
              >
                {link.label}
              </ButtonLink>
            ))}
          </div>
        )}

        {/* Tiles 1/3/4 navigate to the profile sub-pages; tile 2's skill /
            leaderboard page isn't built yet, so it wears the uniform "Soon"
            slot instead of a CTA. */}
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatTile
            label="Games played"
            value={stats.gamesPlayed}
            sub={`${stats.distinctGames} different`}
            to={`/u/${user.id}/matches`}
            cta="View history"
          />
          <StatTile
            label="Win rate"
            value={formatPercent(stats.performance)}
            sub={winLossSub(stats)}
            soon
          />
          <StatTile
            label="Games owned"
            value={stats.gamesOwned}
            to={`/u/${user.id}/collection`}
            cta="View collection"
          />
          <StatTile
            label="Nights attended"
            value={`${stats.nightsAttended} / ${stats.nightsTotal}`}
            to={`/u/${user.id}/nights`}
            cta="View nights"
          />
        </div>
      </div>
    </Surface>
  );
}
