import type { PlayerSkillResponse } from "@boardgames/core/protocol";
import { useQuery } from "@tanstack/react-query";
import type { CSSProperties } from "react";
import { useParams } from "react-router-dom";
import { UsersIcon } from "../components/icons";
import { ProfileStatsPanel } from "../components/profile/ProfileStatsPanel.tsx";
import {
  HonestNumbers,
  SkillPageContent,
  SkillProgressCard,
} from "../components/profile/skill/SkillPageContent.tsx";
import { TopNav, TopNavBackButton, TopNavLink } from "../components/TopNav";
import { Button } from "../components/ui/Button.tsx";
import { EmptyState } from "../components/ui/EmptyState.tsx";
import { LoadingState } from "../components/ui/LoadingState.tsx";
import { PageHeader } from "../components/ui/PageHeader.tsx";
import { PageMain, PageShell } from "../components/ui/PageShell.tsx";
import { QueryBoundary } from "../components/ui/QueryBoundary.tsx";
import { Section } from "../components/ui/Section.tsx";
import { Stack } from "../components/ui/Stack.tsx";
import { DEFAULT_ACCENT } from "../lib/accent.ts";
import { ApiError } from "../lib/api-fetch.ts";
import { fetchProfile, fetchProfileMatchSummary } from "../lib/profile.ts";
import { qk } from "../lib/query-keys.ts";
import { fetchPlayerSkill, fetchSkillLeaderboards } from "../lib/skills.ts";

// "Win rate" profile sub-page: skill profile, hall of fame and the full,
// unvarnished record. Positivity-first (hero highlights lead), but every
// number below is the mathematically exact server-derived value — nothing on
// this page is invented client-side. Layout lives in SkillPageContent so the
// dev preview renders the identical body.

export default function PlayerSkillPage() {
  const { userId } = useParams<{ userId: string }>();

  // Identity/accent — already warm when arriving from the profile page.
  const profileQuery = useQuery({
    queryKey: qk.profile(userId),
    queryFn: ({ signal }) => fetchProfile(userId as string, signal),
    enabled: !!userId,
  });
  const skillQuery = useQuery({
    queryKey: qk.skillPlayer(userId as string),
    queryFn: ({ signal }) => fetchPlayerSkill(userId as string, signal),
    enabled: !!userId,
  });
  const boardsQuery = useQuery({
    queryKey: qk.skillLeaderboards(),
    queryFn: ({ signal }) => fetchSkillLeaderboards(signal),
  });
  // The honest tail reuses the same pre-derived payload as the matches page.
  const summaryQuery = useQuery({
    queryKey: qk.profileMatchSummary(userId as string),
    queryFn: ({ signal }) => fetchProfileMatchSummary(userId as string, signal),
    enabled: !!userId,
  });

  const topNav = (
    <TopNav back={<TopNavBackButton to={`/u/${userId}`} label="Profile" />}>
      <TopNavLink to={`/u/${userId}/matches`}>Matches</TopNavLink>
      <TopNavLink to={`/u/${userId}/nights`}>Nights</TopNavLink>
    </TopNav>
  );

  return (
    <PageShell topNav={topNav}>
      <QueryBoundary
        query={skillQuery}
        loading={
          <PageMain width="6xl" padding="spacious" fillHeight>
            <LoadingState fillHeight label="Computing the hall of fame…" />
          </PageMain>
        }
        errorFallback={(error) => {
          const notFound = error instanceof ApiError && error.status === 404;
          return (
            <PageMain width="6xl" padding="spacious">
              <EmptyState
                tone="rose"
                title={notFound ? "Player not found" : "Couldn't load the stats"}
                description={
                  notFound
                    ? "This player doesn't exist or has been removed."
                    : "Something went wrong fetching the skill data. Try again."
                }
                action={
                  <Button variant="secondary" onClick={() => skillQuery.refetch()}>
                    Retry
                  </Button>
                }
              />
            </PageMain>
          );
        }}
      >
        {(skill) => renderBody(skill)}
      </QueryBoundary>
    </PageShell>
  );

  // Plain render helper (NOT a component — a nested component definition would
  // get a fresh identity every render and remount its whole subtree).
  function renderBody(skill: PlayerSkillResponse) {
    const profile = profileQuery.data;
    const firstName = profile?.user.name.split(" ")[0] ?? "This player";
    const accent = profile?.profile.accentHex ?? DEFAULT_ACCENT;
    const style = { "--accent": accent } as CSSProperties;
    const { eligibility } = skill;

    return (
      <PageMain width="6xl" padding="spacious">
        <Stack gap="lg" style={style}>
          <PageHeader
            size="lg"
            eyebrow="Hall of fame"
            title={`${firstName}'s stats`}
            subtitle={
              eligibility.eligible
                ? `Ranked · ${eligibility.ratedMatches} rated games across ${eligibility.distinctGames} titles`
                : "Not ranked yet — the skill profile unlocks with more recorded games"
            }
          />

          {eligibility.eligible ? (
            <SkillPageContent
              skill={skill}
              boards={boardsQuery.data}
              summaryItems={summaryQuery.data?.items}
              accentHex={accent}
            />
          ) : (
            <>
              <SkillProgressCard eligibility={eligibility} />
              <div className="max-w-xl">
                <HonestNumbers items={summaryQuery.data?.items} />
              </div>
            </>
          )}

          {/* Migrated from the profile page: the full per-game performance
              table lives with the rest of the stats now. */}
          {profile && (
            <Section title="Performance by game" icon={<UsersIcon className="h-3.5 w-3.5" />}>
              <ProfileStatsPanel stats={profile.stats} />
            </Section>
          )}
        </Stack>
      </PageMain>
    );
  }
}
