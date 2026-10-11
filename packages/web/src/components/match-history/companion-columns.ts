import type { CompanionRecord, CompanionRecordEntry } from "@boardgames/core/protocol";
import { formatMinutes, formatShortDate } from "../../lib/date-format";
import type { MatchColumn } from "./MatchResultsTable";

// The companions' Match History helpers shared by each game's columns and
// detail dialog (split from CompanionMatchHistory.tsx so that file only
// exports a component).

/** A stored record narrowed to one game's shape. */
export type CompanionRow<R extends CompanionRecord> = Omit<CompanionRecordEntry, "record"> & {
  record: R;
};

/** "1 h 15 min", or `null` when the start wasn't kept. */
export function recordLength(record: CompanionRecord): string | null {
  if (record.startedAt === null) return null;
  return formatMinutes((Date.parse(record.endedAt) - Date.parse(record.startedAt)) / 60_000);
}

/** The shared trailing columns: length and date. */
export function lengthAndDateColumns<R extends CompanionRecord>(): MatchColumn<CompanionRow<R>>[] {
  return [
    {
      id: "length",
      header: "Length",
      align: "right",
      cellClassName: "text-xs tabular-nums text-fg-secondary",
      cell: (row) => recordLength(row.record) ?? "—",
    },
    {
      id: "date",
      header: "Date",
      align: "right",
      cellClassName: "text-xs text-fg-muted",
      cell: (row) => formatShortDate(row.record.endedAt),
    },
  ];
}
