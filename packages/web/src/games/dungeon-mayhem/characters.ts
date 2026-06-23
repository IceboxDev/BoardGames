// Dungeon Mayhem sets and their hero rosters. Single source of truth shared by
// the match-variant "sets in play" picker (`match-variants.ts`) and the
// per-player hero selector (`DungeonMayhemForm`).
//
// Dungeon Mayhem is recorded as an elimination (last-standing) match: each
// player is tagged with the hero they played (`role`) and is eliminated in
// order when their deck is knocked out; whoever's left standing wins. The sets
// in play are picked as a multi-select edition (like 7 Wonders expansions),
// persisted in `outcome.scenario` (e.g. "Standard + Monster Madness", shown as
// the italic MatchCard subtitle), and decide which heroes are selectable.

export const DUNGEON_MAYHEM_SETS = {
  // Base game: barbarian / wizard / paladin / rogue.
  Standard: ["Sutha", "Azzan", "Lia", "Oriax"],
  // Battle for Baldur's Gate expansion adds two heroes.
  "Battle for Baldur's Gate": ["Jaheira", "Minsc & Boo"],
  // Monster Madness expansion: play as the monsters.
  "Monster Madness": [
    "Lord Cinderpuff",
    "Hoots McGoots",
    "Dr. Tentaculous",
    "Blorp",
    "Delilah Deathray",
    "Mimi LeChaise",
  ],
} as const satisfies Record<string, readonly string[]>;

export type DungeonMayhemSet = keyof typeof DUNGEON_MAYHEM_SETS;

export const DUNGEON_MAYHEM_SET_LABELS = Object.keys(DUNGEON_MAYHEM_SETS) as DungeonMayhemSet[];

function isSet(value: string): value is DungeonMayhemSet {
  return value in DUNGEON_MAYHEM_SETS;
}

/**
 * Heroes selectable for the given set selection (the parsed multi-variant
 * `scenario`, e.g. ["Standard", "Monster Madness"]). Returns the union of the
 * selected sets' heroes in canonical set order (Standard → Baldur's Gate →
 * Monster Madness). Falls back to ALL heroes when nothing valid is selected, so
 * the form is usable before the admin checks a set (mirrors `villainsForEdition`).
 */
export function heroesForSets(setNames: readonly string[]): readonly string[] {
  const selected = setNames.filter(isSet);
  const active = selected.length > 0 ? selected : DUNGEON_MAYHEM_SET_LABELS;
  const heroes: string[] = [];
  for (const label of DUNGEON_MAYHEM_SET_LABELS) {
    if (!active.includes(label)) continue;
    for (const hero of DUNGEON_MAYHEM_SETS[label]) {
      if (!heroes.includes(hero)) heroes.push(hero);
    }
  }
  return heroes;
}
