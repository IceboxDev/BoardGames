import type { ProfileNightItem } from "@boardgames/core/protocol";
import type { ReactNode } from "react";
import { formatDayKey } from "../../../lib/date-format.ts";
import { HostIcon, TrophyIcon } from "../../icons";
import { DonutChart } from "../../ui/charts";
import { FlameArt } from "../../ui/FlameArt.tsx";
import { MicroLabel } from "../../ui/Label.tsx";
import { Surface } from "../../ui/Surface.tsx";
import { attendanceStreaks, nightTotals } from "./night-stats.ts";

function HeroCard({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Surface variant="raised" padding="none" className="flex min-w-0 flex-col gap-2 p-4">
      <MicroLabel className="font-semibold">{label}</MicroLabel>
      {children}
    </Surface>
  );
}

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
      <HeroCard label="Attendance">
        <div className="flex items-center gap-4">
          <DonutChart
            size={84}
            thickness={10}
            segments={[
              { value: totals.attended, tone: "emerald", label: "Attended" },
              { value: totals.total - totals.attended, tone: "neutral", label: "Missed" },
            ]}
          >
            <span className="text-sm font-bold tabular-nums text-white">
              {totals.attended} / {totals.total}
            </span>
          </DonutChart>
          <div className="space-y-0.5">
            <p className="text-xl font-bold tabular-nums text-emerald-300">{pct}%</p>
            <p className="text-3xs text-fg-muted">of all nights</p>
          </div>
        </div>
      </HeroCard>

      <HeroCard label="Streaks">
        <div className="flex flex-1 flex-col justify-between gap-1">
          <span className="flex items-center gap-1.5 text-2xl font-bold tabular-nums text-fg-primary">
            {streaks.current}
            {streaks.current >= 3 && <FlameArt className="h-5 w-5" />}
          </span>
          <span className="text-3xs text-fg-muted">
            nights in a row · longest {streaks.longest}
          </span>
        </div>
      </HeroCard>

      <HeroCard label="Hosted">
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
      </HeroCard>

      <HeroCard label="Games per night">
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
      </HeroCard>
    </div>
  );
}
