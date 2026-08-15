import type { CollectionResponse } from "@boardgames/core/protocol";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Fragment, useMemo, useState } from "react";
import { cn } from "../../lib/cn.ts";
import { upsertCollectionItem } from "../../lib/collection.ts";
import { formatDayKey, formatShortDate } from "../../lib/date-format.ts";
import { qk } from "../../lib/query-keys.ts";
import { Badge } from "../ui/Badge.tsx";
import { Checkbox } from "../ui/Checkbox.tsx";
import { Select } from "../ui/Select.tsx";
import { CollectionRowEditor } from "./CollectionRowEditor.tsx";
import type { CollectionRow } from "./collection-rows.ts";

// The collection table: sortable columns, optional by-box grouping, checkbox
// multi-select (the merge-into-box mechanism), inline status dropdown, and a
// per-row expansion carrying the full editor (owner/admin) or a read-only
// detail line (other members). Table chrome follows the admin UsersTable
// idiom: real <table> inside overflow-x-auto, uppercase micro headers.

type SortKey = "title" | "status" | "box" | "plays" | "acquired" | "size";
type SortDir = "asc" | "desc";

function sizeVolume(row: CollectionRow): number | null {
  const i = row.item;
  if (!i || i.widthMm == null || i.depthMm == null || i.heightMm == null) return null;
  return i.widthMm * i.depthMm * i.heightMm;
}

