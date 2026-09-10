import type { AdminUser } from "@boardgames/core/protocol";
import { useState } from "react";
import { Avatar } from "../ui/Avatar";
import { Button } from "../ui/Button";
import { SearchInput } from "../ui/SearchInput";
import { SelectableCard } from "../ui/SelectableCard";
import { Surface } from "../ui/Surface";

// Who bought the game: a single-pick member list. Collapses to the chosen
// member with a "Change" button once picked (the avatar modal's game-picker
// idiom), so three picked games don't stack three member lists.

type Props = {
  members: readonly AdminUser[];
  value: string | null;
  onChange: (userId: string) => void;
  /** Accessible name of the search box — one per picked game. */
  searchLabel?: string;
};

export function PurchaserPicker({
  members,
  value,
  onChange,
  searchLabel = "Search members",
}: Props) {
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(value === null);
  const chosen = value === null ? undefined : members.find((m) => m.id === value);

  if (chosen && !expanded) {
    return (
      <Surface variant="tile" padding="none" className="flex items-center gap-2.5 px-3 py-2">
        <Avatar name={chosen.name} image={chosen.image} size="xs" />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-fg-primary">
          {chosen.name}
        </span>
        <Button variant="ghost" size="xs" onClick={() => setExpanded(true)}>
          Change
        </Button>
      </Surface>
    );
  }

  const query = search.trim().toLowerCase();
  const options = members.filter((m) => query === "" || m.name.toLowerCase().includes(query));

  return (
    <div className="flex flex-col gap-1.5">
      <SearchInput
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search members…"
        aria-label={searchLabel}
      />
      <ul className="scrollbar-thin max-h-48 space-y-0.5 overflow-y-auto pr-1">
        {options.map((m) => (
          <li key={m.id}>
            <SelectableCard
              variant="row"
              padding="sm"
              selected={m.id === value}
              aria-label={m.name}
              onClick={() => {
                onChange(m.id);
                setExpanded(false);
                setSearch("");
              }}
            >
              <Avatar name={m.name} image={m.image} size="xs" />
              <span className="min-w-0 flex-1 truncate text-xs font-semibold text-fg-primary">
                {m.name}
              </span>
            </SelectableCard>
          </li>
        ))}
        {options.length === 0 && <li className="px-2 py-1.5 text-xs text-fg-muted">No matches</li>}
      </ul>
    </div>
  );
}
