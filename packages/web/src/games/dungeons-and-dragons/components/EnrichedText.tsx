import type { DndCharacter, DndNpc } from "@boardgames/core/protocol";
import { displayCharacterName } from "@boardgames/core/protocol";
import type { ReactNode } from "react";
import { listCompendiumTerms } from "../logic/compendium";
import { listSpellNames } from "../logic/spellbook";
import { HoverTerm } from "./HoverTerm";

// Wiki-style enrichment for history text: PC and NPC names become links that
// open their sheets, item/spell terms become hover-compendium entries.
// Matching is case-insensitive on whole words, longest names first.

type Entity =
  | { kind: "pc"; name: string; character: DndCharacter }
  | { kind: "npc"; name: string; npc: DndNpc }
  | { kind: "term"; name: string };

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function buildEntityIndex(
  party: DndCharacter[],
  npcs: DndNpc[],
): { entities: Map<string, Entity>; pattern: RegExp | null } {
  const entities = new Map<string, Entity>();
  for (const character of party) {
    if (!character.sheet) continue;
    const name = displayCharacterName(character.sheet, character.sourceFilename);
    entities.set(name.toLowerCase(), { kind: "pc", name, character });
  }
  for (const npc of npcs) {
    entities.set(npc.name.toLowerCase(), { kind: "npc", name: npc.name, npc });
  }
  for (const term of [...listCompendiumTerms(), ...listSpellNames()]) {
    if (!entities.has(term.toLowerCase())) {
      entities.set(term.toLowerCase(), { kind: "term", name: term });
    }
  }
  if (entities.size === 0) return { entities, pattern: null };
  const names = [...entities.values()]
    .map((e) => e.name)
    .sort((a, b) => b.length - a.length)
    .map(escapeRegex);
  return { entities, pattern: new RegExp(`\\b(${names.join("|")})\\b`, "gi") };
}

type Props = {
  text: string;
  entities: Map<string, Entity>;
  pattern: RegExp | null;
  onOpenCharacter: (character: DndCharacter) => void;
  onOpenNpc: (npc: DndNpc) => void;
};

export function EnrichedText({ text, entities, pattern, onOpenCharacter, onOpenNpc }: Props) {
  if (!pattern) return <>{text}</>;
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  pattern.lastIndex = 0;
  let match = pattern.exec(text);
  let key = 0;
  while (match) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    const entity = entities.get(match[0].toLowerCase());
    if (!entity) {
      parts.push(match[0]);
    } else if (entity.kind === "term") {
      parts.push(<HoverTerm key={key++} term={match[0]} />);
    } else {
      const onClick =
        entity.kind === "pc"
          ? () => onOpenCharacter(entity.character)
          : () => onOpenNpc(entity.npc);
      parts.push(
        // biome-ignore lint/correctness/noRestrictedElements: inline wiki-link inside running narration — Button chrome cannot sit mid-sentence.
        <button
          key={key++}
          type="button"
          onClick={onClick}
          className={`rounded-sm text-left font-semibold underline decoration-dotted underline-offset-2 outline-none focus-visible:ring-1 focus-visible:ring-amber-400/60 ${
            entity.kind === "pc"
              ? "text-amber-200 decoration-amber-400/60"
              : "text-purple-200 decoration-purple-400/60"
          }`}
        >
          {match[0]}
        </button>,
      );
    }
    lastIndex = match.index + match[0].length;
    match = pattern.exec(text);
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return <>{parts}</>;
}
