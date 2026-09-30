// Per-game variant tags surfaced as the small italic subtitle under the game
// title in MatchCard. The user picks them in RecordMatchModal; the picked
// label gets persisted via `outcome.scenario` on every match-outcome kind.
//
// Two selection modes:
//   - "single": one of N (Codenames language, Wavelength mode).
//   - "multi":  any subset, joined with " + " when stored as a single string
//               (7 Wonders expansions, Exploding Kittens death/revival modes).
//
// A single-select may add a second single-select axis (`secondary`) — Trivial
// Pursuit's edition + language. Both halves share the one `scenario` string,
// joined with " · " ("Classic · German").

import { QUIZTOPIA_MODES } from "@boardgames/core/history/coop-challenge";
import { DUNGEON_MAYHEM_SET_LABELS } from "./dungeon-mayhem/characters";
import { TRIVIAL_PURSUIT_EDITIONS } from "./trivial-pursuit/editions";
import {
  defaultBoxLabelForGame,
  VILLAINOUS_BASE_SLUG,
  VILLAINOUS_BOX_OPTIONS,
  VILLAINOUS_INTRO_SLUG,
} from "./villainous/villains";

export type VariantOption = {
  value: string;
  label: string;
  /** Optional leading glyph or short emoji (e.g. flag) shown before the label. */
  icon?: string;
};

export type GameVariantConfig = {
  /** Label for the picker section. */
  label: string;
  mode: "single" | "multi";
  options: readonly VariantOption[];
  /**
   * When true, the picker is hidden and the single option's value is shown as
   * the subtitle automatically. Used for games with only one ruleset where we
   * still want a non-empty subtitle row (e.g. Bandit → "Standard").
   */
  fixed?: boolean;
  /**
   * Pre-selected value for a fresh match — a default beats an empty subtitle.
   * Omitted on single-select configs means "first option" (see
   * {@link defaultVariantValue}). On multi-select configs the default is only
   * applied when set explicitly, because pre-checking an optional expansion
   * ("Imploding was in play") would assert something that may be false — the
   * one safe case is a base that's always present (7 Wonders → "Base").
   */
  default?: string;
  /**
   * A second single-select axis stored in the same `scenario` string (see
   * {@link composeVariant}). Only meaningful on `mode: "single"` configs. Its
   * default follows the same rule: declared, else the first option.
   */
  secondary?: {
    label: string;
    options: readonly VariantOption[];
    default?: string;
  };
};

/**
 * Jaipur scenario value that collapses the best-of-three to a single
 * plain-scored round. Shared by the variant options below, JaipurForm's mode
 * switch, and the outcome validation in `history/outcome.ts`.
 */
export const JAIPUR_BEST_OF_ONE = "Best of 1";

const ENGLISH: VariantOption = { value: "English", label: "English", icon: "🇬🇧" };
const GERMAN: VariantOption = { value: "German", label: "German", icon: "🇩🇪" };

const CODENAMES_LANGUAGE: GameVariantConfig = {
  label: "Language",
  mode: "single",
  options: [ENGLISH, GERMAN],
};

/**
 * Single-ruleset games still get a subtitle row (matches Bandit/Lovecraft
 * Letter): the picker stays hidden and every match — past ones included, since
 * the fixed path wins at render time — reads "Standard".
 */
const FIXED_STANDARD: GameVariantConfig = {
  label: "Ruleset",
  mode: "single",
  fixed: true,
  options: [{ value: "Standard", label: "Standard" }],
};

