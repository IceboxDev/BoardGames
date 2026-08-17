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
    <Surface variant="raised" className="max-w-xl">
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

/** The unvarnished numbers — wins AND losses, exact, below the fold. */
export function HonestNumbers({
  items,
}: {
  items: readonly ProfileMatchSummaryItem[] | undefined;
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
      <div className="grid grid-cols-3 gap-2">
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
  return (
    <>
      <SkillHeroCards skill={skill} summaryItems={summaryItems} accentHex={accentHex} />

      <div className="grid gap-6 lg:grid-cols-3">
        <Stack gap="lg" className="min-w-0 lg:col-span-2">
          <Section title="Skill profile" icon={<SparkleIcon className="h-4 w-4" />}>
            <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
              <div className="w-56 shrink-0 sm:sticky sm:top-4">
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
                    // The games from THEIR history that lean hardest on this
                    // trait — genuinely new info, not a restatement.
                    const trained = gamesByPlays(summaryItems ?? [])
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
              </div>
              <div className="w-full min-w-0 flex-1">
                {skill.traits && (
                  <TraitBreakdown
                    traits={skill.traits}
                    boards={boards}
                    highlightUserId={skill.userId}
                    defaultOpen={previewOpen ? (boards?.traits[0]?.trait ?? null) : null}
                  />
                )}
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

          <HonestNumbers items={summaryItems} />
        </Stack>
      </div>
    </>
  );
}
