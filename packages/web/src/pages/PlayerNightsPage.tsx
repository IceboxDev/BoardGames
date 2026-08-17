import { useQuery } from "@tanstack/react-query";
import type { CSSProperties } from "react";
import { useParams } from "react-router-dom";
import { ClockIcon, HostIcon, PinIcon, UsersIcon } from "../components/icons";
import { HostBreakdown } from "../components/profile/nights/HostBreakdown.tsx";
import { MonthlyAttendanceChart } from "../components/profile/nights/MonthlyAttendanceChart.tsx";
import { NightLog } from "../components/profile/nights/NightLog.tsx";
import { NightsHero } from "../components/profile/nights/NightsHero.tsx";
import { RsvpBehaviorPanel } from "../components/profile/nights/RsvpBehaviorPanel.tsx";
import { WeekdayBreakdown } from "../components/profile/nights/WeekdayBreakdown.tsx";
import { TopNav, TopNavBackButton } from "../components/TopNav";
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
import { formatDayKey } from "../lib/date-format.ts";
import { fetchProfile, fetchProfileNights } from "../lib/profile.ts";
import { qk } from "../lib/query-keys.ts";

// "Nights attended" profile sub-page: attendance statistics over every past
// locked game night. Uses the RETROSPECTIVE attendance rule (footnoted below
// the header) — never the calendar's forward definite/tentative headcount.

export default function PlayerNightsPage() {
  const { userId } = useParams<{ userId: string }>();

  const profileQuery = useQuery({
    queryKey: qk.profile(userId),
    queryFn: ({ signal }) => fetchProfile(userId as string, signal),
    enabled: !!userId,
  });
  const nightsQuery = useQuery({
    queryKey: qk.profileNights(userId as string),
    queryFn: ({ signal }) => fetchProfileNights(userId as string, signal),
    enabled: !!userId,
  });

  const topNav = <TopNav back={<TopNavBackButton to={`/u/${userId}`} />}></TopNav>;

  return (
    <PageShell topNav={topNav}>
      <QueryBoundary
        query={nightsQuery}
        loading={
          <PageMain width="6xl" padding="spacious" fillHeight>
            <LoadingState fillHeight label="Loading game nights…" />
          </PageMain>
        }
        errorFallback={(error) => {
          const notFound = error instanceof ApiError && error.status === 404;
          return (
            <PageMain width="6xl" padding="spacious">
              <EmptyState
                tone="rose"
                title={notFound ? "Player not found" : "Couldn't load the nights"}
                description={
                  notFound
                    ? "This player doesn't exist or has been removed."
                    : "Something went wrong fetching attendance. Try again."
                }
                action={
                  <Button variant="secondary" onClick={() => nightsQuery.refetch()}>
                    Retry
                  </Button>
                }
              />
            </PageMain>
          );
        }}
      >
        {(nights) => renderBody(nights)}
      </QueryBoundary>
    </PageShell>
  );

  // Plain render helper (NOT a component — a nested component definition would
  // get a fresh identity every render and remount its whole subtree).
  function renderBody(nights: NonNullable<typeof nightsQuery.data>) {
    const profile = profileQuery.data;
    const firstName = profile?.user.name.split(" ")[0] ?? "This player";
    const accent = profile?.profile.accentHex ?? DEFAULT_ACCENT;
    const style = { "--accent": accent } as CSSProperties;
    const items = nights.items;
    const attended = items.filter((n) => n.attended);
    const firstAttended = attended[attended.length - 1];

    return (
      <PageMain width="6xl" padding="spacious">
        <Stack gap="lg" style={style}>
          <PageHeader
            size="lg"
            eyebrow="Game nights"
            title={`${firstName}'s attendance`}
            subtitle={
              items.length > 0
                ? `${attended.length} of ${items.length} nights${
                    firstAttended
                      ? ` · first night ${formatDayKey(firstAttended.dateKey, "compact")}`
                      : ""
                  }`
                : "No game nights held yet"
            }
          />

          {items.length === 0 ? (
            <EmptyState
              icon={<ClockIcon className="h-4 w-4" />}
              title="No past game nights"
              description="Attendance stats appear once locked nights are behind us."
            />
          ) : (
            <>
              <NightsHero items={items} userId={userId as string} />

              <MonthlyAttendanceChart items={items} />

              {/* min-w-0: keep the mobile grid track from sizing to nowrap
                  content (truncated rows) and overflowing the viewport. */}
              <div className="grid gap-6 lg:grid-cols-3">
                <Stack gap="lg" className="min-w-0 lg:col-span-2">
                  <Section title="Where we play" icon={<PinIcon className="h-3.5 w-3.5" />}>
                    <HostBreakdown items={items} />
                  </Section>
                  <Section
                    title="Night log"
                    icon={<ClockIcon className="h-3.5 w-3.5" />}
                    count={items.length}
                  >
                    <NightLog items={items} userId={userId as string} />
                  </Section>
                </Stack>
                <Stack gap="lg" className="min-w-0 lg:col-span-1">
                  <Section title="Weekdays" icon={<HostIcon className="h-3.5 w-3.5" />}>
                    <WeekdayBreakdown items={items} />
                  </Section>
                  <Section title="RSVP behavior" icon={<UsersIcon className="h-3.5 w-3.5" />}>
                    <RsvpBehaviorPanel items={items} />
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
