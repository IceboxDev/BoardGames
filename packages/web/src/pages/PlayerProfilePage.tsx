import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useState } from "react";
import { useParams } from "react-router-dom";
import {
  BookIcon,
  GalleryIcon,
  HeartIcon,
  SparkleIcon,
  StarIcon,
  TrophyIcon,
  UsersIcon,
} from "../components/icons";
import { EditProfileModal } from "../components/profile/EditProfileModal.tsx";
import { GameSlugGrid } from "../components/profile/GameSlugGrid.tsx";
import { GenerateAvatarModal } from "../components/profile/GenerateAvatarModal.tsx";
import { HexSkillChart } from "../components/profile/HexSkillChart.tsx";
import { NextNightCard } from "../components/profile/NextNightCard.tsx";
import { ProfileBadges } from "../components/profile/ProfileBadges.tsx";
import { ProfileHeader } from "../components/profile/ProfileHeader.tsx";
import { ProfileMatchList } from "../components/profile/ProfileMatchList.tsx";
import { ProfileStatsPanel } from "../components/profile/ProfileStatsPanel.tsx";
import { TopNav, TopNavBackButton, TopNavLink } from "../components/TopNav";
import { Button } from "../components/ui/Button.tsx";
import { EmptyState } from "../components/ui/EmptyState.tsx";
import { LoadingState } from "../components/ui/LoadingState.tsx";
import { PageMain, PageShell } from "../components/ui/PageShell.tsx";
import { useCurrentUser } from "../hooks/useCurrentUser.ts";
import { ApiError } from "../lib/api-fetch.ts";
import { fetchProfile, fetchProfileMatches } from "../lib/profile.ts";
import { qk } from "../lib/query-keys.ts";

// Achievements are built but hidden for now (design still being decided). Flip
// to `true` to re-enable the section — ProfileBadges stays imported and typed.
const SHOW_ACHIEVEMENTS = false;

