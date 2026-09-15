import { type ReactNode, useMemo, useState } from "react";
import { cn } from "../../lib/cn";
import { Avatar } from "./Avatar";
import { CheckRow } from "./CheckRow";
import { SearchInput } from "./SearchInput";

// ── MemberPicker ─────────────────────────────────────────────────────────
//
// A multi-select member list: a search box over CheckRows with avatars.
// The single-pick sibling is `admin/PurchaserPicker`; this one keeps every
// row visible and reads the selection back as a count. Members marked
// `suggested` are listed first with a hint (e.g. "Free that day") so the
// obvious names are one glance away; `lockedIds` are shown but cannot be
// toggled (the host on their own night).

export type MemberPickerMember = {
  id: string;
  name: string;
  image?: string | null;
  accentHex?: string | null;
};

type MemberPickerProps = {
  members: readonly MemberPickerMember[];
  selectedIds: ReadonlySet<string>;
  onToggle: (id: string) => void;
  /** Ids to list first, with `suggestionHint` beside them. */
  suggestedIds?: ReadonlySet<string>;
  suggestionHint?: ReactNode;
  /** Shown but not toggleable. */
  lockedIds?: ReadonlySet<string>;
  /** Accessible name of the search box. */
  searchLabel?: string;
  /** Word for one selected member, for the count line ("invited"). */
  selectedNoun?: string;
  disabled?: boolean;
  /** List height cap; the list scrolls past it. */
  className?: string;
};

export function MemberPicker({
  members,
  selectedIds,
  onToggle,
  suggestedIds,
  suggestionHint = "Suggested",
  lockedIds,
  searchLabel = "Search members",
  selectedNoun = "selected",
  disabled = false,
  className,
}: MemberPickerProps) {
  const [search, setSearch] = useState("");
  const query = search.trim().toLowerCase();

  const ordered = useMemo(() => {
    const matches = members.filter((m) => query === "" || m.name.toLowerCase().includes(query));
    if (!suggestedIds || suggestedIds.size === 0) return matches;
    const first = matches.filter((m) => suggestedIds.has(m.id));
    const rest = matches.filter((m) => !suggestedIds.has(m.id));
    return [...first, ...rest];
  }, [members, query, suggestedIds]);

  const count = members.filter((m) => selectedIds.has(m.id)).length;

  return (
    <div className={cn("flex min-h-0 flex-col gap-1.5", className)}>
      <div className="flex items-center gap-2">
        <SearchInput
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search members…"
          aria-label={searchLabel}
          containerClassName="min-w-0 flex-1"
        />
        <span className="shrink-0 text-2xs font-semibold tabular-nums text-fg-secondary">
          {count} {selectedNoun}
        </span>
      </div>
      <ul className="scrollbar-thin max-h-56 min-h-0 space-y-0.5 overflow-y-auto pr-1">
        {ordered.map((m) => {
          const locked = lockedIds?.has(m.id) ?? false;
          const suggested = suggestedIds?.has(m.id) ?? false;
          return (
            <li key={m.id}>
              <CheckRow
                padding="sm"
                checked={selectedIds.has(m.id)}
                onChange={() => onToggle(m.id)}
                disabled={disabled || locked}
                aria-label={m.name}
                leading={<Avatar name={m.name} image={m.image ?? null} size="xs" />}
                title={m.name}
                description={locked ? "Host" : suggested ? suggestionHint : undefined}
              />
            </li>
          );
        })}
        {ordered.length === 0 && <li className="px-2 py-1.5 text-xs text-fg-muted">No matches</li>}
      </ul>
    </div>
  );
}
