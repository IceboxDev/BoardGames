import type { CharacterSheet } from "@boardgames/core/protocol";

// Stats derived from a character sheet, shared by the party overview cards
// and the combat view. Derivations, never transcriptions.

export function mod(score: number): number {
  return Math.floor((score - 10) / 2);
}

/**
 * Ability modifier for a score that may be missing — a monster row with no
 * recorded DEX, an old character sheet without an ability block.
 *
 * Returns 0 (no bonus), NOT `mod(10)`. Those happen to be the same number, but
 * they mean different things: "this creature has no recorded DEX, so add
 * nothing to its initiative" is not "this creature has DEX 10". Keeping the
 * guard explicit stops a future edit from `?? 10`-ing a missing score into a
 * real one.
 */
export function modOrZero(score: number | null | undefined): number {
  return score === null || score === undefined ? 0 : mod(score);
}

export function fmt(value: number): string {
  return value >= 0 ? `+${value}` : `${value}`;
}

/** 10 + Perception skill mod (carries prof); 10 + WIS mod only for old rows
 * without a skill list. */
export function passivePerception(sheet: CharacterSheet): number | null {
  const perception = sheet.skills.find((s) => s.name === "Perception");
  if (perception) return 10 + perception.modifier;
  return sheet.abilities ? 10 + mod(sheet.abilities.wis) : null;
}

export function proficiencyBonus(level: number | null): number | null {
  return level === null ? null : 2 + Math.floor((level - 1) / 4);
}

/** "30 ft. (walking)" → "30" for tight stat tiles. */
export function shortSpeed(speed: string): string {
  return speed.replace(/\s*(ft|feet)\.?.*$/i, "");
}
