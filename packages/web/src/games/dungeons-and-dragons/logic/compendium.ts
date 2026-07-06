// Mock compendium for the character sheet's hoverable terms (weapons, armor,
// tools, languages, …). This will later be backed by an internal database of
// items; for now a hand-seeded map covers the common entries so the hover
// interaction is real. Lookup is case-insensitive and ignores plural "s".

export interface CompendiumEntry {
  title: string;
  kind: string;
  text: string;
}

const ENTRIES: Record<string, CompendiumEntry> = {
  "light armor": {
    title: "Light Armor",
    kind: "Armor category",
    text: "Padded, leather, and studded leather. AC = base + full DEX modifier. Made for skirmishers who'd rather not be hit at all.",
  },
  "medium armor": {
    title: "Medium Armor",
    kind: "Armor category",
    text: "Hide through half plate. AC = base + DEX modifier (max +2). Some sets impose disadvantage on Stealth.",
  },
  "heavy armor": {
    title: "Heavy Armor",
    kind: "Armor category",
    text: "Ring mail through plate. Fixed AC, no DEX bonus, STR minimums, disadvantage on Stealth. You are the wall.",
  },
  "all armor": {
    title: "All Armor",
    kind: "Armor category",
    text: "Proficiency with light, medium, and heavy armor.",
  },
  shield: {
    title: "Shield",
    kind: "Armor",
    text: "+2 AC while wielded. One hand, endless opinions from the rest of the party.",
  },
  "simple weapons": {
    title: "Simple Weapons",
    kind: "Weapon category",
    text: "Clubs, daggers, spears, light crossbows and kin — weapons anyone can pick up without formal training.",
  },
  "martial weapons": {
    title: "Martial Weapons",
    kind: "Weapon category",
    text: "Longswords, battleaxes, longbows and kin — weapons that reward training with better dice.",
  },
  scimitar: {
    title: "Scimitar",
    kind: "Martial melee weapon",
    text: "1d6 slashing · finesse, light. A curved blade favored by duelists and desert riders.",
  },
  shortsword: {
    title: "Shortsword",
    kind: "Martial melee weapon",
    text: "1d6 piercing · finesse, light. The dual-wielder's bread and butter.",
  },
  whip: {
    title: "Whip",
    kind: "Martial melee weapon",
    text: "1d4 slashing · finesse, reach. Ten feet of leather and menace.",
  },
  longsword: {
    title: "Longsword",
    kind: "Martial melee weapon",
    text: "1d8 slashing · versatile (1d10). The knight's default answer to most questions.",
  },
  longbow: {
    title: "Longbow",
    kind: "Martial ranged weapon",
    text: "1d8 piercing · range 150/600, heavy, two-handed. Problems solved from very far away.",
  },
  dagger: {
    title: "Dagger",
    kind: "Simple melee weapon",
    text: "1d4 piercing · finesse, light, thrown (20/60). Everyone should carry three.",
  },
  "thieves' tools": {
    title: "Thieves' Tools",
    kind: "Tool",
    text: "Picks, files, a small mirror, clippers. Proficiency lets you add your bonus to open locks and disarm traps.",
  },
  "smith's tools": {
    title: "Smith's Tools",
    kind: "Tool",
    text: "Hammer, tongs, charcoal. Mend armor, appraise metalwork, and argue with Iron & Oath professionally.",
  },
  "herbalism kit": {
    title: "Herbalism Kit",
    kind: "Tool",
    text: "Clippers, mortar and pestle, pouches. Create antitoxin and potions of healing, identify plants.",
  },
  common: {
    title: "Common",
    kind: "Language",
    text: "The trade tongue nearly everyone speaks. Script: Common.",
  },
  elvish: {
    title: "Elvish",
    kind: "Language",
    text: "Fluid, with subtle intonations and intricate grammar. Elven literature is rich and varied.",
  },
  dwarvish: {
    title: "Dwarvish",
    kind: "Language",
    text: "Full of hard consonants and guttural sounds. Script: Dwarvish runes.",
  },
  "thieves' cant": {
    title: "Thieves' Cant",
    kind: "Language",
    text: "A secret mix of dialect, jargon, and code. Conveys hidden messages in seemingly normal conversation — at a quarter of normal speaking speed.",
  },
  "chain mail": {
    title: "Chain Mail",
    kind: "Heavy armor",
    text: "AC 16 · STR 13 · disadvantage on Stealth. Interlocking rings over a quilted layer.",
  },
};

function normalizeKey(name: string): string {
  return name.trim().toLowerCase().replace(/\.$/, "");
}

export function getCompendiumEntry(name: string): CompendiumEntry | null {
  const key = normalizeKey(name);
  return ENTRIES[key] ?? ENTRIES[key.replace(/s$/, "")] ?? null;
}
