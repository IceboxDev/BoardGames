import { CARD_DECKS, isDeckGameSlug } from "@boardgames/core/games/card-decks";
import { EXIT_CATALOG_SLUG, EXIT_GAMES, exitGameTitle } from "@boardgames/core/games/exit-games";
import { useMemo, useState } from "react";
import { games } from "../../games/registry";
import { resolveInventoryEntry } from "../../lib/resolve-inventory-entry.ts";
import { SearchInput } from "../ui/SearchInput.tsx";
import { SelectableCard } from "../ui/SelectableCard.tsx";

// Searchable picker over every directly-ownable slug: catalog games (minus
// the derived-ownership entries — the EXIT anchor and deck-unlocked card
// games), individual EXIT boxes, and the two card decks. Shared by the
// announce modal and the admin resolve flow.

interface PickerOption {
  slug: string;
  title: string;
  detail: string | null;
  thumbnail: string | null;
}

const ALL_OPTIONS: PickerOption[] = [
  ...games
    .filter((g) => g.slug !== EXIT_CATALOG_SLUG && !isDeckGameSlug(g.slug))
    .map((g) => ({ slug: g.slug, title: g.title, detail: null, thumbnail: g.thumbnail })),
  ...EXIT_GAMES.map((box) => ({
    slug: box.slug,
    title: exitGameTitle(box),
    detail: `EXIT · ${box.year}`,
    thumbnail: null,
  })),
  ...CARD_DECKS.map((deck) => ({
    slug: deck.slug,
    title: deck.label,
    detail: deck.suits,
    thumbnail: null,
  })),
].sort((a, b) => a.title.localeCompare(b.title));

export function GamePicker({
  excludeSlugs,
  onPick,
  pickedSlug,
}: {
  /** Slugs to hide (already owned / already announced). */
  excludeSlugs?: ReadonlySet<string>;
  onPick: (slug: string) => void;
  /** Currently chosen slug (row gets a selected treatment). */
  pickedSlug?: string | null;
}) {
  const [search, setSearch] = useState("");

  // No result cap: an arbitrary top-N reads as a broken list (it once cut the
  // EXIT boxes to whichever ~10 fell inside the alphabetical window). The
  // full set is ~160 rows inside a scroll container — trivial to render.
  const options = useMemo(() => {
    const query = search.trim().toLowerCase();
    return ALL_OPTIONS.filter((option) => {
      if (excludeSlugs?.has(option.slug)) return false;
      return query === "" || option.title.toLowerCase().includes(query);
    });
  }, [search, excludeSlugs]);

  return (
    <div className="flex flex-col gap-2">
      <SearchInput
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search games, EXIT boxes, decks…"
        aria-label="Search ownable games"
      />
      <ul className="scrollbar-thin max-h-64 space-y-0.5 overflow-y-auto pr-1">
        {options.map((option) => {
          const entry = resolveInventoryEntry(option.slug);
          const picked = pickedSlug === option.slug;
          return (
            <li key={option.slug}>
              <SelectableCard
                variant="row"
                padding="sm"
                selected={picked}
                onClick={() => onPick(option.slug)}
              >
                {entry.thumbnail ? (
                  <img src={entry.thumbnail} alt="" className="h-7 w-12 rounded object-cover" />
                ) : (
                  <span className="flex h-7 w-12 items-center justify-center rounded bg-surface-800 text-2xs font-bold text-fg-muted">
                    {option.title.slice(0, 1)}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-fg-primary">{option.title}</span>
                  {option.detail && (
                    <span className="block text-3xs text-fg-muted">{option.detail}</span>
                  )}
                </span>
              </SelectableCard>
            </li>
          );
        })}
        {options.length === 0 && (
          <li className="px-2 py-3 text-center text-xs text-fg-muted">No matches</li>
        )}
      </ul>
    </div>
  );
}
