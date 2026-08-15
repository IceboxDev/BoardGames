import type { ProfileMatchSummaryItem } from "@boardgames/core/protocol";
import type { ReactNode } from "react";
import { resolveGame } from "../../../lib/games-by-slug.ts";
import { FlameIcon, TrophyIcon } from "../../icons";
import { DonutChart, perfColor, Sparkline } from "../../ui/charts";
import { MicroLabel } from "../../ui/Label.tsx";
import { Surface } from "../../ui/Surface.tsx";
import {
  gamesByPlays,
  meanPerformance,
  recentForm,
  recordCounts,
  rollingPerformance,
  streaks,
} from "./summary-stats.ts";

// Hero strip: four all-time infographic cards (record donut, performance
// trend, streaks, most played). Always unfiltered — the filters below the
// strip slice the chart + timeline, not the headline numbers.

function HeroCard({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Surface variant="raised" padding="none" className="flex flex-col gap-2 p-4">
      <MicroLabel className="font-semibold">{label}</MicroLabel>
      {children}
    </Surface>
  );
}

export function MatchHistoryHero({ items }: { items: readonly ProfileMatchSummaryItem[] }) {
  const counts = recordCounts(items);
  const perf = meanPerformance(items);
  const trend = rollingPerformance(items);
  const streak = streaks(items);
  const form = recentForm(items);
  const topGames = gamesByPlays(items);
  const favorite = topGames[0];
  const favoriteGame = favorite ? resolveGame(favorite.slug) : undefined;

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <HeroCard label="Record">
        <div className="flex items-center gap-4">
          <DonutChart
            size={84}
            thickness={10}
            segments={[
              { value: counts.wins, tone: "emerald", label: "Won" },
              { value: counts.losses, tone: "rose", label: "Lost" },
              { value: counts.other, tone: "neutral", label: "Other" },
            ]}
          >
            <span className="text-lg font-bold tabular-nums text-white">{counts.total}</span>
          </DonutChart>
          <div className="space-y-0.5 text-2xs">
            <p className="text-emerald-300">
              <span className="font-bold tabular-nums">{counts.wins}</span> won
            </p>
            <p className="text-rose-300">
              <span className="font-bold tabular-nums">{counts.losses}</span> lost
            </p>
            {counts.other > 0 && (
              <p className="text-fg-muted">
                <span className="font-bold tabular-nums">{counts.other}</span> other
              </p>
            )}
          </div>
        </div>
      </HeroCard>

      <HeroCard label="Performance">
        <div className="flex flex-1 flex-col justify-between gap-1">
          <span className="text-2xl font-bold tabular-nums" style={{ color: perfColor(perf) }}>
            {perf === null ? "—" : `${Math.round(perf * 100)}%`}
          </span>
          {trend.length >= 2 ? (
            <Sparkline data={trend} width={140} height={30} color={perfColor(perf)} />
          ) : (
            <span className="text-3xs text-fg-muted">Not enough competitive games yet</span>
          )}
          <span className="text-3xs text-fg-muted">Placement-weighted, rolling 5</span>
        </div>
      </HeroCard>

      <HeroCard label="Streaks">
        <div className="flex flex-1 flex-col justify-between gap-1">
          <div className="flex items-baseline gap-2">
            {streak.current ? (
              <span
                className={`flex items-center gap-1.5 text-2xl font-bold tabular-nums ${
                  streak.current.type === "win" ? "text-emerald-300" : "text-rose-300"
                }`}
              >
                {streak.current.length}
                {streak.current.type === "win" ? "W" : "L"}
                {streak.current.type === "win" && streak.current.length >= 2 && (
                  <FlameIcon className="h-5 w-5 text-amber-300" />
                )}
              </span>
            ) : (
              <span className="text-2xl font-bold text-fg-muted">—</span>
            )}
            <span className="text-3xs text-fg-muted">
              {streak.current
                ? streak.current.type === "win"
                  ? "win streak"
                  : "loss streak"
                : "no streak yet"}
            </span>
          </div>
          {form.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-3xs text-fg-muted">Last {form.length} results</span>
              <div className="flex items-center gap-1">
                {form.map((result, i) => (
                  <span
                    // biome-ignore lint/suspicious/noArrayIndexKey: fixed-window form strip, order never changes
                    key={i}
                    className={`flex h-4.5 w-4.5 items-center justify-center rounded text-4xs font-bold ${
                      result === "win"
                        ? "bg-emerald-500/20 text-emerald-300"
                        : result === "loss"
                          ? "bg-rose-500/20 text-rose-300"
                          : "bg-white/[0.08] text-fg-secondary"
                    }`}
                  >
                    {result === "win" ? "W" : result === "loss" ? "L" : "D"}
                  </span>
                ))}
              </div>
            </div>
          )}
          <span className="text-3xs text-fg-muted">
            {streak.bestWin > 0
              ? `Best: ${streak.bestWin} win${streak.bestWin === 1 ? "" : "s"} in a row`
              : "No wins yet — the streak starts tonight"}
          </span>
        </div>
      </HeroCard>

      <HeroCard label="Most played">
        {favorite ? (
          <div className="flex flex-1 flex-col justify-between gap-2">
            <div className="flex items-center gap-2.5">
              {favoriteGame?.thumbnail ? (
                <img
                  src={favoriteGame.thumbnail}
                  alt=""
                  className="h-10 w-[4.5rem] shrink-0 rounded-md object-cover"
                />
              ) : (
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-surface-800 text-fg-muted">
                  <TrophyIcon className="h-4 w-4" />
                </span>
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-fg-primary">{favorite.title}</p>
                <p className="text-3xs text-fg-muted">{favorite.plays} plays</p>
              </div>
            </div>
            {topGames.length > 1 && (
              <div className="space-y-0.5">
                {topGames.slice(1, 3).map((g) => (
                  <p key={g.slug} className="truncate text-3xs text-fg-muted">
                    {g.title} · {g.plays}
                  </p>
                ))}
              </div>
            )}
          </div>
        ) : (
          <span className="text-3xs text-fg-muted">No games recorded yet</span>
        )}
      </HeroCard>
    </div>
  );
}