export default function PlayerProfilePage() {
  const { userId } = useParams<{ userId: string }>();
  const { user, isAdmin } = useCurrentUser();
  const isSelf = !!userId && user?.id === userId;
  const canManageAvatar = isSelf || isAdmin;
  const [editing, setEditing] = useState(false);
  const [changingAvatar, setChangingAvatar] = useState(false);
  const [showAllMatches, setShowAllMatches] = useState(false);

  const profileQuery = useQuery({
    queryKey: qk.profile(userId),
    queryFn: ({ signal }) => fetchProfile(userId as string, signal),
    enabled: !!userId,
  });

  const matchesQuery = useInfiniteQuery({
    queryKey: qk.profileMatches(userId as string),
    queryFn: ({ pageParam, signal }) =>
      fetchProfileMatches(userId as string, { before: pageParam, signal }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextBefore,
    enabled: !!userId && showAllMatches,
  });

  const topNav = (
    <TopNav>
      <TopNavBackButton to="/" label="Dashboard" />
      <TopNavLink to="/players">Players</TopNavLink>
    </TopNav>
  );

  if (profileQuery.isLoading) {
    return (
      <PageShell topNav={topNav}>
        <PageMain width="6xl" padding="spacious" fillHeight>
          <LoadingState fill label="Loading profile…" />
        </PageMain>
      </PageShell>
    );
  }

  if (profileQuery.isError || !profileQuery.data) {
    const notFound = profileQuery.error instanceof ApiError && profileQuery.error.status === 404;
    return (
      <PageShell topNav={topNav}>
        <PageMain width="6xl" padding="spacious">
          <EmptyState
            tone="rose"
            title={notFound ? "Player not found" : "Couldn't load this profile"}
            description={
              notFound
                ? "This player doesn't exist or has been removed."
                : "Something went wrong fetching the profile. Try again."
            }
            action={
              <Button variant="secondary" onClick={() => profileQuery.refetch()}>
                Retry
              </Button>
            }
          />
        </PageMain>
      </PageShell>
    );
  }

  const profile = profileQuery.data;
  const firstName = profile.user.name.split(" ")[0] || "This player";

  const allMatches = showAllMatches
    ? (matchesQuery.data?.pages.flatMap((p) => p.matches) ?? profile.recentMatches)
    : profile.recentMatches;

  const matchFooter: ReactNode = showAllMatches ? (
    matchesQuery.hasNextPage ? (
      <Button
        variant="secondary"
        size="sm"
        block
        loading={matchesQuery.isFetchingNextPage}
        onClick={() => matchesQuery.fetchNextPage()}
      >
        Load more
      </Button>
    ) : null
  ) : profile.recentMatches.length >= 10 ? (
    <Button variant="ghost" size="sm" block onClick={() => setShowAllMatches(true)}>
      View all matches
    </Button>
  ) : null;

  return (
    <PageShell topNav={topNav}>
      <PageMain width="6xl" padding="spacious">
        <div className="flex flex-col gap-6">
          <ProfileHeader
            user={profile.user}
            profile={profile.profile}
            stats={profile.stats}
            isSelf={isSelf}
            canChangeAvatar={canManageAvatar}
            onEdit={() => setEditing(true)}
            onChangeAvatar={() => setChangingAvatar(true)}
          />

          <NextNightCard nextNight={profile.nextNight} firstName={firstName} isSelf={isSelf} />

          <div className="grid gap-6 lg:grid-cols-3">
            {/* Main column */}
            <div className="flex flex-col gap-6 lg:col-span-2">
              <Section title="Match history" icon={<BookIcon className="h-4 w-4" />}>
                <ProfileMatchList
                  matches={allMatches}
                  userId={profile.user.id}
                  firstName={firstName}
                  footer={matchFooter}
                />
              </Section>
            </div>

            {/* Side rail */}
            <div className="flex flex-col gap-6 lg:col-span-1">
              <Section title="Skill profile" icon={<SparkleIcon className="h-3.5 w-3.5" />}>
                <HexSkillChart skill={profile.skill} accentHex={profile.profile.accentHex} />
              </Section>

              <Section
                title="Favorites"
                icon={<StarIcon className="h-3.5 w-3.5" />}
                count={profile.profile.favorites.length}
              >
                <GameSlugGrid
                  slugs={profile.profile.favorites}
                  emptyIcon={<StarIcon className="h-4 w-4" />}
                  emptyTitle="No favorites yet"
                  emptyDescription={isSelf ? "Pick your go-to games in Edit profile." : undefined}
                />
              </Section>

              <Section
                title="Wishlist"
                icon={<HeartIcon className="h-3.5 w-3.5" />}
                count={profile.profile.wishlist.length}
              >
                <GameSlugGrid
                  slugs={profile.profile.wishlist}
                  emptyIcon={<HeartIcon className="h-4 w-4" />}
                  emptyTitle="Wishlist is empty"
                  emptyDescription={isSelf ? "Add games you'd love to play." : undefined}
                />
              </Section>
            </div>
          </div>

          {/* Full width: by the time the eye reaches this, the side rail
              (skill / favorites / wishlist) has ended, so it gets the whole row. */}
          <Section title="Performance by game" icon={<UsersIcon className="h-3.5 w-3.5" />}>
            <ProfileStatsPanel stats={profile.stats} />
          </Section>

          {SHOW_ACHIEVEMENTS && (
            <Section title="Achievements" icon={<TrophyIcon className="h-4 w-4" />}>
              <ProfileBadges stats={profile.stats} firstName={firstName} />
            </Section>
          )}

          <Section
            title="Games library"
            icon={<GalleryIcon className="h-4 w-4" />}
            count={profile.library.length}
          >
            <GameSlugGrid
              slugs={profile.library}
              emptyIcon={<GalleryIcon className="h-4 w-4" />}
              emptyTitle="No games in the library"
              emptyDescription={`${firstName}'s owned games will appear here.`}
            />
          </Section>
        </div>
      </PageMain>

      {editing && isSelf && (
        <EditProfileModal
          userId={profile.user.id}
          initial={profile.profile}
          onClose={() => setEditing(false)}
        />
      )}

      {changingAvatar && canManageAvatar && (
        <GenerateAvatarModal
          userId={profile.user.id}
          targetName={isSelf ? undefined : profile.user.name}
          onClose={() => setChangingAvatar(false)}
        />
      )}
    </PageShell>
  );
}

function Section({
  title,
  icon,
  count,
  children,
}: {
  title: string;
  icon?: ReactNode;
  count?: number;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.14em] text-fg-secondary">
        {icon}
        {title}
        {count !== undefined && <span className="font-medium text-fg-muted">({count})</span>}
      </h2>
      {children}
    </section>
  );
}
