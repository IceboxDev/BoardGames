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
  const scopeOptions: { value: PurchaseScope; label: string }[] = [
    { value: "all", label: `All (${counts.all})` },
    { value: "active", label: `Active (${counts.active})` },
    { value: "arrived", label: `Arrived (${counts.arrived})` },
    ...(counts.ended > 0 ? [{ value: "ended" as const, label: `Ended (${counts.ended})` }] : []),
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
        <option value="eta">Soonest ETA</option>
        <option value="updated">Recently updated</option>
        <option value="pledged">Recently pledged</option>
        <option value="title">Title A–Z</option>
        {hasMoney && <option value="spend">Biggest spend</option>}
      </Select>
    </div>
  );
}
