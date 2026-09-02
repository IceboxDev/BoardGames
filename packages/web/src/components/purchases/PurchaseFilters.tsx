import { SegmentedControl } from "../ui/SegmentedControl.tsx";
import { Select } from "../ui/Select.tsx";
import type { PurchaseScope, PurchaseSort, PurchaseViewState } from "./purchase-rows";

// The scope + sort row above the purchase list (CollectionFilters' sibling).
// "Ended" only appears once a cancelled purchase exists, and "Biggest spend"
// only when the payload actually carries money (the server nulls it for
// viewers, so the option would be a no-op for them).

export function PurchaseFilters({
  state,
  onChange,
  counts,
  hasMoney,
}: {
  state: PurchaseViewState;
  onChange: (next: PurchaseViewState) => void;
  counts: Record<PurchaseScope, number>;
  hasMoney: boolean;
}) {
  // No counts in the labels: the tiles and group headers already carry them,
  // and the numbers are what pushed this row past a 360px viewport.
  const scopeOptions: { value: PurchaseScope; label: string }[] = [
    { value: "all", label: "All" },
    { value: "active", label: "Active" },
    { value: "arrived", label: "Arrived" },
    ...(counts.ended > 0 ? [{ value: "ended" as const, label: "Ended" }] : []),
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      <SegmentedControl
        aria-label="Purchase scope"
        options={scopeOptions}
        value={state.scope}
        onChange={(scope) => onChange({ ...state, scope })}
        size="sm"
        shape="pill"
      />
      <span className="flex-1" />
      <Select
        aria-label="Sort purchases"
        size="sm"
        block={false}
        value={state.sort}
        onChange={(e) => onChange({ ...state, sort: e.target.value as PurchaseSort })}
      >
        {/* Terse labels: the select sizes to its longest option, and wordy
            ones push the row onto two lines at 360px. */}
        <option value="eta">ETA</option>
        <option value="updated">Updated</option>
        <option value="pledged">Pledged</option>
        <option value="title">Title</option>
        {hasMoney && <option value="spend">Spend</option>}
      </Select>
    </div>
  );
}
