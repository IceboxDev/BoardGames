import { useMemo } from "react";
import { type FamilyInfo, groupForPresentation } from "../games/families";
import { games } from "../games/registry";
import type { GameDefinition } from "../games/types";

type Props = {
  /** Currently-checked slugs. */
  selected: string[];
  /** Called with a slug when its checkbox is toggled. */
  onToggle: (slug: string) => void;
  /** Optional: restrict to a subset of games (e.g. only those a particular
   * user can choose from). Defaults to the full registry. */
  games?: GameDefinition[];
};

/**
 * Inventory toggle grid. Family sections at the top (one section per family
 * with its display name as a header), then a single shared grid for every
 * singleton at the bottom. Cells use neutral chrome with the global accent
 * for checked state — family identity is communicated by the section
 * header, not by per-cell color.
 */
export default function InventoryGrid({ selected, onToggle, games: input = games }: Props) {
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const { familyGroups, singletons } = useMemo(() => {
    const units = groupForPresentation(input);
    const fGroups: { family: FamilyInfo; members: GameDefinition[] }[] = [];
    const single: GameDefinition[] = [];
    for (const unit of units) {
      if (unit.kind === "family") {
        fGroups.push({ family: unit.family, members: unit.visibleMembers });
      } else {
        single.push(unit.game);
      }
    }
    return { familyGroups: fGroups, singletons: single };
  }, [input]);

  return (
    <div className="space-y-5">
      {familyGroups.map(({ family, members }) => {
        const owned = members.filter((m) => selectedSet.has(m.slug)).length;
        return (
          <section key={family.id}>
            <h3 className="mb-2 flex items-baseline gap-2 px-1 text-[11px] font-bold uppercase tracking-[0.18em] text-gray-400">
              <span>{family.displayName}</span>
              <span className="text-[10px] font-normal tracking-[0.14em] text-gray-500">
                {owned} / {members.length} owned
              </span>
            </h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {members.map((g) => (
                <InventoryCell
                  key={g.slug}
                  game={g}
                  checked={selectedSet.has(g.slug)}
                  onToggle={() => onToggle(g.slug)}
                />
              ))}
            </div>
          </section>
        );
      })}

      {singletons.length > 0 && (
        <section>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {singletons.map((g) => (
              <InventoryCell
                key={g.slug}
                game={g}
                checked={selectedSet.has(g.slug)}
                onToggle={() => onToggle(g.slug)}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function InventoryCell({
  game,
  checked,
  onToggle,
}: {
  game: GameDefinition;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <label
      className={`flex cursor-pointer items-center gap-3 rounded-lg border p-2 transition ${
        checked
          ? "border-accent-400/50 bg-accent-500/10"
          : "border-white/10 bg-surface-800/50 hover:border-white/20"
      }`}
    >
      <input type="checkbox" checked={checked} onChange={onToggle} className="sr-only" />
      <img
        src={game.thumbnail}
        alt=""
        loading="lazy"
        decoding="async"
        className="h-10 w-10 shrink-0 rounded object-cover"
      />
      <span className="min-w-0 flex-1 text-xs">
        <span className="block truncate font-semibold text-gray-200">{game.title}</span>
        <span className="block truncate text-[10px] text-gray-500">{game.slug}</span>
      </span>
      {checked && (
        <svg
          viewBox="0 0 20 20"
          fill="currentColor"
          className="h-4 w-4 shrink-0 text-accent-300"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M16.704 5.29a1 1 0 010 1.42l-7.5 7.5a1 1 0 01-1.41 0l-3.5-3.5a1 1 0 011.41-1.42L8.5 12.08l6.79-6.79a1 1 0 011.414 0z"
            clipRule="evenodd"
          />
        </svg>
      )}
    </label>
  );
}