export function CollectionTable({
  userId,
  rows,
  collection,
  editable,
  groupByBox,
  selection,
  onToggleSelect,
}: {
  userId: string;
  rows: readonly CollectionRow[];
  collection: CollectionResponse;
  editable: boolean;
  groupByBox: boolean;
  selection: ReadonlySet<string>;
  onToggleSelect: (key: string) => void;
}) {
  const queryClient = useQueryClient();
  const [sortKey, setSortKey] = useState<SortKey>("title");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const statusLabel = useMemo(
    () => new Map(collection.statuses.map((s) => [s.id, s.label])),
    [collection.statuses],
  );
  const boxName = useMemo(
    () => new Map(collection.boxes.map((b) => [b.id, b.name])),
    [collection.boxes],
  );
  const sleeveName = useMemo(
    () => new Map(collection.sleeveTypes.map((s) => [s.id, s.name])),
    [collection.sleeveTypes],
  );

  const statusMutation = useMutation({
    mutationFn: ({ row, statusId }: { row: CollectionRow; statusId: string | null }) =>
      upsertCollectionItem(
        userId,
        row.slug !== null
          ? { slug: row.slug, statusId }
          : { itemId: row.item?.id as string, statusId },
      ),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: qk.collection(userId) }),
  });

  const sorted = useMemo(() => {
    const value = (row: CollectionRow): string | number => {
      switch (sortKey) {
        case "title":
          return row.title.toLowerCase();
        case "status":
          return row.item?.statusId ? (statusLabel.get(row.item.statusId) ?? "") : "￿";
        case "box":
          return row.item?.boxId ? (boxName.get(row.item.boxId) ?? "") : "￿";
        case "plays":
          return row.playCount;
        case "acquired":
          return row.item?.acquiredOn ?? "";
        case "size":
          return sizeVolume(row) ?? -1;
      }
    };
    const dir = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = value(a);
      const vb = value(b);
      if (va < vb) return -dir;
      if (va > vb) return dir;
      return a.title.localeCompare(b.title);
    });
  }, [rows, sortKey, sortDir, statusLabel, boxName]);

  // "By box" view: stable groups (each box in name order, unassigned last).
  const groups = useMemo(() => {
    if (!groupByBox) return [{ key: "all", label: null as string | null, rows: sorted }];
    const byBox = new Map<string, CollectionRow[]>();
    for (const row of sorted) {
      const key = row.item?.boxId ?? "unassigned";
      const list = byBox.get(key) ?? [];
      list.push(row);
      byBox.set(key, list);
    }
    const ordered = [...collection.boxes]
      .filter((b) => byBox.has(b.id))
      .map((b) => ({ key: b.id, label: b.name, rows: byBox.get(b.id) as CollectionRow[] }));
    const unassigned = byBox.get("unassigned");
    if (unassigned) ordered.push({ key: "unassigned", label: "Not in a box", rows: unassigned });
    return ordered;
  }, [groupByBox, sorted, collection.boxes]);

  const columnCount = 6 + (editable ? 2 : 0); // +checkbox +acquired

  function header(label: string, key: SortKey, extra?: string) {
    const active = sortKey === key;
    return (
      <th className={cn("p-2.5 text-left", extra)}>
        {/* biome-ignore lint/correctness/noRestrictedElements: sortable header — Button chrome doesn't fit a th */}
        <button
          type="button"
          onClick={() => {
            if (active) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
            else {
              setSortKey(key);
              setSortDir("asc");
            }
          }}
          className={cn(
            "text-2xs font-bold uppercase tracking-pill",
            active ? "text-fg-primary" : "text-fg-muted hover:text-fg-secondary",
          )}
        >
          {label}
          {active && <span aria-hidden="true"> {sortDir === "asc" ? "▲" : "▼"}</span>}
        </button>
      </th>
    );
  }

  function sleeveBadge(row: CollectionRow) {
    const status = row.item?.sleeveStatus ?? "none";
    if (status === "sleeved") {
      const type = row.item?.sleeveTypeId ? sleeveName.get(row.item.sleeveTypeId) : undefined;
      return (
        <Badge tone="emerald" size="xs">
          Sleeved{type ? ` · ${type}` : ""}
        </Badge>
      );
    }
    if (status === "missing") {
      const type = row.item?.sleeveTypeId ? sleeveName.get(row.item.sleeveTypeId) : undefined;
      return (
        <Badge tone="amber" size="xs">
          Missing{type ? ` ${type}` : " sleeves"}
        </Badge>
      );
    }
    return <span className="text-3xs text-fg-disabled">N/A</span>;
  }

  function size(row: CollectionRow): string {
    const i = row.item;
    if (!i || (i.widthMm == null && i.depthMm == null && i.heightMm == null)) return "—";
    const dim = (v: number | null) => (v == null ? "?" : String(v));
    return `${dim(i.widthMm)}×${dim(i.depthMm)}×${dim(i.heightMm)}`;
  }

  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-white/10">
            {editable && <th className="w-8 p-2.5" aria-label="Select" />}
            {header("Title", "title")}
            {header("Status", "status")}
            {!groupByBox && header("Box", "box")}
            <th className="p-2.5 text-left text-2xs font-bold uppercase tracking-pill text-fg-muted">
              Sleeves
            </th>
            {header("Size mm", "size")}
            {header("Plays", "plays")}
            {editable && header("Acquired", "acquired")}
          </tr>
        </thead>
        {groups.map((group) => (
          <tbody key={group.key}>
            {group.label !== null && (
              <tr>
                <td
                  colSpan={columnCount}
                  className="bg-surface-950/40 px-2.5 py-1.5 text-2xs font-bold uppercase tracking-pill text-fg-secondary"
                >
                  {group.label} ({group.rows.length})
                </td>
              </tr>
            )}
            {group.rows.map((row) => {
              const expanded = expandedKey === row.key;
              return (
                <Fragment key={row.key}>
                  <tr
                    className={cn(
                      "border-b border-white/[0.04] transition hover:bg-white/[0.03]",
                      expanded && "bg-white/[0.03]",
                      row.playedThrough && "opacity-60",
                    )}
                  >
                    {editable && (
                      <td className="p-2.5">
                        {!row.playedThrough && (
                          <Checkbox
                            id={`sel-${row.key}`}
                            label=""
                            checked={selection.has(row.key)}
                            onChange={() => onToggleSelect(row.key)}
                          />
                        )}
                      </td>
                    )}
                    <td className="p-2.5">
                      {/* biome-ignore lint/correctness/noRestrictedElements: full-cell expansion toggle — Button chrome doesn't fit a table cell */}
                      <button
                        type="button"
                        onClick={() => setExpandedKey(expanded ? null : row.key)}
                        aria-expanded={expanded}
                        aria-label={`${expanded ? "Collapse" : "Expand"} details for ${row.title}`}
                        className="-mx-1 flex w-full cursor-pointer items-center gap-2.5 rounded-md px-1 py-0.5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
                      >
                        {row.thumbnail ? (
                          <img
                            src={row.thumbnail}
                            alt=""
                            className="h-8 w-14 shrink-0 rounded object-cover"
                          />
                        ) : (
                          <span className="flex h-8 w-14 shrink-0 items-center justify-center rounded bg-surface-800 text-2xs font-bold text-fg-muted">
                            {row.title.slice(0, 1)}
                          </span>
                        )}
                        <span className="min-w-0">
                          <span
                            className={cn(
                              "block truncate font-medium text-fg-primary",
                              row.playedThrough && "line-through",
                            )}
                          >
                            {row.title}
                          </span>
                          <span className="flex items-center gap-1">
                            {row.kind === "exit" && (
                              <Badge tone="purple" size="xs">
                                EXIT box
                              </Badge>
                            )}
                            {row.kind === "deck" && (
                              <Badge tone="sky" size="xs">
                                Card deck
                              </Badge>
                            )}
                            {row.kind === "custom" && (
                              <Badge tone="neutral" size="xs">
                                Custom
                              </Badge>
                            )}
                            {row.playedThrough && (
                              <Badge tone="rose" size="xs">
                                Played through
                              </Badge>
                            )}
                          </span>
                        </span>
                      </button>
                    </td>
                    <td className="p-2.5">
                      {editable && !row.playedThrough ? (
                        <Select
                          aria-label={`Status of ${row.title}`}
                          size="sm"
                          block={false}
                          value={row.item?.statusId ?? ""}
                          onChange={(e) =>
                            statusMutation.mutate({ row, statusId: e.target.value || null })
                          }
                        >
                          <option value="">—</option>
                          {collection.statuses.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.label}
                            </option>
                          ))}
                        </Select>
                      ) : (
                        <span className="text-xs text-fg-secondary">
                          {row.item?.statusId ? (statusLabel.get(row.item.statusId) ?? "—") : "—"}
                        </span>
                      )}
                    </td>
                    {!groupByBox && (
                      <td className="p-2.5 text-xs text-fg-secondary">
                        {row.item?.boxId ? (boxName.get(row.item.boxId) ?? "—") : "—"}
                      </td>
                    )}
                    <td className="p-2.5">{sleeveBadge(row)}</td>
                    <td className="p-2.5 text-xs tabular-nums text-fg-secondary">{size(row)}</td>
                    <td className="p-2.5 text-xs tabular-nums text-fg-secondary">
                      {row.playCount > 0 ? (
                        <span>
                          {row.playCount}
                          {row.lastPlayedAt && (
                            <span className="block text-3xs text-fg-muted">
                              {formatShortDate(row.lastPlayedAt)}
                            </span>
                          )}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    {editable && (
                      <td className="p-2.5 text-xs tabular-nums text-fg-secondary">
                        {row.item?.acquiredOn ? formatDayKey(row.item.acquiredOn, "compact") : "—"}
                      </td>
                    )}
                  </tr>
                  {expanded && (
                    <tr>
                      <td colSpan={columnCount} className="bg-surface-950/50 px-4 py-4">
                        {editable ? (
                          <CollectionRowEditor userId={userId} row={row} collection={collection} />
                        ) : (
                          <ReadOnlyDetail row={row} />
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        ))}
      </table>
      {rows.length === 0 && (
        <p className="py-6 text-center text-sm text-fg-muted">Nothing matches these filters.</p>
      )}
    </div>
  );
}

function ReadOnlyDetail({ row }: { row: CollectionRow }) {
  const i = row.item;
  const parts: string[] = [];
  if (i?.weightG != null) parts.push(`${i.weightG} g`);
  if (i?.language) parts.push(i.language);
  if (row.bggId) parts.push("");
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-fg-secondary">
      {parts.filter(Boolean).map((part) => (
        <span key={part}>{part}</span>
      ))}
      {row.bggId && (
        <a
          href={`https://boardgamegeek.com/boardgame/${row.bggId}`}
          target="_blank"
          rel="noreferrer"
          className="text-accent-300 underline-offset-2 hover:underline"
        >
          BGG page ↗
        </a>
      )}
      {!i && <span className="text-fg-muted">No collection details recorded.</span>}
    </div>
  );
}
