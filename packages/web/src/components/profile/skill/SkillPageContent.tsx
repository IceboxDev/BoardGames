import { skillProfileBySlug } from "@boardgames/core/games/skill-profiles";
import type {
  PlayerSkillResponse,
  ProfileMatchSummaryItem,
  SkillLeaderboardsResponse,
} from "@boardgames/core/protocol";
import type { ReactNode } from "react";
import { SparkleIcon, StarIcon, TrophyIcon } from "../../icons";
import { MicroLabel } from "../../ui/Label.tsx";
import { Section } from "../../ui/Section.tsx";
import { Stack } from "../../ui/Stack.tsx";
import { Surface } from "../../ui/Surface.tsx";
import { HexSkillChart } from "../HexSkillChart.tsx";
import { gamesByPlays, meanPerformance, recordCounts, streaks } from "../insights/summary-stats.ts";
import { GameRankings } from "./GameRankings.tsx";
import { SkillHeroCards } from "./SkillHeroCards.tsx";
import { TraitBreakdown } from "./TraitBreakdown.tsx";
import { ordinal, TRAIT_COPY } from "./trait-copy.ts";

// Presentational body of the skill/stats page — everything below the
// PageHeader, pure props so the dev preview (/dev/skill-preview) can render
// the exact production layout with fixtures. Data derivations stay
// server-side; this file only formats.

/** Locked state: exact progress toward the unlock thresholds — factual, and
 *  framed as "how close" rather than "not good enough". */
export function SkillProgressCard({
  eligibility,
}: {
  eligibility: PlayerSkillResponse["eligibility"];
}) {
  const e = eligibility;
  const bars: { label: string; have: number; need: number }[] = [
    { label: "Rated games", have: e.ratedMatches, need: e.minMatches },
    { label: "Different games", have: e.distinctGames, need: e.minGames },
  ];
  const remaining = Math.max(0, e.minMatches - e.ratedMatches);
  return (
    <Surface variant="raised">
      <MicroLabel className="mb-2 flex items-center gap-1.5 font-semibold">
        <SparkleIcon className="h-4 w-4 text-accent-300" />
        Skill profile unlock
      </MicroLabel>
      <Stack gap="sm">
        {bars.map((b) => (
          <div key={b.label}>
            <div className="flex items-baseline justify-between text-xs">
              <span className="text-fg-secondary">{b.label}</span>
              <span className="tabular-nums text-fg-muted">
                {Math.min(b.have, b.need)} / {b.need}
              </span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded bg-surface-800">
              <div
                className="h-full rounded bg-[var(--accent)]/80"
                style={{ width: `${Math.min(100, (b.have / b.need) * 100)}%` }}
              />
            </div>
          </div>
        ))}
        <p className="text-2xs text-fg-muted">
          Play {remaining} more rated {remaining === 1 ? "game" : "games"} to unlock the six-trait
          profile and join the leaderboards.
        </p>
      </Stack>
    </Surface>
  );
}

/** The unvarnished numbers — wins AND losses, exact, below the fold.
 *  `rail` lays the tiles two-up for the narrow column under the hex chart. */
export function HonestNumbers({
  items,
  rail = false,
}: {
  items: readonly ProfileMatchSummaryItem[] | undefined;
  rail?: boolean;
}): ReactNode {
  if (!items || items.length === 0) return null;
  const counts = recordCounts(items);
  const streak = streaks(items);
  const perf = meanPerformance(items);
  const winRateDenom = counts.wins + counts.placed + counts.losses;
  const cells: { label: string; value: string }[] = [
    { label: "Wins", value: String(counts.wins) },
    { label: "Losses", value: String(counts.placed + counts.losses) },
    { label: "Draws", value: String(counts.draws) },
    {
      label: "Win rate",
      value: winRateDenom > 0 ? `${Math.round((counts.wins / winRateDenom) * 100)}%` : "—",
    },
    { label: "Performance", value: perf !== null ? `${Math.round(perf * 100)}%` : "—" },
    { label: "Best win streak", value: String(streak.bestWin) },
  ];
  return (
    <Section title="By the numbers" icon={<TrophyIcon className="h-3.5 w-3.5" />}>
      <div className={rail ? "grid grid-cols-3 gap-2 sm:grid-cols-2" : "grid grid-cols-3 gap-2"}>
        {cells.map((cell) => (
          <Surface key={cell.label} variant="tile" padding="none" className="p-2.5 text-center">
            <p className="text-base font-bold tabular-nums text-white">{cell.value}</p>
            <p className="text-3xs text-fg-muted">{cell.label}</p>
          </Surface>
        ))}
      </div>
      <p className="mt-2 text-3xs text-fg-muted">
        Every recorded result counts — the full story is in the match history.
      </p>
    </Section>
  );
}

