// Shared D&D match-history helpers. D&D is recorded as a co-op (the party wins
// or loses together) with three D&D-specific extras on the coop outcome:
//   - `campaign`  — the campaign / one-shot name (required).
//   - resolution  — whether this session concluded the story: `outcome`
//     undefined = ongoing (a two-shot's first sitting), "win"/"loss" = resolved.
//   - per-player `condition` — the only per-player datum: whether a character
//     went down this session ("unconscious") or died for good ("dead").

import type { MatchOutcomeCoop } from "@boardgames/core/history/types";

export const DND_SLUG = "dungeons-and-dragons";

export function isDndSlug(slug: string | null | undefined): boolean {
  return slug === DND_SLUG;
}

/** The three-state resolution of a session, derived from the coop `outcome`. */
export type DndResolution = "ongoing" | "win" | "loss";

export function resolutionOf(outcome: MatchOutcomeCoop): DndResolution {
  return outcome.outcome ?? "ongoing";
}

export type DndCondition = NonNullable<MatchOutcomeCoop["participants"][number]["condition"]>;

// Ordered worst-last so a single glance reads escalating severity. `chip`/`dot`
// classes are shared by the form toggle and the card markers.
export const DND_CONDITIONS: ReadonlyArray<{
  value: DndCondition;
  label: string;
  full: string;
  icon: string;
}> = [
  { value: "unconscious", label: "Down", full: "Knocked unconscious", icon: "😵" },
  { value: "dead", label: "Died", full: "Permanent character death", icon: "💀" },
];

export function conditionMeta(condition: DndCondition) {
  return DND_CONDITIONS.find((c) => c.value === condition) ?? null;
}
