import type { CollectionResponse, SleeveStatus } from "@boardgames/core/protocol";
import { SearchIcon } from "../icons";
import { Input } from "../ui/Input.tsx";
import { SegmentedControl } from "../ui/SegmentedControl.tsx";
import { Select } from "../ui/Select.tsx";
import type { CollectionRow } from "./collection-rows.ts";

// Filter/view state for the collection table, plus the pure filter function
// so the table, the count, and the CSV export share one row set.

export type CollectionView = "all" | "by-box" | "played-through";

export interface CollectionViewState {
  search: string;
  statusId: string | null;
  sleeve: SleeveStatus | null;
  view: CollectionView;
}

export const DEFAULT_VIEW_STATE: CollectionViewState = {
  search: "",
  statusId: null,
  sleeve: null,
  view: "all",
};

export function applyViewState(
  rows: readonly CollectionRow[],
  state: CollectionViewState,
): CollectionRow[] {
  const query = state.search.trim().toLowerCase();
  return rows.filter((row) => {
    // Played-through records live in their own view; owned rows everywhere else.
    if (state.view === "played-through") {
      if (!row.playedThrough) return false;
    } else if (row.playedThrough) {
      return false;
    }
    if (query && !row.title.toLowerCase().includes(query)) return false;
    if (state.statusId !== null && row.item?.statusId !== state.statusId) return false;
    if (state.sleeve !== null && (row.item?.sleeveStatus ?? "none") !== state.sleeve) return false;
    return true;
  });
}

export function CollectionFilters({
  collection,
  state,
  onChange,
  playedThroughCount,
}: {
  collection: CollectionResponse;
  state: CollectionViewState;
  onChange: (state: CollectionViewState) => void;
  playedThroughCount: number;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-44 flex-1 sm:max-w-xs">
        <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-muted" />
        <Input
          value={state.search}
          onChange={(e) => onChange({ ...state, search: e.target.value })}
          placeholder="Search the collection…"
          className="pl-8"
          aria-label="Search the collection"
        />
      </div>
      {collection.statuses.length > 0 && (
        <Select
          aria-label="Filter by status"
          size="sm"
          block={false}
          value={state.statusId ?? ""}
          onChange={(e) => onChange({ ...state, statusId: e.target.value || null })}
        >
          <option value="">Any status</option>
          {collection.statuses.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </Select>
      )}
      <Select
        aria-label="Filter by sleeve state"
        size="sm"
        block={false}
        value={state.sleeve ?? ""}
        onChange={(e) =>
          onChange({ ...state, sleeve: (e.target.value || null) as SleeveStatus | null })
        }
      >
        <option value="">Any sleeves</option>
        <option value="sleeved">Sleeved</option>
        <option value="missing">Missing sleeves</option>
        <option value="none">Unsleeved</option>
      </Select>
      <SegmentedControl<CollectionView>
        aria-label="Collection view"
        size="sm"
        shape="pill"
        options={[
          { value: "all", label: "All" },
          { value: "by-box", label: "By box" },
          ...(playedThroughCount > 0
            ? [
                {
                  value: "played-through" as const,
                  label: `Played through (${playedThroughCount})`,
                },
              ]
            : []),
        ]}
        value={state.view}
        onChange={(view) => onChange({ ...state, view })}
      />
    </div>
  );
}
