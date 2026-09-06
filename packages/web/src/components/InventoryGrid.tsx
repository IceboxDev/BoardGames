import { useMemo } from "react";
import { type FamilyInfo, groupForPresentation } from "../games/families";
import { games } from "../games/registry";
import type { GameDefinition } from "../games/types";
import { CheckRow } from "./ui/CheckRow";

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
            <h3 className="mb-2 flex items-baseline gap-2 px-1 text-2xs font-bold uppercase tracking-pill text-fg-secondary">
              <span>{family.displayName}</span>
              <span className="text-3xs font-normal tracking-label text-fg-muted">
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
    <CheckRow
      checked={checked}
      onChange={onToggle}
      leading={
        <img
          src={game.thumbnail}
          alt=""
          loading="lazy"
          decoding="async"
          className="h-10 w-10 shrink-0 rounded object-cover"
        />
      }
      title={game.title}
      description={game.slug}
    />
  );
}
