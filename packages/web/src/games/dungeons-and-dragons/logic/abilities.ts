import type { AbilityKey } from "@boardgames/core/protocol";

// The six ability scores, named once. Four components each declared their own
// map, and they disagreed: three spelled the short form "STR", the character
// sheet spelled it "Str". Both render identically wherever an `uppercase` class
// is applied — but the sheet's skill list prints it raw, so the two spellings
// were visible side by side across screens.
//
// `ABILITY_ABBR` is the canonical short form. `ABILITY_NAME` is the full word;
// the character sheet needs it both as a label and as the key it matches
// saving-throw names against, so it must stay spelled out.

export const ABILITY_ABBR: Record<AbilityKey, string> = {
  str: "STR",
  dex: "DEX",
  con: "CON",
  int: "INT",
  wis: "WIS",
  cha: "CHA",
};

export const ABILITY_NAME: Record<AbilityKey, string> = {
  str: "Strength",
  dex: "Dexterity",
  con: "Constitution",
  int: "Intelligence",
  wis: "Wisdom",
  cha: "Charisma",
};
