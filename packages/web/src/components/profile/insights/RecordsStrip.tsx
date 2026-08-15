import type { ProfileMatchSummaryItem } from "@boardgames/core/protocol";
import { formatDayKey, formatShortDate } from "../../../lib/date-format.ts";
import { MicroLabel } from "../../ui/Label.tsx";
import { Surface } from "../../ui/Surface.tsx";
import { personalRecords } from "./summary-stats.ts";

/** All-time personal records as a compact label/value grid. */
export function RecordsStrip({ items }: { items: readonly ProfileMatchSummaryItem[] }) {
  const records = personalRecords(items);
  const rows: { label: string; value: string }[] = [
    {
      label: "Longest win streak",
      value:
        records.longestWinStreak > 0
          ? `${records.longestWinStreak} win${records.longestWinStreak === 1 ? "" : "s"}`
          : "—",
    },
    {
      label: "Biggest night",
      value: records.biggestNight
        ? `${records.biggestNight.games} games · ${formatDayKey(records.biggestNight.dateKey)}`
        : "—",
    },
    {
      label: "First recorded match",
      value: records.firstPlayedAt ? formatShortDate(records.firstPlayedAt) : "—",
    },
    { label: "Different games", value: String(records.distinctGames) },
    { label: "Sessions incl. campaigns", value: String(records.totalSessions) },
  ];

  return (
    <Surface
      variant="raised"
      padding="none"
      className="grid grid-cols-2 gap-x-4 gap-y-3 p-4 sm:grid-cols-3"
    >
      {rows.map((row) => (
        <div key={row.label} className="flex flex-col gap-0.5">
          <MicroLabel>{row.label}</MicroLabel>
          <span className="text-sm font-semibold tabular-nums text-fg-primary">{row.value}</span>
        </div>
      ))}
    </Surface>
  );
}
