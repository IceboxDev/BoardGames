// Per-game variant tags surfaced as the small italic subtitle under the game
// title in MatchCard. The user picks them in RecordMatchModal; the picked
// label gets persisted via `outcome.scenario` on every match-outcome kind.
//
// Two selection modes:
//   - "single": one of N (Codenames language, Wavelength mode).
//   - "multi":  any subset, joined with " + " when stored as a single string
//               (7 Wonders expansions, Exploding Kittens death/revival modes).

import { DUNGEON_MAYHEM_SET_LABELS } from "./dungeon-mayhem/characters";

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
};

const CODENAMES_LANGUAGE: GameVariantConfig = {
  label: "Language",
  mode: "single",
  options: [
    { value: "English", label: "English", icon: "🇬🇧" },
    { value: "German", label: "German", icon: "🇩🇪" },
  ],
};

const VARIANTS: Record<string, GameVariantConfig> = {
  codenames: CODENAMES_LANGUAGE,
  "codenames-pictures": CODENAMES_LANGUAGE,
  "codenames-duet": CODENAMES_LANGUAGE,
  bandit: {
    label: "Ruleset",
    mode: "single",
    fixed: true,
    options: [{ value: "Standard", label: "Standard" }],
  },
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
  // Villainous has NO variant picker: its two editions are two separate catalog
  // games (`villainous`, `villainous-introduction-to-evil`) because they are
  // separate boxes seating different party sizes. The chosen game already names
  // the edition, and it drives the villain roster — see `villainous/villains.ts`.
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
  if (config.default !== undefined) return config.default;
  if (config.mode === "single") return config.options[0]?.value;
  return undefined;
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
