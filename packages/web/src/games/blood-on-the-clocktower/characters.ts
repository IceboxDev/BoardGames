/**
 * Character catalog for the three base-set editions of Blood on the Clocktower.
 * The match-history form uses these to assign characters to players and to
 * auto-derive their alignment (Good = Townsfolk + Outsider; Evil = Minion +
 * Demon). Character names are stored verbatim on `TeamMember.role`, so the
 * spelling here is the wire-stable identifier — adjust with care if the
 * official wiki ever renames a character.
 */

export type ClocktowerEdition = "trouble-brewing" | "bad-moon-rising" | "sects-and-violets";

export type ClocktowerCategory = "townsfolk" | "outsider" | "minion" | "demon";

export type ClocktowerCharacter = {
  name: string;
  edition: ClocktowerEdition;
  category: ClocktowerCategory;
};

export const CLOCKTOWER_EDITIONS: ReadonlyArray<{ id: ClocktowerEdition; label: string }> = [
  { id: "trouble-brewing", label: "Trouble Brewing" },
  { id: "bad-moon-rising", label: "Bad Moon Rising" },
  { id: "sects-and-violets", label: "Sects & Violets" },
];

export const CLOCKTOWER_CATEGORY_LABELS: Record<ClocktowerCategory, string> = {
  townsfolk: "Townsfolk",
  outsider: "Outsiders",
  minion: "Minions",
  demon: "Demons",
};

const TROUBLE_BREWING: Record<ClocktowerCategory, string[]> = {
  townsfolk: [
    "Washerwoman",
    "Librarian",
    "Investigator",
    "Chef",
    "Empath",
    "Fortune Teller",
    "Undertaker",
    "Monk",
    "Ravenkeeper",
    "Virgin",
    "Slayer",
    "Soldier",
    "Mayor",
  ],
  outsider: ["Butler", "Saint", "Recluse", "Drunk"],
  minion: ["Poisoner", "Spy", "Baron", "Scarlet Woman"],
  demon: ["Imp"],
};

const BAD_MOON_RISING: Record<ClocktowerCategory, string[]> = {
  townsfolk: [
    "Grandmother",
    "Sailor",
    "Chambermaid",
    "Exorcist",
    "Innkeeper",
    "Gambler",
    "Gossip",
    "Courtier",
    "Professor",
    "Minstrel",
    "Tea Lady",
    "Pacifist",
    "Fool",
  ],
  outsider: ["Goon", "Lunatic", "Tinker", "Moonchild"],
  minion: ["Godfather", "Devil's Advocate", "Assassin", "Mastermind"],
  demon: ["Zombuul", "Pukka", "Shabaloth", "Po"],
};

const SECTS_AND_VIOLETS: Record<ClocktowerCategory, string[]> = {
  townsfolk: [
    "Clockmaker",
    "Dreamer",
    "Snake Charmer",
    "Mathematician",
    "Flowergirl",
    "Town Crier",
    "Oracle",
    "Savant",
    "Seamstress",
    "Philosopher",
    "Artist",
    "Juggler",
    "Sage",
  ],
  outsider: ["Mutant", "Sweetheart", "Barber", "Klutz"],
  minion: ["Evil Twin", "Witch", "Cerenovus", "Pit-Hag"],
  demon: ["Fang Gu", "Vigormortis", "No Dashii", "Vortox"],
};

const EDITION_TABLE: Record<ClocktowerEdition, Record<ClocktowerCategory, string[]>> = {
  "trouble-brewing": TROUBLE_BREWING,
  "bad-moon-rising": BAD_MOON_RISING,
  "sects-and-violets": SECTS_AND_VIOLETS,
};

export const CLOCKTOWER_CHARACTERS: ClocktowerCharacter[] = (
  Object.entries(EDITION_TABLE) as Array<[ClocktowerEdition, Record<ClocktowerCategory, string[]>]>
).flatMap(([edition, byCategory]) =>
  (Object.entries(byCategory) as Array<[ClocktowerCategory, string[]]>).flatMap(
    ([category, names]) => names.map((name) => ({ name, edition, category })),
  ),
);

const BY_NAME = new Map(CLOCKTOWER_CHARACTERS.map((c) => [c.name, c] as const));

export function findClocktowerCharacter(
  name: string | undefined | null,
): ClocktowerCharacter | null {
  if (!name) return null;
  return BY_NAME.get(name) ?? null;
}

export function clocktowerAlignment(category: ClocktowerCategory): "good" | "evil" {
  return category === "townsfolk" || category === "outsider" ? "good" : "evil";
}

/**
 * Look at the roles already assigned in a match and return the edition they
 * came from, if all assigned roles are from the same one. Used to surface the
 * right edition tab when an existing Clocktower record is opened for edit.
 */
export function detectClocktowerEdition(
  roles: ReadonlyArray<string | undefined>,
): ClocktowerEdition | null {
  const seen = new Set<ClocktowerEdition>();
  for (const r of roles) {
    const c = findClocktowerCharacter(r);
    if (c) seen.add(c.edition);
  }
  if (seen.size === 1) return [...seen][0];
  return null;
}

/**
 * Group an edition's characters by category in a stable display order
 * (Townsfolk → Outsiders → Minions → Demons). Pre-built per edition so the
 * dropdown doesn't recompute on every render.
 */
export function charactersByCategory(
  edition: ClocktowerEdition,
): ReadonlyArray<{ category: ClocktowerCategory; label: string; names: ReadonlyArray<string> }> {
  const order: ClocktowerCategory[] = ["townsfolk", "outsider", "minion", "demon"];
  return order.map((category) => ({
    category,
    label: CLOCKTOWER_CATEGORY_LABELS[category],
    names: EDITION_TABLE[edition][category],
  }));
}

// ── Fabled ────────────────────────────────────────────────────────────
// Fabled are Storyteller-only characters that alter how the game runs
// (accessibility, custom scripts, experimental rules). They aren't tied to
// an edition, can't die, and don't count for either team's victory — so they
// live on the optional `moderator` slot, not inside Good/Evil.

export type FabledGroup = "social" | "custom" | "experimental";

export const FABLED_GROUP_LABELS: Record<FabledGroup, string> = {
  social: "Social Interactions & Accessibility",
  custom: "Custom Scripts",
  experimental: "Experimental",
};

const FABLED_BY_GROUP: Record<FabledGroup, string[]> = {
  social: [
    "Angel",
    "Buddhist",
    "Doomsayer",
    "Fiddler",
    "Hell's Librarian",
    "Revolutionary",
    "Toymaker",
  ],
  custom: ["Djinn", "Duchess", "Fibbin", "Sentinel", "Spirit of Ivory"],
  experimental: ["Deus ex Fiasco", "Ferryman"],
};

export const FABLED_CHARACTERS: ReadonlyArray<{ name: string; group: FabledGroup }> = (
  Object.entries(FABLED_BY_GROUP) as Array<[FabledGroup, string[]]>
).flatMap(([group, names]) => names.map((name) => ({ name, group })));

const FABLED_NAMES = new Set(FABLED_CHARACTERS.map((c) => c.name));

export function isFabled(name: string | undefined | null): boolean {
  return name != null && FABLED_NAMES.has(name);
}

export function fabledByGroup(): ReadonlyArray<{
  group: FabledGroup;
  label: string;
  names: ReadonlyArray<string>;
}> {
  const order: FabledGroup[] = ["social", "custom", "experimental"];
  return order.map((group) => ({
    group,
    label: FABLED_GROUP_LABELS[group],
    names: FABLED_BY_GROUP[group],
  }));
}
