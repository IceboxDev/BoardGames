import { useQuery } from "@tanstack/react-query";
import type { CSSProperties } from "react";
import { useState } from "react";
import { useParams } from "react-router-dom";
import { BookIcon, TrophyIcon, UsersIcon } from "../components/icons";
import { MatchFilters } from "../components/profile/insights/MatchFilters.tsx";
import { MatchHistoryHero } from "../components/profile/insights/MatchHistoryHero.tsx";
import { MatchTimeline } from "../components/profile/insights/MatchTimeline.tsx";
import { MonthlyActivityChart } from "../components/profile/insights/MonthlyActivityChart.tsx";
import { PlayedWithPanel } from "../components/profile/insights/PlayedWithPanel.tsx";
import { RecordsStrip } from "../components/profile/insights/RecordsStrip.tsx";
import {
  ALL_FILTERS,
  applyFilters,
  type SummaryFilters,
} from "../components/profile/insights/summary-stats.ts";
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
import { formatMonthYear } from "../lib/date-format.ts";
import { fetchProfile, fetchProfileMatchSummary } from "../lib/profile.ts";
import { qk } from "../lib/query-keys.ts";

// "Games played" profile sub-page: the whole personal match history, hero
// infographics + filterable timeline, driven by ONE pre-derived unpaginated
// payload (`/match-summary`) so every number on the page agrees.

export default function PlayerMatchHistoryPage() {
  const { userId } = useParams<{ userId: string }>();
  const [filters, setFilters] = useState<SummaryFilters>(ALL_FILTERS);

  // Identity/accent — already warm when arriving from the profile page.
  const profileQuery = useQuery({
    queryKey: qk.profile(userId),
    queryFn: ({ signal }) => fetchProfile(userId as string, signal),
    enabled: !!userId,
  });
  const summaryQuery = useQuery({
    queryKey: qk.profileMatchSummary(userId as string),
    queryFn: ({ signal }) => fetchProfileMatchSummary(userId as string, signal),
    enabled: !!userId,
  });

  const topNav = (
    <TopNav back={<TopNavBackButton to={`/u/${userId}`} label="Profile" />}>
      <TopNavLink to={`/u/${userId}/nights`}>Nights</TopNavLink>
    </TopNav>
  );

  return (
    <PageShell topNav={topNav}>
      <QueryBoundary
        query={summaryQuery}
        loading={
          <PageMain width="6xl" padding="spacious" fillHeight>
            <LoadingState fillHeight label="Loading match history…" />
          </PageMain>
        }
        errorFallback={(error) => {
          const notFound = error instanceof ApiError && error.status === 404;
          return (
            <PageMain width="6xl" padding="spacious">
              <EmptyState
                tone="rose"
                title={notFound ? "Player not found" : "Couldn't load the match history"}
                description={
                  notFound
                    ? "This player doesn't exist or has been removed."
                    : "Something went wrong fetching the history. Try again."
                }
                action={
                  <Button variant="secondary" onClick={() => summaryQuery.refetch()}>
                    Retry
                  </Button>
                }
              />
            </PageMain>
          );
        }}
      >
        {(summary) => renderBody(summary)}
      </QueryBoundary>
    </PageShell>
  );

  // Plain render helper (NOT a component — a nested component definition would
  // get a fresh identity every render and remount its whole subtree).
  function renderBody(summary: NonNullable<typeof summaryQuery.data>) {
    const profile = profileQuery.data;
    const firstName = profile?.user.name.split(" ")[0] ?? "This player";
    const accent = profile?.profile.accentHex ?? DEFAULT_ACCENT;
    const style = { "--accent": accent } as CSSProperties;
    const items = summary.items;
    const filtered = applyFilters(items, filters);
    const isFiltered =
      filters.result !== "all" || filters.year !== null || filters.gameSlug !== null;
    const distinct = new Set(items.map((i) => i.gameSlug).filter(Boolean)).size;
    const oldest = items[items.length - 1];

    return (
      <PageMain width="6xl" padding="spacious">
        <Stack gap="lg" style={style}>
          <PageHeader
            size="lg"
            eyebrow="Match history"
            title={`${firstName}'s matches`}
            subtitle={
              items.length > 0
                ? `${items.length} games · ${distinct} different · playing since ${formatMonthYear(
                    oldest.playedAt,
                  )}`
                : "No games recorded yet"
            }
          />

          {items.length === 0 ? (
            <EmptyState
              icon={<TrophyIcon className="h-4 w-4" />}
              title="No matches logged yet"
              description={`${firstName}'s recorded games will light this page up.`}
            />
          ) : (
            <>
              <MatchHistoryHero items={items} />

              <MatchFilters items={items} filters={filters} onChange={setFilters} />

              <MonthlyActivityChart items={filtered} />

              <div className="grid gap-6 lg:grid-cols-3">
                <Stack gap="lg" className="lg:col-span-2">
                  <Section title="Personal records" icon={<TrophyIcon className="h-3.5 w-3.5" />}>
                    <RecordsStrip items={items} />
                  </Section>
                  <Section
                    title="Timeline"
                    icon={<BookIcon className="h-4 w-4" />}
                    count={filtered.length}
                  >
                    <MatchTimeline items={filtered} filtered={isFiltered} />
                  </Section>
                </Stack>
                <Stack gap="lg" className="lg:col-span-1">
                  <Section title="Played with" icon={<UsersIcon className="h-3.5 w-3.5" />}>
                    <PlayedWithPanel items={items} players={summary.players} />
                  </Section>
                </Stack>
              </div>
            </>
          )}
        </Stack>
      </PageMain>
    );
  }
}
