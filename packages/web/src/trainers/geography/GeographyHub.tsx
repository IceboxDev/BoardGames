import type { GeoOverview } from "@boardgames/core/protocol";
import { placeDone } from "@boardgames/core/trainers/geography/ladder";
import { buildGeoSession, openGroups } from "@boardgames/core/trainers/geography/session";
import type { SrsState } from "@boardgames/core/trainers/srs";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FlameIcon, GearIcon } from "../../components/icons";
import {
  Button,
  IconButton,
  LoadingState,
  PageHeader,
  PageMain,
  QueryBoundary,
  StatTile,
  Surface,
} from "../../components/ui";
import { StudyHeatmap } from "../../games/quiztopia/components/trainer/StudyHeatmap";
import { weekdayName } from "../../games/quiztopia/keys";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import useDocumentTitle from "../../hooks/useDocumentTitle";
import { qk } from "../../lib/query-keys";
import { historyQuery } from "./api";
import { geoPaths, useCatalog, useGeoOverview, useToday, useWorld } from "./data";
import { Globe } from "./globe/Globe";
import { LevelTrack } from "./LevelTrack";
import { masteryFills, masteryMarkers } from "./mastery";
import { GeoSettingsDrawer } from "./SettingsDrawer";
import { StudyPicker } from "./StudyPicker";

// The trainer's front door: "your world" — a slowly turning globe that
// fills in as places become known — today's numbers, the study button, the
// level track per continent and the study-day heatmap.

const HISTORY_DAYS = 90;

export function GeographyHub() {
  useDocumentTitle("World Geography · Trainer");
  const today = useToday();
  const overview = useGeoOverview(today);
  return (
    <PageMain width="6xl" className="flex flex-col gap-6 pb-12">
      <QueryBoundary query={overview} loadingLabel="Spinning up the globe…">
        {(data) => <HubBody overview={data} today={today} />}
      </QueryBoundary>
    </PageMain>
  );
}

function HubBody({ overview, today }: { overview: GeoOverview; today: string }) {
  const navigate = useNavigate();
  const catalog = useCatalog();
  const world = useWorld();
  const { user } = useCurrentUser();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const history = useQuery({
    queryKey: qk.geographyHistory(HISTORY_DAYS, today),
    queryFn: historyQuery(today, HISTORY_DAYS),
    staleTime: 60_000,
  });

  const states = useMemo(
    () => new Map(overview.states.map((s) => [s.questionId, s as SrsState])),
    [overview.states],
  );
  const items = useMemo(
    () =>
      buildGeoSession({
        catalog,
        states: overview.states,
        settings: overview.settings,
        today,
        seedKey: user?.id ?? "me",
        includeLeeches: overview.settings.includeLeeches,
      }),
    [catalog, overview, today, user?.id],
  );
  const newToday = items.filter((i) => i.tier === "new").length;
  const climbing = items.filter((i) => i.tier === "stage").length;
  const due = items.filter((i) => i.tier === "review").length;
  const scene = useMemo(
    () => ({ fills: masteryFills(catalog, states), markers: masteryMarkers(catalog, states) }),
    [catalog, states],
  );
  const knownCountries = catalog.countries.filter((c) => placeDone(states, c.id)).length;
  const groups = useMemo(
    () => openGroups(catalog, states, overview.settings),
    [catalog, states, overview.settings],
  );
  const [picking, setPicking] = useState(false);
  const cta = [
    climbing > 0 ? `${climbing} to continue` : null,
    due > 0 ? `${due} to review` : null,
    groups.length > 0 ? `${groups.length} group${groups.length === 1 ? "" : "s"} open` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <PageHeader
        size="lg"
        eyebrow="Trainer"
        title="World Geography"
        subtitle={`${weekdayName(today)} · ${due} due · ${newToday} new`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {climbing + due + groups.length > 0 ? (
              <Button
                variant="primary"
                size="sm"
                className="whitespace-nowrap"
                onClick={() => setPicking(true)}
              >
                Study: {cta}
              </Button>
            ) : null}
            <Button
              variant="secondary"
              size="sm"
              className="whitespace-nowrap"
              onClick={() => navigate(geoPaths.explore)}
            >
              Explore the globe
            </Button>
            <IconButton
              variant="bordered"
              size="sm"
              aria-label="Trainer settings"
              onClick={() => setSettingsOpen(true)}
              icon={<GearIcon className="h-4 w-4" />}
            />
          </div>
        }
      />

      <section aria-label="Your world" className="flex flex-col gap-4">
        <Surface
          variant="raised"
          padding="none"
          className="relative h-[clamp(22rem,68vh,48rem)] w-full overflow-hidden"
        >
          {world.data ? (
            <Globe
              world={world.data}
              scene={scene}
              spin
              initial={{ at: [15, 25], zoom: 1 }}
              aria-label={`Your world: ${knownCountries} of ${catalog.countries.length} countries known — drag to turn, scroll to zoom`}
            />
          ) : (
            <LoadingState label="Loading the globe…" />
          )}
        </Surface>
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile
              variant="raised"
              size="2xl"
              label="Streak"
              icon={<FlameIcon className="h-3 w-3" />}
              tone={overview.streak.current > 0 ? "amber" : "neutral"}
              value={overview.streak.current}
              sub={
                overview.streak.studiedToday
                  ? `studied today · best ${overview.streak.longest}`
                  : overview.streak.current > 0
                    ? "study today to keep it"
                    : "start one today"
              }
            />
            <StatTile
              variant="raised"
              size="2xl"
              label="Due today"
              tone={due === 0 && overview.states.length > 0 ? "emerald" : "neutral"}
              value={due}
              sub={due === 0 ? "nothing waiting" : "reviews waiting"}
            />
            <StatTile
              variant="raised"
              size="2xl"
              label="New today"
              value={newToday}
              sub={newToday > 0 ? "a whole group at once" : "next group opens as places clear"}
            />
            <StatTile
              variant="raised"
              size="2xl"
              label="Retention"
              value={
                overview.retention30 === null ? "—" : `${Math.round(overview.retention30 * 100)}%`
              }
              sub={overview.retention30 === null ? "after your first reviews" : "last 30 days"}
            />
          </div>
          {climbing + due + groups.length === 0 && (
            <p className="text-xs text-fg-muted">
              All done for today — everything open is learned. New places unlock as the ones you're
              learning settle.
            </p>
          )}
          <p className="text-2xs text-fg-muted">
            {knownCountries} of {catalog.countries.length} countries known · the globe fills in as
            you learn.
          </p>
        </div>
      </section>

      <LevelTrack
        catalog={catalog}
        states={states}
        onDrill={(code) => navigate(geoPaths.drill(code))}
      />

      <section aria-label="Study days">
        <StudyHeatmap days={history.data?.days ?? []} today={today} />
      </section>

      {picking && (
        <StudyPicker
          catalog={catalog}
          groups={groups}
          continuing={climbing + due}
          lang={overview.settings.language}
          onPick={(g) => navigate(geoPaths.studyGroup(g))}
          onClose={() => setPicking(false)}
        />
      )}

      {settingsOpen && (
        <GeoSettingsDrawer settings={overview.settings} onClose={() => setSettingsOpen(false)} />
      )}
    </>
  );
}