/** The full ranked-player body: hero highlights + skill chart + boards. */
export function SkillPageContent({
  skill,
  boards,
  summaryItems,
  accentHex,
  previewOpen = false,
}: {
  skill: PlayerSkillResponse;
  boards: SkillLeaderboardsResponse | undefined;
  summaryItems: readonly ProfileMatchSummaryItem[] | undefined;
  accentHex: string;
  /** Dev preview only: pre-expand one trait and one game for screenshots. */
  previewOpen?: boolean;
}) {
  // Only games that actually fed the fit may claim to have "sharpened" a
  // skill — a played-but-unrated game (moderated seat, lone scored co-op)
  // trained nothing.
  const ratedSet = new Set<string>(skill.ratedSlugs);

  return (
    <>
      <SkillHeroCards skill={skill} summaryItems={summaryItems} accentHex={accentHex} />

      <div className="grid gap-6 lg:grid-cols-3">
        <Stack gap="lg" className="min-w-0 lg:col-span-2">
          <Section title="Skill profile" icon={<SparkleIcon className="h-4 w-4" />}>
            {/* Two columns from sm up: the left rail stacks chart → caption →
                the by-the-numbers tiles so it runs as tall as the six trait
                rows beside it — no dead space under the chart. On phones the
                grid stacks chart, traits, numbers (DOM order). */}
            <div className="grid gap-x-8 gap-y-6 sm:grid-cols-[minmax(0,18rem)_1fr] sm:grid-rows-[auto_1fr]">
              <div className="mx-auto flex w-full max-w-80 flex-col gap-4 sm:col-start-1">
                <HexSkillChart
                  skill={
                    skill.traits && {
                      axes: skill.traits.map((t) => ({
                        label: TRAIT_COPY[t.trait].label,
                        value: t.score / 100,
                        provisional: t.provisional,
                        winChance: t.winChance,
                      })),
                    }
                  }
                  accentHex={accentHex}
                  axisDetails={skill.traits?.map((t) => {
                    if (t.provisional) return null;
                    // The RATED games from their history that lean hardest on
                    // this trait — genuinely new info, not a restatement.
                    const trained = gamesByPlays(summaryItems ?? [])
                      .filter((g) => ratedSet.has(g.slug))
                      .map((g) => ({ ...g, w: skillProfileBySlug(g.slug)?.[t.trait] ?? 0 }))
                      .filter((g) => g.w >= 25)
                      .sort((a, b) => b.w - a.w || b.plays - a.plays)
                      .slice(0, 2);
                    return (
                      <p key={t.trait} className="mt-0.5 text-3xs text-fg-muted">
                        <span className="text-fg-secondary">{ordinal(t.rank)} in the group</span>
                        {trained.length > 0 &&
                          ` · sharpened by ${trained.map((g) => g.title).join(" & ")}`}
                      </p>
                    );
                  })}
                />
                <p className="text-3xs leading-relaxed text-fg-muted">
                  Scores run 0–100: the group's strongest skill rating sets the 100 and everyone
                  scales below it. Computed from every rated match — each result counts toward the
                  skills the game actually exercises, with game-specific advantage factored out.
                  Greyed skills aren't computed yet. Tap a skill for its leaderboard; hover the
                  chart for win chances.
                </p>
              </div>
              <div className="min-w-0 sm:col-start-2 sm:row-span-2 sm:row-start-1">
                {skill.traits && (
                  <TraitBreakdown
                    traits={skill.traits}
                    boards={boards}
                    highlightUserId={skill.userId}
                    defaultOpen={previewOpen ? (boards?.traits[0]?.trait ?? null) : null}
                  />
                )}
              </div>
              <div className="sm:col-start-1">
                <HonestNumbers items={summaryItems} rail />
              </div>
            </div>
          </Section>
        </Stack>

        <Stack gap="lg" className="min-w-0 lg:col-span-1">
          {boards && boards.games.length > 0 && (
            <Section title="Game rankings" icon={<StarIcon className="h-3.5 w-3.5" />}>
              <GameRankings
                skill={skill}
                boards={boards}
                defaultOpen={previewOpen ? (boards.games[0]?.slug ?? null) : null}
              />
            </Section>
          )}
        </Stack>
      </div>
    </>
  );
}
