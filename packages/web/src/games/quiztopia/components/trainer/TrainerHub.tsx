import { daysBetween } from "@boardgames/core/games/quiztopia/srs";
import { formatSpan } from "@boardgames/core/games/quiztopia/timeline";
import type { TrainerOverview } from "@boardgames/core/protocol";
import { useQuery } from "@tanstack/react-query";
import { useReducedMotion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BookIcon, ClockIcon, FlameIcon, GearIcon, PinIcon } from "../../../../components/icons";
import {
  Badge,
  Button,
  IconButton,
  PageHeader,
  PageMain,
  QueryBoundary,
  StatTile,
  Surface,
} from "../../../../components/ui";
import useDocumentTitle from "../../../../hooks/useDocumentTitle";
import { qk } from "../../../../lib/query-keys";
import { historyQuery, overviewQuery, recentMissesQuery, todayKey } from "../../api";
import { DISTRICTS, districtByN } from "../../bands";
import { CARD_IDS } from "../../content";
import { usePins } from "../../hooks/usePinnedTimeline";
import { useQuiztopiaSettings } from "../../hooks/useQuiztopiaSettings";
import { weekdayName } from "../../keys";
import { useTrainerPaths } from "../../paths";
import { Skyline } from "../common/Skyline";
import { CategoryTile } from "./CategoryTile";
import { ProgressPanel } from "./ProgressPanel";
import { RecentMisses } from "./RecentMisses";
import { SessionHero } from "./SessionHero";
import { SettingsDrawer } from "./SettingsDrawer";
import { StudyHeatmap } from "./StudyHeatmap";
import { studyAllPlan } from "./session-plan";
import { TrainerScreen } from "./TrainerScreen";

// The trainer's front door, top to bottom: the city (lit where nothing is
// due); today's session as the centrepiece (what it deals, which districts
// it draws from, the start button); today's numbers; how it's going (study
// days beside the progress chart and the city's totals); the twelve
// districts as tiles; the timeline teaser and the table's recent misses.
// Everything hangs off one overview request — history and misses load
// beside it, never before.

const HISTORY_DAYS = 90;
const STAGGER_MS = 40;

/**
 * Lights come on one at a time: a building that is newly lit waits its turn
 * (40 ms apart), one that goes dark does so at once. Reduced motion skips
 * the stagger.
 */
function useStaggeredLit(target: readonly boolean[]): boolean[] {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState<boolean[]>(() => target.map(() => false));
  const shownRef = useRef(shown);
  shownRef.current = shown;
  const key = target.join(",");
  useEffect(() => {
    const next = key.split(",").map((t) => t === "true");
    if (reduced) {
      setShown(next);
      return;
    }
    const turningOn = next
      .map((on, i) => (on && !shownRef.current[i] ? i : -1))
      .filter((i) => i >= 0);
    setShown((prev) => prev.map((on, i) => on && next[i]));
    const timers = turningOn.map((idx, k) =>
      window.setTimeout(
        () => {
          setShown((prev) => {
            const copy = [...prev];
            copy[idx] = true;
            return copy;
          });
        },
        STAGGER_MS * (k + 1),
      ),
    );
    return () => {
      for (const t of timers) window.clearTimeout(t);
    };
  }, [key, reduced]);
  return shown;
}

