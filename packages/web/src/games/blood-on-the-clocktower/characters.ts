/**
 * Character catalog for the three base-set editions of Blood on the Clocktower.
 * The match-history form uses these to assign characters to players and to
 * auto-derive their alignment (Good = Townsfolk + Outsider; Evil = Minion +
 * Demon). Character names are stored verbatim on `TeamMember.role`, so the
 * spelling here is the wire-stable identifier.
 *
 * Trouble Brewing and Bad Moon Rising are DERIVED from core's `CHARACTERS`
 * (the companion's catalog, which also carries abilities and night order) so
 * the name the companion writes into match history is, by construction, the
 * name this form reads back. Sects & Violets has no companion support yet
 * and stays hand-written until it lands in core; `characters.test.ts` pins
 * the round-trip for every core character.
 */

import type {
  CharacterType,
  Edition,
} from "@boardgames/core/games/blood-on-the-clocktower/characters";
import { charactersOfType } from "@boardgames/core/games/blood-on-the-clocktower/characters";
import {
  baseDistribution,
  MAX_PLAYERS,
  MIN_PLAYERS,
} from "@boardgames/core/games/blood-on-the-clocktower/setup";

export type ClocktowerEdition = Edition | "sects-and-violets";

/**
 * The four resident categories, plus Travellers: late arrivals / early
 * leavers whose alignment is assigned by the Storyteller rather than implied
 * by the character — so a Traveller's team is picked on the form, not
 * derived (see `clocktowerAlignment`).
 */
export type ClocktowerCategory = CharacterType;

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
  traveller: "Travellers",
};

/** The edition's display name — also what `scenario` stores on a match. */
export function clocktowerEditionLabel(edition: ClocktowerEdition): string {
  return CLOCKTOWER_EDITIONS.find((e) => e.id === edition)?.label ?? edition;
}

/** The edition a stored `scenario` names, or null for anything else. */
export function clocktowerEditionFromLabel(
  label: string | undefined | null,
): ClocktowerEdition | null {
  return CLOCKTOWER_EDITIONS.find((e) => e.label === label)?.id ?? null;
}

const CATEGORY_ORDER: ClocktowerCategory[] = [
  "townsfolk",
  "outsider",
  "minion",
  "demon",
  "traveller",
];

/** An edition's table, in the companion's sheet order, from core's catalog. */
function fromCore(edition: Edition): Record<ClocktowerCategory, string[]> {
  const table = {} as Record<ClocktowerCategory, string[]>;
  for (const category of CATEGORY_ORDER) {
    table[category] = charactersOfType(category, edition).map((c) => c.name);
  }
  return table;
}

const TROUBLE_BREWING = fromCore("trouble-brewing");
const BAD_MOON_RISING = fromCore("bad-moon-rising");

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
  traveller: ["Barista", "Harlot", "Butcher", "Bone Collector", "Deviant"],
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

/**
 * The alignment a category implies — `null` for Travellers, whose alignment
 * the Storyteller assigns at the table (recorded by which team they sit in).
 */
export function clocktowerAlignment(category: ClocktowerCategory): "good" | "evil" | null {
  if (category === "traveller") return null;
  return category === "townsfolk" || category === "outsider" ? "good" : "evil";
}

/** Whether a stored role names a Traveller (any edition). */
export function isClocktowerTraveller(role: string | undefined | null): boolean {
  return findClocktowerCharacter(role)?.category === "traveller";
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
  return CATEGORY_ORDER.map((category) => ({
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

// ── Setup check ───────────────────────────────────────────────────────
// A recorded game should start from the setup sheet's distribution for its
// player count, after the orange-flower adjustments of the characters in
// play. A mismatch usually means a character was recorded as what someone
// believed or became (a Drunk as their Townsfolk, a Scarlet Woman as the
// Demon) — the form warns, never blocks.

/** Outsider-count adjustments by character: each entry is one allowed shift. */
const OUTSIDER_SHIFTS: Record<string, readonly number[]> = {
  Baron: [2],
  Godfather: [-1, 1],
  "Fang Gu": [1],
  Vigormortis: [-1],
};

/**
 * What is wrong with a fully assigned roster's character counts, as one
 * sentence each — empty when it matches the setup sheet, when a role is
 * missing or unknown, or when the resident count is outside 5–15.
 */
export function clocktowerSetupProblems(roles: ReadonlyArray<string | undefined>): string[] {
  const chars = roles.map(findClocktowerCharacter);
  if (chars.some((c) => c === null)) return [];
  const residents = chars.filter(
    (c): c is ClocktowerCharacter => c !== null && c.category !== "traveller",
  );
  const n = residents.length;
  if (n < MIN_PLAYERS || n > MAX_PLAYERS) return [];
  const count = (category: ClocktowerCategory) =>
    residents.filter((c) => c.category === category).length;
  const base = baseDistribution(n);
  const problems: string[] = [];

  const demons = count("demon");
  if (demons !== base.demons) {
    problems.push(
      `${demons} Demons — a game starts with ${base.demons}. Record the character each player started as.`,
    );
  }
  const minions = count("minion");
  if (minions !== base.minions) {
    problems.push(
      `${minions} ${minions === 1 ? "Minion" : "Minions"} — ${n} players start with ${base.minions}.`,
    );
  }

  let allowed = [base.outsiders];
  for (const c of residents) {
    const shifts = OUTSIDER_SHIFTS[c.name];
    if (shifts) allowed = allowed.flatMap((o) => shifts.map((s) => o + s));
  }
  const good = n - base.minions - base.demons;
  allowed = [...new Set(allowed)].filter((o) => o >= 0 && o <= good).sort((a, b) => a - b);
  const outsiders = count("outsider");
  if (minions === base.minions && demons === base.demons && !allowed.includes(outsiders)) {
    const expected = allowed.map((o) => `${good - o} and ${o}`).join(" or ");
    const drunkHint =
      outsiders < Math.min(...allowed) && !residents.some((c) => c.name === "Drunk")
        ? " Was one of them the Drunk?"
        : "";
    problems.push(
      `${count("townsfolk")} Townsfolk and ${outsiders} ${outsiders === 1 ? "Outsider" : "Outsiders"} — ${n} players start with ${expected}.${drunkHint}`,
    );
  }
  return problems;
}
