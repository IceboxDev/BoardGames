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

/**
 * The resolution of a session. "campaign-win"/"campaign-loss" mark a session
 * that carried no result itself but whose campaign has since concluded
 * (`campaignResult` back-filled) — no longer ongoing, yet not a session
 * win/loss of its own.
 */
export type DndResolution = "ongoing" | "win" | "loss" | "campaign-win" | "campaign-loss";

export function resolutionOf(outcome: MatchOutcomeCoop): DndResolution {
  if (outcome.outcome) return outcome.outcome;
  if (outcome.campaignResult) {
    return outcome.campaignResult === "win" ? "campaign-win" : "campaign-loss";
  }
  return "ongoing";
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
