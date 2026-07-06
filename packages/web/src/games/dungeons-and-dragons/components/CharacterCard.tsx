import type { DndCharacter } from "@boardgames/core/protocol";
import { displayCharacterName } from "@boardgames/core/protocol";
import { TrashIcon } from "../../../components/icons";
import { D20Die } from "../../../components/offline/D20Die";
import { Button } from "../../../components/ui";

// One adventurer in the party roster. Ready cards open the ledger entry
// (CharacterSheetModal — where editing and removal live); error cards keep a
// trash button as their cleanup path.

const SERIF = { fontFamily: "ui-serif, Georgia, serif" } as const;

type Props = {
  character: DndCharacter;
  onView: () => void;
  onDelete: () => void;
  deleting: boolean;
};

export function CharacterCard({ character, onView, onDelete, deleting }: Props) {
  if (character.status === "processing") {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-amber-400/20 bg-gradient-to-br from-[#2a0808]/80 via-surface-900/90 to-black/80 p-3">
        <span aria-hidden="true" className="shrink-0">
          <D20Die count={20} className="dnd-die dnd-die-animated h-9 w-9" />
        </span>
        <div className="min-w-0 flex-1">
          <p
            className="animate-pulse-soft truncate text-sm font-semibold text-amber-100"
            style={SERIF}
          >
            The scribes are copying the sheet…
          </p>
          <p className="truncate text-3xs text-amber-200/40">{character.sourceFilename}</p>
        </div>
      </div>
    );
  }

  if (character.status === "error") {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-rose-400/25 bg-gradient-to-br from-[#2a0808]/80 via-surface-900/90 to-black/80 p-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-rose-200">The copying failed</p>
          <p className="truncate text-2xs text-rose-200/70">
            {character.error ?? "The sheet resisted our scribes."}
          </p>
          <p className="truncate text-3xs text-amber-200/40">{character.sourceFilename}</p>
        </div>
        <Button
          variant="ghost"
          size="xs"
          aria-label={`Remove ${character.sourceFilename}`}
          onClick={onDelete}
          disabled={deleting}
          className="shrink-0 text-amber-200/50 hover:text-rose-300"
        >
          <TrashIcon className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  const sheet = character.sheet;
  const shownName = displayCharacterName(sheet, character.sourceFilename);
  return (
    // biome-ignore lint/correctness/noRestrictedElements: full-card click target styled as a party ledger row; Button/Chip chrome doesn't fit.
    <button
      type="button"
      onClick={onView}
      className="flex w-full items-center gap-3 rounded-2xl border border-amber-400/20 bg-gradient-to-br from-[#2a0808]/80 via-surface-900/90 to-black/80 p-3 text-left transition-colors hover:border-amber-400/40"
    >
      <span
        aria-hidden="true"
        className="font-fantasy grid h-10 w-10 shrink-0 place-items-center rounded-full bg-amber-500/20 text-base font-bold text-amber-200 ring-1 ring-amber-400/50"
      >
        {shownName[0]?.toUpperCase() ?? "?"}
      </span>
      <span className="min-w-0 flex-1">
        <span className="font-fantasy block truncate text-base font-bold text-amber-100">
          {shownName}
        </span>
        <span className="block truncate text-2xs text-amber-200/60">
          {[sheet?.race, sheet?.class, sheet?.level !== null ? `Lv ${sheet?.level}` : null]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </span>
      <span className="flex shrink-0 gap-1">
        {sheet?.maxHp !== null && (
          <span className="rounded-full bg-rose-500/15 px-1.5 py-0.5 text-3xs font-bold text-rose-200 ring-1 ring-rose-400/30">
            {sheet?.maxHp} HP
          </span>
        )}
        {sheet?.armorClass !== null && (
          <span className="rounded-full bg-sky-500/15 px-1.5 py-0.5 text-3xs font-bold text-sky-200 ring-1 ring-sky-400/30">
            AC {sheet?.armorClass}
          </span>
        )}
      </span>
    </button>
  );
}
