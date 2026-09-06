import type { ProfileNightItem } from "@boardgames/core/protocol";
import { formatDayKey } from "../../../lib/date-format.ts";
import { HostIcon, TrophyIcon } from "../../icons";
import { DonutChart } from "../../ui/charts";
import { FlameArt } from "../../ui/FlameArt.tsx";
import { StatTile } from "../../ui/StatTile.tsx";
import { attendanceStreaks, nightTotals } from "./night-stats.ts";

/** Hero strip: attendance ring, streaks, hosted nights, games per night. */
export function NightsHero({
  items,
  userId,
}: {
  items: readonly ProfileNightItem[];
  userId: string;
}) {
  const totals = nightTotals(items, userId);
  const streaks = attendanceStreaks(items);
  const pct = totals.total > 0 ? Math.round((totals.attended / totals.total) * 100) : 0;

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatTile align="start" padding="lg" label="Attendance">
        <div className="flex items-center gap-4">
          <DonutChart
            size={84}
            thickness={10}
            segments={[
              { value: totals.attended, tone: "emerald", label: "Attended" },
              { value: totals.total - totals.attended, tone: "neutral", label: "Missed" },
            ]}
          >
            <span className="text-sm font-bold tabular-nums text-fg-strong">
              {totals.attended} / {totals.total}
            </span>
          </DonutChart>
          <div className="space-y-0.5">
            <p className="text-xl font-bold tabular-nums text-emerald-300">{pct}%</p>
            <p className="text-3xs text-fg-muted">of all nights</p>
          </div>
        </div>
      </StatTile>

      <StatTile align="start" padding="lg" label="Streaks">
        <div className="flex flex-1 flex-col justify-between gap-1">
          <span className="flex items-center gap-1.5 text-2xl font-bold tabular-nums text-fg-primary">
            {streaks.current}
            {streaks.current >= 3 && <FlameArt className="h-5 w-5" />}
          </span>
          <span className="text-3xs text-fg-muted">
            nights in a row · longest {streaks.longest}
          </span>
        </div>
      </StatTile>

      <StatTile align="start" padding="lg" label="Hosted">
        <div className="flex flex-1 flex-col justify-between gap-1">
          <span className="flex items-center gap-1.5 text-2xl font-bold tabular-nums text-fg-primary">
            {totals.hosted}
            <HostIcon className="h-5 w-5 text-amber-300" />
          </span>
          <span className="text-3xs text-fg-muted">
            {totals.lastHostedDateKey
              ? `last hosted ${formatDayKey(totals.lastHostedDateKey)}`
              : "never hosted yet"}
          </span>
        </div>
      </StatTile>

      <StatTile align="start" padding="lg" label="Games per night">
        <div className="flex flex-1 flex-col justify-between gap-1">
          <span className="flex items-center gap-1.5 text-2xl font-bold tabular-nums text-fg-primary">
            {totals.avgGamesPerAttendedNight === null
              ? "—"
              : totals.avgGamesPerAttendedNight.toFixed(1)}
            <TrophyIcon className="h-5 w-5 text-accent-300" />
          </span>
          <span className="text-3xs text-fg-muted">
            {totals.gamesPlayed} recorded games across all nights
          </span>
        </div>
      </StatTile>
    </div>
  );
}
