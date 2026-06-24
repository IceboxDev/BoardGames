import type { LockedDate } from "@boardgames/core/protocol";

// Dungeons & Dragons gets a bespoke calendar treatment: once a night's guest
// list is sealed (picks locked) and the vote winner is D&D, the day card and
// the RSVP modal both switch into "D&D night" mode — a single quest on the
// table, a d20 headcount, and an unmistakable crimson-and-gold frame. This
// module centralizes the slug + the trigger so the grid cell and the modal
// agree on exactly when that mode is active.

/** Catalog slug for the Dungeons & Dragons entry (homebrew, BGG id 0). */
export const DND_SLUG = "dungeons-and-dragons";

/**
 * True when a locked night should render its D&D treatment: picks are locked
 * AND the per-night vote winner is D&D. Before picks lock the normal voting
 * visuals stay in play even if D&D is currently leading — the night isn't
 * committed yet.
 */
export function isDndNight(lock: LockedDate | undefined | null): boolean {
  return !!lock?.picksLockedAt && lock.topGameSlug === DND_SLUG;
}
