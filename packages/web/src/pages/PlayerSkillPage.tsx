import type { PlayerSkillResponse } from "@boardgames/core/protocol";
import { useQuery } from "@tanstack/react-query";
import type { CSSProperties } from "react";
import { useParams } from "react-router-dom";
import { UsersIcon } from "../components/icons";
import { HexSkillChart } from "../components/profile/HexSkillChart.tsx";
import { PlayerPageFrame } from "../components/profile/PlayerPageFrame.tsx";
import { ProfileStatsPanel } from "../components/profile/ProfileStatsPanel.tsx";
import {
  HonestNumbers,
  SkillPageContent,
  SkillProgressCard,
} from "../components/profile/skill/SkillPageContent.tsx";
import { PageHeader } from "../components/ui/PageHeader.tsx";
import { PageMain } from "../components/ui/PageShell.tsx";
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

  return (
    <PlayerPageFrame
      query={skillQuery}
      back={`/u/${userId}`}
      loadingLabel="Computing the hall of fame…"
      errorTitle="Couldn't load the stats"
      errorDescription="Something went wrong fetching the skill data. Try again."
      resolveError={(error) =>
        // A REAL missing player carries the route's NOT_FOUND envelope (the
        // frame's default). A bare 404 (no code) means the /api/skills routes
        // themselves don't exist — a mid-deploy web/server version skew.
        error instanceof ApiError && error.status === 404 && error.code === undefined
          ? {
              title: "Stats are still rolling out",
              description:
                "The server is still updating to the newest version — give it a minute and retry.",
            }
          : null
      }
    >
      {(skill) => renderBody(skill)}
    </PlayerPageFrame>
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
                ? // "Rated" < "played": moderated nights, unresolved campaigns
                  // and a game's ONLY scored co-op session count as plays but
                  // carry no competitive evidence, so they don't rate. (Scored
                  // co-ops with ≥2 comparable sessions DO rate — score vs
                  // score across sessions.)
                  `Ranked · ${eligibility.ratedMatches} of ${profile?.stats.gamesPlayed ?? "…"} games rated across ${eligibility.distinctGames} titles`
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
            // Un-ranked: one centered column — the ghosted chart shows what's
            // coming, the progress card shows how close it is.
            <div className="mx-auto flex w-full max-w-md flex-col gap-6">
              <div className="mx-auto w-full max-w-70">
                <HexSkillChart skill={null} accentHex={accent} />
              </div>
              <SkillProgressCard eligibility={eligibility} />
              <HonestNumbers items={summaryQuery.data?.items} />
            </div>
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
