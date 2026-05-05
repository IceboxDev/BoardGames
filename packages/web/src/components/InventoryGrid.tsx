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
 * Inventory toggle grid with family grouping. Singletons render as today;
 * families render as a header block with the variant cells indented beneath
 * (each variant remains independently checkable). Same checkbox semantics
 * as before — server payload is unchanged.
 */
export default function InventoryGrid({ selected, onToggle, games: input = games }: Props) {
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const units = useMemo(() => groupForPresentation(input), [input]);

  return (
    <div className="space-y-4">
      {units.map((unit) => {
        if (unit.kind === "single") {
          return (
            <div
              key={unit.game.slug}
              className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4"
            >
              <InventoryCell
                game={unit.game}
                checked={selectedSet.has(unit.game.slug)}
                onToggle={() => onToggle(unit.game.slug)}
              />
            </div>
          );
        }
        return (
          <FamilyBlock
            key={unit.family.id}
            family={unit.family}
            visibleMembers={unit.visibleMembers}
            selectedSet={selectedSet}
            onToggle={onToggle}
          />
        );
      })}
    </div>
  );
}

function FamilyBlock({
  family,
  visibleMembers,
  selectedSet,
  onToggle,
}: {
  family: FamilyInfo;
  visibleMembers: GameDefinition[];
  selectedSet: Set<string>;
  onToggle: (slug: string) => void;
}) {
  const ownedCount = visibleMembers.filter((m) => selectedSet.has(m.slug)).length;
  return (
    <div
      className="rounded-xl border border-[var(--accent)]/20 bg-[color-mix(in_srgb,var(--accent)_3%,var(--color-surface-900))] p-2"
      style={{ "--accent": family.canonical.accentHex } as React.CSSProperties}
    >
      <div className="mb-2 flex items-center justify-between gap-2 px-1">
        <span className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--accent)]">
          {family.canonical.title}
        </span>
        <span className="text-[10px] uppercase tracking-[0.16em] text-gray-500">
          {ownedCount} / {visibleMembers.length} owned
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {visibleMembers.map((member) => (
          <InventoryCell
            key={member.slug}
            game={member}
            checked={selectedSet.has(member.slug)}
            onToggle={() => onToggle(member.slug)}
            variantLabel={member.family?.variant}
          />
        ))}
      </div>
    </div>
  );
}

function InventoryCell({
  game,
  checked,
  onToggle,
  variantLabel,
}: {
  game: GameDefinition;
  checked: boolean;
  onToggle: () => void;
  /** When set, shown as the secondary line in place of the slug. */
  variantLabel?: string;
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
        <span className="block truncate font-semibold text-gray-200">
          {variantLabel ?? game.title}
        </span>
        <span className="block truncate text-[10px] text-gray-500">
          {variantLabel ? game.title : game.slug}
        </span>
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
