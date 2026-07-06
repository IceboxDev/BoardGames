// Mock spell compendium backing the character sheet's Spellbook page. Like
// the item compendium, this will later come from an internal database; the
// seeded entries make the page real today. Lookup is case-insensitive.

export interface SpellEntry {
  name: string;
  level: number; // 0 = cantrip
  school: string;
  castingTime: string;
  range: string;
  components: string;
  duration: string;
  /** Damage/healing line, when the spell has one. */
  damage: string | null;
  text: string;
}

const SPELLS: Record<string, SpellEntry> = {
  bless: {
    name: "Bless",
    level: 1,
    school: "Enchantment",
    castingTime: "1 action",
    range: "30 feet",
    components: "V, S, M (a sprinkling of holy water)",
    duration: "Concentration, up to 1 minute",
    damage: null,
    text: "Bless up to three creatures of your choice within range. Whenever a target makes an attack roll or a saving throw before the spell ends, it adds 1d4 to the roll.",
  },
  "shield of faith": {
    name: "Shield of Faith",
    level: 1,
    school: "Abjuration",
    castingTime: "1 bonus action",
    range: "60 feet",
    components: "V, S, M (a small parchment with holy text)",
    duration: "Concentration, up to 10 minutes",
    damage: null,
    text: "A shimmering field appears and surrounds a creature of your choice within range, granting it a +2 bonus to AC for the duration.",
  },
  "cure wounds": {
    name: "Cure Wounds",
    level: 1,
    school: "Evocation",
    castingTime: "1 action",
    range: "Touch",
    components: "V, S",
    duration: "Instantaneous",
    damage: "Heals 1d8 + spellcasting modifier (+1d8 per slot level above 1st)",
    text: "A creature you touch regains hit points. This spell has no effect on undead or constructs.",
  },
  "thunderous smite": {
    name: "Thunderous Smite",
    level: 1,
    school: "Evocation",
    castingTime: "1 bonus action",
    range: "Self",
    components: "V",
    duration: "Concentration, up to 1 minute",
    damage: "+2d6 thunder on your next melee weapon hit",
    text: "On your next hit, the weapon rings with thunder audible within 300 feet; the target takes an extra 2d6 thunder damage and must succeed on a STR save or be pushed 10 feet and knocked prone.",
  },
  "mage hand": {
    name: "Mage Hand",
    level: 0,
    school: "Conjuration",
    castingTime: "1 action",
    range: "30 feet",
    components: "V, S",
    duration: "1 minute",
    damage: null,
    text: "A spectral floating hand appears at a point within range. You can use your action to control it: manipulate objects, open doors, retrieve items — up to 10 pounds.",
  },
  "minor illusion": {
    name: "Minor Illusion",
    level: 0,
    school: "Illusion",
    castingTime: "1 action",
    range: "30 feet",
    components: "S, M (a bit of fleece)",
    duration: "1 minute",
    damage: null,
    text: "You create a sound or an image of an object within range. Physical interaction reveals the image is an illusion; an Investigation check against your spell save DC discerns it.",
  },
  "disguise self": {
    name: "Disguise Self",
    level: 1,
    school: "Illusion",
    castingTime: "1 action",
    range: "Self",
    components: "V, S",
    duration: "1 hour",
    damage: null,
    text: "You make yourself — clothing, armor, weapons and all — look different until the spell ends. Up to 1 foot taller or shorter, thin, fat, or in between.",
  },
  "sacred flame": {
    name: "Sacred Flame",
    level: 0,
    school: "Evocation",
    castingTime: "1 action",
    range: "60 feet",
    components: "V, S",
    duration: "Instantaneous",
    damage: "1d8 radiant (DEX save negates)",
    text: "Flame-like radiance descends on a creature you can see; it gains no benefit from cover for this save.",
  },
  "healing word": {
    name: "Healing Word",
    level: 1,
    school: "Evocation",
    castingTime: "1 bonus action",
    range: "60 feet",
    components: "V",
    duration: "Instantaneous",
    damage: "Heals 1d4 + spellcasting modifier",
    text: "A creature of your choice you can see regains hit points. No effect on undead or constructs.",
  },
};

export function listSpellNames(): string[] {
  return Object.values(SPELLS).map((s) => s.name);
}

export function getSpellEntry(name: string): SpellEntry | null {
  return SPELLS[name.trim().toLowerCase()] ?? null;
}

export function spellLevelLabel(level: number): string {
  if (level === 0) return "Cantrip";
  const suffix = level === 1 ? "st" : level === 2 ? "nd" : level === 3 ? "rd" : "th";
  return `${level}${suffix} level`;
}