function sum(values: readonly number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

function overallRetention(categories: TrainerOverview["categories"]): number | null {
  let num = 0;
  let den = 0;
  for (const c of categories) {
    if (c.retention30 === null || c.reviews30 === 0) continue;
    num += c.retention30 * c.reviews30;
    den += c.reviews30;
  }
  return den > 0 ? num / den : null;
}

export default function TrainerHub() {
  useDocumentTitle("Quiztopia · Trainer");
  const today = useMemo(() => todayKey(), []);
  const overview = useQuery({
    queryKey: qk.quiztopiaOverview(today),
    queryFn: overviewQuery(today),
    staleTime: 30_000,
  });
  return (
    <TrainerScreen>
      <PageMain width="6xl" className="flex flex-col gap-6 pb-12">
        <QueryBoundary query={overview} loadingLabel="Counting what's due…">
          {(data) => <HubBody overview={data} today={today} />}
        </QueryBoundary>
      </PageMain>
    </TrainerScreen>
  );
}

function HubBody({ overview, today }: { overview: TrainerOverview; today: string }) {
  const navigate = useNavigate();
  const paths = useTrainerPaths();
  const { settings, loaded: settingsLoaded, save } = useQuiztopiaSettings();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const history = useQuery({
    queryKey: qk.quiztopiaHistory(HISTORY_DAYS, today),
    queryFn: historyQuery(today, HISTORY_DAYS),
    staleTime: 60_000,
  });
  const misses = useQuery({
    queryKey: qk.quiztopiaRecentMisses(),
    queryFn: recentMissesQuery(),
    staleTime: 60_000,
  });

  const cats = overview.categories;
  const due = sum(cats.map((c) => c.due));
  const learningDue = sum(cats.map((c) => c.learningDue));
  const newToday = sum(cats.map((c) => c.newRemainingToday));
  // The district toggles save optimistically: plan from the live exclusion
  // list, so the session card answers a tap at once (the per-district
  // counts don't depend on it).
  const all = studyAllPlan(cats, {
    ...overview.settings,
    excludeFromAll: settingsLoaded ? settings.excludeFromAll : overview.settings.excludeFromAll,
  });
  // A district is lit only once you have studied it AND nothing is due there.
  // An untouched district stays dark — an empty schedule is not a clear one.
  const litTarget = useMemo(() => cats.map((c) => c.seen > 0 && c.due === 0), [cats]);
  const lit = useStaggeredLit(litTarget);
  const litCount = litTarget.filter(Boolean).length;
  const explored = cats.filter((c) => c.seen > 0).length;
  const retention = overallRetention(cats);
  const allLit = explored === cats.length && due === 0;
  const days = history.data?.days ?? [];
  const reviewsThisWeek = sum(
    days.filter((d) => daysBetween(d.date, today) < 7).map((d) => d.reviews),
  );

  const toggleDistrict = (n: number) =>
    save((current) => ({
      excludeFromAll: current.excludeFromAll.includes(n)
        ? current.excludeFromAll.filter((x) => x !== n)
        : [...current.excludeFromAll, n].sort((a, b) => a - b),
    }));

  const subtitle = `${weekdayName(today)} · ${due} due`;

  return (
    <>
      <PageHeader
        size="lg"
        eyebrow="Trainer"
        title="Quiztopia"
        subtitle={subtitle}
        inlineActions
        actions={
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => navigate(paths.timeline())}
              title="Your timeline: every studied question's moment in history"
              aria-label="Timeline"
            >
              <PinIcon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Timeline</span>
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => navigate(paths.journal)}
              title="Your journal: every question you studied and article you read, day by day"
              aria-label="Journal"
            >
              <ClockIcon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Journal</span>
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => navigate(paths.wiki)}
              title="The archive: every article, answers highlighted"
              aria-label="Wiki"
            >
              <BookIcon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Wiki</span>
            </Button>
            <IconButton
              variant="bordered"
              size="sm"
              aria-label="Trainer settings"
              onClick={() => setSettingsOpen(true)}
              icon={<GearIcon className="h-4 w-4" />}
            />
          </>
        }
      />

      <section aria-label="The city" className="flex flex-col gap-2">
        <Skyline mode="trainer" lit={lit} className="h-40 w-full sm:h-52" />
        <p className="text-center text-2xs text-fg-muted">
          {explored === 0
            ? "The city is dark — start learning to light it up."
            : allLit
              ? "Every district is lit — nothing due tonight."
              : `${litCount} of 12 districts lit · ${due} due${
                  explored < cats.length ? ` · ${cats.length - explored} unexplored` : ""
                }`}
        </p>
      </section>

      <section aria-label="Today's session">
        <SessionHero
          plan={all}
          todayCounts={overview.todayCounts}
          canEditDistricts={settingsLoaded}
          onStart={() => navigate(paths.study())}
          onQuick={() => navigate(paths.study({ limit: 10 }))}
          onToggleDistrict={toggleDistrict}
          onReadArchive={() => navigate(paths.wiki)}
        />
      </section>

      <section aria-label="Today" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
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
          tone={allLit ? "emerald" : "neutral"}
          value={allLit ? "All lit" : due}
          sub={
            due === 0
              ? explored === 0
                ? "nothing scheduled yet"
                : "nothing waiting"
              : `${learningDue} still learning`
          }
        />
        <StatTile
          variant="raised"
          size="2xl"
          label={all.bySet ? "New articles" : "New cards"}
          value={all.newUnits}
          sub={
            newToday === 0
              ? "done for today"
              : `next session · ${overview.todayCounts.newIntroduced} learned today`
          }
        />
        <StatTile
          variant="raised"
          size="2xl"
          label="Retention"
          value={retention === null ? "—" : `${Math.round(retention * 100)}%`}
          sub={retention === null ? "after your first reviews" : "last 30 days"}
        />
      </section>

      {/* The heatmap keeps its natural width; the chart takes the rest. */}
      <section
        aria-label="Progress"
        className="grid gap-4 lg:grid-cols-[auto_minmax(0,1fr)] [&>*]:min-w-0"
      >
        <StudyHeatmap
          days={days}
          today={today}
          className="h-full"
          footer={
            <dl className="flex gap-5 text-2xs text-fg-muted">
              <div>
                <dt>Best streak</dt>
                <dd className="text-base font-semibold tabular-nums text-fg-strong">
                  {overview.streak.longest}
                </dd>
              </div>
              <div>
                <dt>Last 7 days</dt>
                <dd className="text-base font-semibold tabular-nums text-fg-strong">
                  {reviewsThisWeek} <span className="text-2xs font-normal">reviews</span>
                </dd>
              </div>
            </dl>
          }
        />
        <ProgressPanel days={days} categories={cats} />
      </section>

      <section aria-label="Districts" className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-fg-strong">The city</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {cats.map((c) => {
            const d = districtByN(c.n);
            const isLit = c.seen > 0 && c.due === 0;
            return (
              <CategoryTile
                key={d.slug}
                district={d}
                to={paths.study({ category: d.slug })}
                lit={isLit}
                progress={{ seen: c.seen, learned: c.known, total: c.total }}
                cta={isLit && c.newRemainingToday === 0 ? "Review anyway" : "Study"}
                corner={{ to: paths.wikiCategory(d.slug), label: "Wiki →" }}
              >
                <div className="flex flex-col gap-1.5">
                  <div className="flex flex-wrap items-center gap-1">
                    <Badge tone={isLit ? "emerald" : c.seen === 0 ? "neutral" : d.tone} size="xs">
                      {c.seen === 0 ? "unexplored" : isLit ? "0 due" : `${c.due} due`}
                    </Badge>
                    {c.newRemainingToday > 0 && (
                      <Badge tone="neutral" size="xs">
                        {all.bySet
                          ? `${Math.ceil(c.newRemainingToday / 5)} new article${Math.ceil(c.newRemainingToday / 5) === 1 ? "" : "s"}`
                          : `${c.newRemainingToday} new`}
                      </Badge>
                    )}
                    {c.leeches > 0 && (
                      <Badge tone="rose" size="xs" title="Missed eight times or more">
                        {c.leeches} leech{c.leeches === 1 ? "" : "es"}
                      </Badge>
                    )}
                  </div>
                  <p className="text-2xs tabular-nums text-fg-muted">
                    {c.seen === 0
                      ? `${c.total} questions to explore`
                      : `${c.known} learned · ${c.seen} seen of ${c.total}`}
                  </p>
                </div>
              </CategoryTile>
            );
          })}
        </div>
      </section>

      <TimelineTeaser onOpen={() => navigate(paths.timeline())} />

      <RecentMisses misses={misses.data?.misses ?? []} language={settings.language} paths={paths} />

      <p className="text-center text-3xs text-fg-disabled">
        {CARD_IDS.length} cards · {DISTRICTS.length} districts · content {overview.contentVersion}
      </p>

      {settingsOpen && <SettingsDrawer onClose={() => setSettingsOpen(false)} />}
    </>
  );
}

