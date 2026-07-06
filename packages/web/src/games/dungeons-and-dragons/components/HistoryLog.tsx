import type { DndCharacter, DndHistoryEntry, DndNpc } from "@boardgames/core/protocol";
import { useMemo } from "react";
import { D20Die } from "../../../components/offline/D20Die";
import { EmptyState } from "../../../components/ui";
import { buildEntityIndex, EnrichedText } from "./EnrichedText";

// The History page: the session log rendered as a book. Player actions read
// as stage directions, DM narration as serif prose, combat as marked blocks.
// Names and items in the text are wiki-linked to their sheets/compendium
// entries. After the campaign, this page IS the campaign.

const SERIF = { fontFamily: "ui-serif, Georgia, serif" } as const;

type Props = {
  entries: DndHistoryEntry[];
  party: DndCharacter[];
  npcs: DndNpc[];
  onOpenCharacter: (character: DndCharacter) => void;
  onOpenNpc: (npc: DndNpc) => void;
};

export function HistoryLog({ entries, party, npcs, onOpenCharacter, onOpenNpc }: Props) {
  const { entities, pattern } = useMemo(() => buildEntityIndex(party, npcs), [party, npcs]);

  if (entries.length === 0) {
    return (
      <EmptyState
        tone="amber"
        fill
        icon={<D20Die count={20} className="h-6 w-6" />}
        title="The chronicle is unwritten"
        description="Press Log on any spoken text — arrivals, node narrations, combat — and it is recorded here, in order, as the party lived it."
      />
    );
  }

  const enrich = (text: string) => (
    <EnrichedText
      text={text}
      entities={entities}
      pattern={pattern}
      onOpenCharacter={onOpenCharacter}
      onOpenNpc={onOpenNpc}
    />
  );

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 pb-6">
      {entries.map((entry) => {
        if (entry.kind === "player-action") {
          return (
            <p key={entry.id} className="text-sm italic text-amber-300/70" style={SERIF}>
              ▸ The party: {enrich(entry.text)}
            </p>
          );
        }
        if (entry.kind === "arrival") {
          return (
            <p
              key={entry.id}
              className="font-fantasy mt-3 border-b border-amber-400/20 pb-1 text-sm font-bold uppercase tracking-[0.2em] text-amber-300/80"
            >
              {enrich(entry.text)}
            </p>
          );
        }
        if (entry.kind === "combat") {
          return (
            <div
              key={entry.id}
              className="rounded-xl border border-rose-400/30 bg-rose-950/20 px-3.5 py-2.5"
            >
              <p
                className="text-3xs font-bold uppercase tracking-[0.25em] text-rose-300/80"
                style={SERIF}
              >
                Combat
              </p>
              <p className="mt-1 text-sm leading-relaxed text-rose-100/85" style={SERIF}>
                {enrich(entry.text)}
              </p>
            </div>
          );
        }
        return (
          <p
            key={entry.id}
            className="whitespace-pre-line text-base leading-relaxed text-amber-100/90"
            style={SERIF}
          >
            {enrich(entry.text)}
          </p>
        );
      })}
    </div>
  );
}