const VARIANTS: Record<string, GameVariantConfig> = {
  codenames: CODENAMES_LANGUAGE,
  "connect-4": FIXED_STANDARD,
  // Hot Pot Holic's rulebook ships one optional twist — the Advanced Setup
  // Variant (each player drafts their 2 plate cards from an 11-card hand
  // instead of random deals). Standard first so a fresh match defaults to it.
  "hot-pot-holic": {
    label: "Setup",
    mode: "single",
    options: [
      { value: "Standard", label: "Standard" },
      { value: "Advanced Setup", label: "Advanced Setup" },
    ],
  },
  set: FIXED_STANDARD,
  // Quiztopia's two rulesets: Standard (free discussion) vs Expert (answer
  // alone, tip cards). Expert additionally raises the rating engine's
  // challenge bias — see core/history/coop-challenge.ts.
  quiztopia: {
    label: "Mode",
    mode: "single",
    options: QUIZTOPIA_MODES.map((mode) => ({ value: mode, label: mode })),
  },
  "codenames-pictures": CODENAMES_LANGUAGE,
  "codenames-duet": CODENAMES_LANGUAGE,
  bandit: FIXED_STANDARD,
  wavelength: {
    label: "Mode",
    mode: "single",
    options: [
      { value: "Standard", label: "Standard" },
      { value: "Advanced", label: "Advanced" },
    ],
  },
  // The Resistance plays Resistance Operatives (good) vs Spies (evil), recorded
  // like Blood on the Clocktower. The only ruleset axis is the expansion.
  "the-resistance": {
    label: "Edition",
    mode: "single",
    options: [
      { value: "Standard", label: "Standard" },
      { value: "The Plot Thickens", label: "The Plot Thickens" },
    ],
  },
  "7-wonders": {
    label: "Edition",
    mode: "multi",
    // The base game is always in play, so pre-check it; expansions stay opt-in.
    default: "Base",
    options: [
      { value: "Base", label: "Base game" },
      { value: "Leaders", label: "Leaders" },
      { value: "Cities", label: "Cities" },
      { value: "Wonder Pack", label: "Wonder Pack" },
      { value: "Babel", label: "Babel" },
      { value: "Armada", label: "Armada" },
    ],
  },
  // Publish or Perish's three expansion packs (the group owns the All-in
  // Bundle). Recorded like 7 Wonders: the base game is always in play, so it is
  // pre-checked; expansions stay opt-in. Values are kept short because the
  // joined scenario string is capped at 64 characters on the wire.
  "publish-or-perish": {
    label: "Edition",
    mode: "multi",
    default: "Base",
    options: [
      { value: "Base", label: "Base game" },
      { value: "Reviewer 2", label: "The Revenge of Reviewer 2" },
      { value: "Academic Sh*tpost", label: "Academic Sh*tpost" },
      { value: "Midterm Grading", label: "Midterm Grading Extravaganza" },
    ],
  },
  // Unstable Unicorns: one base deck (the White / Black / GameStop / retail
  // boxes differ only in card backs) plus the expansion boxes shuffled in.
  // Recorded like 7 Wonders: the base is always in play, so it is pre-checked;
  // expansions stay opt-in. Values are one word each because the joined
  // scenario string is capped at 64 characters on the wire and the full
  // selection must fit (63). The 5-card Kickstarter promo pack is not a box
  // and is left out for the same reason.
  "unstable-unicorns": {
    label: "Boxes in play",
    mode: "multi",
    default: "Base",
    options: [
      { value: "Base", label: "Base game" },
      { value: "NSFW", label: "NSFW (Uncut Unicorns)" },
      { value: "Dragons", label: "Dragons" },
      { value: "Apocalypse", label: "Rainbow Apocalypse" },
      { value: "Sprinkles", label: "Rainbow Sprinkles" },
      { value: "Chaos", label: "Control and Chaos" },
      { value: "Legend", label: "Unicorns of Legend" },
    ],
  },
  // Villainous: the two boxes are separate catalog games (different party
  // sizes), but the group mixes villains across them, so either slug records
  // WHICH boxes were on the table (multi-select, like Dungeon Mayhem's sets).
  // The selection drives the villain roster in VillainousForm — see
  // `villainous/villains.ts`. Each slug pre-checks its own box.
  [VILLAINOUS_BASE_SLUG]: {
    label: "Boxes in play",
    mode: "multi",
    default: defaultBoxLabelForGame(VILLAINOUS_BASE_SLUG),
    options: VILLAINOUS_BOX_OPTIONS.map((b) => ({ value: b.label, label: b.label })),
  },
  [VILLAINOUS_INTRO_SLUG]: {
    label: "Boxes in play",
    mode: "multi",
    default: defaultBoxLabelForGame(VILLAINOUS_INTRO_SLUG),
    options: VILLAINOUS_BOX_OPTIONS.map((b) => ({ value: b.label, label: b.label })),
  },
  // Lovecraft Letter is a point-less free-for-all with a single ruleset, so the
  // version is a fixed "Standard" subtitle (like Bandit). HOW the winner won (the
  // win condition) is recorded on the winner's `role` in LovecraftLetterForm and
  // shown next to them in the history — it is NOT the scenario.
  "lovecraft-letter": {
    label: "Edition",
    mode: "single",
    fixed: true,
    options: [{ value: "Standard", label: "Standard" }],
  },
  // Just One: a cooperative game with two rulesets — Standard, or Discardless
  // (the harder variant). Shown as the MatchCard subtitle.
  "just-one": {
    label: "Mode",
    mode: "single",
    options: [
      { value: "Standard", label: "Standard" },
      { value: "Discardless", label: "Discardless" },
    ],
  },
  // Medical Mysteries: each session solves one patient's case — record which.
  // Cases are usually played in order, so the first patient is the default for
  // a fresh match. Miami's cases go on its own slug once the box is opened.
  "medical-mysteries-nyc": {
    label: "Patient",
    mode: "single",
    options: [
      { value: "Shyla Patel", label: "Shyla Patel" },
      { value: "Adrian Alexopoulos", label: "Adrian Alexopoulos" },
      { value: "Gabriela Ferrera", label: "Gabriela Ferrera" },
      { value: "Pete Johnson", label: "Pete Johnson" },
    ],
  },
  // Dungeon Mayhem is recorded as an elimination match; the sets in play are
  // picked here (multi-select, like 7 Wonders expansions) and drive which heroes
  // the per-player picker offers — see `dungeon-mayhem/characters.ts`. Standard
  // is pre-checked as the common base; expansions stay opt-in.
  "dungeon-mayhem": {
    label: "Sets in play",
    mode: "multi",
    default: "Standard",
    options: DUNGEON_MAYHEM_SET_LABELS.map((s) => ({ value: s, label: s })),
  },
  // Jaipur is a best-of-three by the book — the round-by-round rupee record
  // drives the JaipurForm (per-player `roundScores`, winner = most seals).
  // "Best of 1" collapses it to a single plain-scored round for a quick game.
  // Standard first so a fresh match defaults to the full format.
  jaipur: {
    label: "Format",
    mode: "single",
    options: [
      { value: "Standard", label: "Standard (best of three)" },
      { value: JAIPUR_BEST_OF_ONE, label: JAIPUR_BEST_OF_ONE },
    ],
  },
  // Azul's player boards are double-sided (rulebook "Variant play"): the
  // colored wall is the standard game; the gray wall lets a tile go on any
  // space of its row, as long as no color repeats in a column. Standard first.
  azul: {
    label: "Wall",
    mode: "single",
    options: [
      { value: "Standard", label: "Standard (colored wall)" },
      { value: "Gray wall", label: "Gray wall" },
    ],
  },
  // Wingspan's one ruleset choice (rulebook setup step 4): the side of the
  // end-of-round goal board. Green — 1st/2nd/3rd place majorities — is the
  // book's default; Blue scores 1 point per targeted item (max 5), the
  // gentler side for new players.
  wingspan: {
    label: "Goal board",
    mode: "single",
    options: [
      { value: "Green goals", label: "Green · majority (competitive)" },
      { value: "Blue goals", label: "Blue · 1 point per item (friendly)" },
    ],
  },
  // Intarsia's player boards are double-sided — the Standard side and the
  // trickier Pro side. Standard is first so a fresh match defaults to it.
  intarsia: {
    label: "Side",
    mode: "single",
    options: [
      { value: "Standard", label: "Standard" },
      { value: "Pro", label: "Pro" },
    ],
  },
  // Not Enough Mana house rule: the drink on the table is part of the match.
  // Multi-select with no default — a dry game just leaves both unchecked.
  // Extend the list as new bottles show up.
  "not-enough-mana": {
    label: "Alcohol in play",
    mode: "multi",
    options: [
      { value: "Limoncello", label: "Limoncello" },
      { value: "Soju", label: "Soju" },
    ],
  },
  // The three most-played poker variants; Hold'em first so a fresh match
  // defaults to the game the night almost certainly was.
  poker: {
    label: "Variant",
    mode: "single",
    options: [
      { value: "Texas Hold'em", label: "Texas Hold'em" },
      { value: "Omaha", label: "Omaha" },
      { value: "Seven-Card Stud", label: "Seven-Card Stud" },
    ],
  },
  // Captain Sonar ships two rulesets: the signature simultaneous real-time
  // mode and the calmer turn-by-turn variant. Real-time is first so a fresh
  // match defaults to it.
  "captain-sonar": {
    label: "Mode",
    mode: "single",
    options: [
      { value: "Real-time", label: "Real-time" },
      { value: "Turn-based", label: "Turn-based" },
    ],
  },
  "exploding-kittens": {
    label: "Modes in play",
    mode: "multi",
    options: [
      { value: "Imploding", label: "Imploding" },
      { value: "Barking", label: "Barking" },
      { value: "Zombies", label: "Zombies" },
      { value: "God's Cat", label: "God's Cat" },
    ],
  },
  // Phase 10's rulebook ships three official variations alongside the
  // standard 10-phases-in-order rules. They're mutually exclusive — pick one
  // (or leave blank for the default ruleset).
  // Trivial Pursuit: which box (edition) and which language the cards were in.
  // Classic + English first, so a fresh match defaults to "Classic · English".
  "trivial-pursuit": {
    label: "Edition",
    mode: "single",
    options: TRIVIAL_PURSUIT_EDITIONS,
    secondary: {
      label: "Language",
      options: [
        ENGLISH,
        GERMAN,
        { value: "French", label: "French", icon: "🇫🇷" },
        { value: "Spanish", label: "Spanish", icon: "🇪🇸" },
        { value: "Italian", label: "Italian", icon: "🇮🇹" },
        { value: "Dutch", label: "Dutch", icon: "🇳🇱" },
      ],
    },
  },
  "phase-10": {
    label: "Ruleset",
    mode: "single",
    options: [
      { value: "Standard", label: "Standard" },
      { value: "10-hand race", label: "10-hand race" },
      { value: "Short (5 phases)", label: "Short (5 phases)" },
      { value: "Short (7 phases)", label: "Short (7 phases)" },
      { value: "Even phases only", label: "Even phases only" },
    ],
  },
};