/**
 * One line on the hub: how much history the member has pinned so far. Read
 * from the pins' server-side summary — the 2 MB event index loads only on
 * the timeline screen itself.
 */
function TimelineTeaser({ onOpen }: { onOpen: () => void }) {
  const pins = usePins();
  if (!pins.data) return null;
  const total = pins.data.pins.length;
  const summary = pins.data.summary;
  const studied = `${total} ${total === 1 ? "question" : "questions"} studied`;
  const line =
    total === 0
      ? "Your timeline is empty — every question you study pins its moment in history."
      : !summary
        ? studied
        : summary.dated === 0
          ? `${studied} — their dates arrive with the next content update.`
          : `${summary.dated} ${summary.dated === 1 ? "moment" : "moments"} pinned across ${formatSpan(summary.spanYears, "en")}`;
  return (
    <Surface variant="tile" padding="none">
      <Button
        variant="plain"
        bleed
        align="start"
        onClick={onOpen}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-fill-soft"
      >
        <PinIcon className="h-4 w-4 shrink-0 text-accent-300" />
        <span className="min-w-0 flex-1 text-sm text-fg-primary">{line}</span>
        <span className="shrink-0 text-xs font-medium text-accent-300">Your timeline →</span>
      </Button>
    </Surface>
  );
}
