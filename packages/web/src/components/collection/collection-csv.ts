// CSV serialization of collection rows — the spreadsheet escape hatch for a
// collection manager. Pure serializer (unit-tested); the download trigger is
// the only DOM-touching function.

import type { CollectionResponse } from "@boardgames/core/protocol";
import { formatDayKey, formatShortDate } from "../../lib/date-format.ts";
import { type CollectionRow, rowTitleByKey } from "./collection-rows.ts";

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

const HEADER = [
  "Title",
  "Status",
  "Stored in",
  "Sleeves",
  "Sleeve type",
  "Width (mm)",
  "Depth (mm)",
  "Height (mm)",
  "Weight (g)",
  "Language",
  "Acquired",
  "Price (EUR)",
  "Plays",
  "Last played",
  "Played through",
  "Note",
];

export function collectionToCsv(
  rows: readonly CollectionRow[],
  data: Pick<CollectionResponse, "sleeveTypes" | "statuses">,
): string {
  const containerTitle = rowTitleByKey(rows);
  const sleeveName = new Map(data.sleeveTypes.map((s) => [s.id, s.name]));
  const statusLabel = new Map(data.statuses.map((s) => [s.id, s.label]));

  const lines = [HEADER.map(csvCell).join(",")];
  for (const row of rows) {
    const item = row.item;
    lines.push(
      [
        row.title,
        item?.statusId ? (statusLabel.get(item.statusId) ?? "") : "",
        item?.containerKey ? (containerTitle.get(item.containerKey) ?? item.containerKey) : "",
        item?.sleeveStatus ?? "none",
        item?.sleeveTypeId ? (sleeveName.get(item.sleeveTypeId) ?? "") : "",
        item?.widthMm != null ? String(item.widthMm) : "",
        item?.depthMm != null ? String(item.depthMm) : "",
        item?.heightMm != null ? String(item.heightMm) : "",
        item?.weightG != null ? String(item.weightG) : "",
        item?.language ?? "",
        item?.acquiredOn ? formatDayKey(item.acquiredOn, "compact") : "",
        item?.pricePaidCents != null ? (item.pricePaidCents / 100).toFixed(2) : "",
        String(row.playCount),
        row.lastPlayedAt ? formatShortDate(row.lastPlayedAt) : "",
        row.playedThrough ? "yes" : "",
        item?.note ?? "",
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return lines.join("\n");
}

/** Trigger a browser download of the CSV. */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
