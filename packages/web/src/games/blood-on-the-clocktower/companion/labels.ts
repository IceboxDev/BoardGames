// Non-component helpers shared by the companion screens (split from
// common.tsx so component files stay Fast-Refresh clean).

import type { CharacterType } from "@boardgames/core/games/blood-on-the-clocktower/characters";
import { CHARACTERS } from "@boardgames/core/games/blood-on-the-clocktower/characters";
import type { CompanionPlayer } from "@boardgames/core/games/blood-on-the-clocktower/companion";

export const TYPE_LABEL: Record<CharacterType, string> = {
  townsfolk: "Townsfolk",
  outsider: "Outsider",
  minion: "Minion",
  demon: "Demon",
};

export const TYPE_TEXT: Record<CharacterType, string> = {
  townsfolk: "text-sky-300",
  outsider: "text-cyan-300",
  minion: "text-rose-300",
  demon: "text-red-400",
};

/** "Imp", or "Drunk (thinks Monk)" — the Storyteller-facing character label. */
export function trueCharacterLabel(p: CompanionPlayer): string {
  const base = CHARACTERS[p.character].name;
  return p.believedCharacter ? `${base} (thinks ${CHARACTERS[p.believedCharacter].name})` : base;
}
