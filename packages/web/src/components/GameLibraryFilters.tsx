import {
  EMPTY_FILTERS,
  type GameFilters,
  hasActiveFilters,
  PLAYERS_MAX_PLUS,
} from "../lib/game-filters";
import { ChevronDownIcon, SearchIcon, XIcon } from "./icons";
import { Button } from "./ui/Button";
import { Chip } from "./ui/Chip";
import { Input } from "./ui/Input";

// One thin top-row filter bar for the Board Game Lab library. Everything
// lives on a single horizontal line: search grows to fill, the three range
// filters and the "Playable" toggle are equal-width rounded controls that
// share the same chrome, and the count + clear sit on the right.
//
// Layout-stability is a hard requirement here: NOTHING may shift when a
// filter is toggled. That means (a) the selects have a fixed width so the
// native control doesn't resize to its selected option, (b) the count has
// a fixed-width slot, and (c) the clear button is always rendered and only
// made `invisible` when inactive so its slot is always reserved.

const CONTROL_W = "w-32"; // shared fixed width for the three selects

const PLAYER_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "", label: "Players" },
  ...Array.from({ length: PLAYERS_MAX_PLUS }, (_, i) => {
    const n = i + 1;
    return {
      value: String(n),
      label: n === PLAYERS_MAX_PLUS ? `${n}+ players` : `${n} player${n === 1 ? "" : "s"}`,
    };
  }),
];

const WEIGHT_OPTIONS = [
  { value: "", label: "Complexity" },
  { value: "light", label: "Light" },
  { value: "medium", label: "Medium" },
  { value: "heavy", label: "Heavy" },
] as const;

const TIME_OPTIONS = [
  { value: "", label: "Time" },
  { value: "short", label: "< 30 min" },
  { value: "mid", label: "30–60 min" },
  { value: "long", label: "1–2 hr" },
  { value: "epic", label: "2 hr+" },
] as const;

type Props = {
  filters: GameFilters;
  onChange: (next: GameFilters) => void;
  resultCount: number;
  totalCount: number;
  /** Render the "Playable" toggle. Only useful when the list includes
   *  catalog-only (coming-soon) entries — i.e. the admin view. */
  showPlayableFilter: boolean;
};

export default function GameLibraryFilters({
  filters,
  onChange,
  resultCount,
  totalCount,
  showPlayableFilter,
}: Props) {
  const active = hasActiveFilters(filters);

  return (
    <div className="scrollbar-hide flex w-full items-center gap-2 overflow-x-auto py-0.5">
      <div className="relative min-w-[8rem] flex-1">
        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-muted">
          <SearchIcon className="h-4 w-4" />
        </span>
        <Input
          type="search"
          value={filters.query}
          onChange={(e) => onChange({ ...filters, query: e.target.value })}
          placeholder="Search games, designers, mechanics…"
          aria-label="Search games"
          className="h-9 pl-8"
        />
      </div>

      <FilterSelect
        label="Players"
        value={filters.players === null ? "" : String(filters.players)}
        options={PLAYER_OPTIONS}
        onChange={(v) => onChange({ ...filters, players: v === "" ? null : Number(v) })}
      />
      <FilterSelect
        label="Complexity"
        value={filters.weight ?? ""}
        options={WEIGHT_OPTIONS}
        onChange={(v) => onChange({ ...filters, weight: v === "" ? null : v })}
      />
      <FilterSelect
        label="Time"
        value={filters.time ?? ""}
        options={TIME_OPTIONS}
        onChange={(v) => onChange({ ...filters, time: v === "" ? null : v })}
      />

      {showPlayableFilter && (
        <Chip
          variant="outlined"
          shape="rounded"
          tone="accent"
          size="md"
          pressed={filters.playableOnly}
          onClick={() => onChange({ ...filters, playableOnly: !filters.playableOnly })}
          title="Show only implemented games"
          className="h-9 shrink-0 whitespace-nowrap rounded-lg"
        >
          Playable
        </Chip>
      )}

      <p
        className="hidden w-24 shrink-0 whitespace-nowrap text-right text-xs tabular-nums text-fg-muted md:block"
        aria-live="polite"
      >
        {active ? `${resultCount} / ${totalCount}` : `${totalCount} games`}
      </p>

      <Button
        variant="ghost"
        size="sm"
        onClick={() => onChange(EMPTY_FILTERS)}
        disabled={!active}
        aria-hidden={!active}
        tabIndex={active ? undefined : -1}
        title="Clear all filters"
        className={`h-9 shrink-0 ${active ? "" : "invisible"}`}
      >
        <XIcon className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Clear</span>
      </Button>
    </div>
  );
}

// Compact dark-themed select sharing the search input's chrome (rounded-lg,
// border-white/10, surface-900, h-9) so the whole bar reads as one family.
// Fixed width so selecting a value doesn't resize the native control (which
// would shift its neighbours). Generic over the option value, so each call
// site gets a typed `onChange` — `T` is the union of the option `value`s
// ("" for the unset/placeholder entry). The only cast is the native
// string→T narrowing, safe because the option set is closed.
function FilterSelect<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  const active = value !== "";
  return (
    <div className={`relative shrink-0 ${CONTROL_W}`}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        aria-label={label}
        className={`h-9 w-full appearance-none truncate rounded-lg border bg-surface-900 pl-2.5 pr-7 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400/30 ${
          active ? "border-accent-400/50 text-accent-100" : "border-white/10 text-fg-primary"
        }`}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDownIcon className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-muted" />
    </div>
  );
}