/** Every slug with a variant config — for invariant tests over the whole table. */
export function variantSlugs(): string[] {
  return Object.keys(VARIANTS);
}

export function variantConfigForSlug(slug: string | null): GameVariantConfig | null {
  if (!slug) return null;
  return VARIANTS[slug] ?? null;
}

/**
 * The scenario value a fresh match of this game should start with. Single-select
 * games pre-select their first option (a sensible "standard" beats no value);
 * multi-select games only get a default when one is declared explicitly. Returns
 * undefined when the game has no variants, or for a multi-select with no
 * declared base. Used to seed `outcome.scenario` when the game is first picked.
 */
export function defaultVariantValue(slug: string | null): string | undefined {
  const config = variantConfigForSlug(slug);
  if (!config) return undefined;
  if (config.secondary) {
    return composeVariant(
      config.default ?? config.options[0]?.value,
      config.secondary.default ?? config.secondary.options[0]?.value,
    );
  }
  if (config.default !== undefined) return config.default;
  if (config.mode === "single") return config.options[0]?.value;
  return undefined;
}

const AXIS_JOIN = " · ";

/**
 * Join a two-axis pick (edition, language) into the stored scenario. Either
 * half may be unset; undefined when both are.
 */
export function composeVariant(
  primary: string | undefined,
  secondary: string | undefined,
): string | undefined {
  const parts = [primary, secondary].filter((p): p is string => !!p);
  return parts.length === 0 ? undefined : parts.join(AXIS_JOIN);
}

/**
 * Split a stored two-axis scenario back into its halves. A lone value is
 * matched against the secondary options so "German" (edition unset) doesn't
 * read as an edition.
 */
export function parseComposedVariant(
  stored: string | undefined,
  config: GameVariantConfig,
): { primary?: string; secondary?: string } {
  if (!stored) return {};
  const [first, second] = stored.split(AXIS_JOIN).map((s) => s.trim());
  if (second !== undefined) return { primary: first, secondary: second };
  const isSecondary = config.secondary?.options.some((o) => o.value === first);
  return isSecondary ? { secondary: first } : { primary: first };
}

const JOIN = " + ";

/** Split a stored scenario string back into its parts for the multi-select. */
export function parseMultiVariant(stored: string | undefined): string[] {
  if (!stored) return [];
  return stored
    .split(JOIN)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Re-join a selected set back into the stored string, in catalog order. */
export function joinMultiVariant(
  selected: ReadonlyArray<string>,
  options: ReadonlyArray<VariantOption>,
): string | undefined {
  const set = new Set(selected);
  const ordered = options.filter((o) => set.has(o.value)).map((o) => o.value);
  return ordered.length === 0 ? undefined : ordered.join(JOIN);
}
