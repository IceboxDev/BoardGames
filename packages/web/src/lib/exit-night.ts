import { EXIT_CATALOG_SLUG } from "@boardgames/core/games/exit-games";
import {
  type ExitNightState,
  ExitNightStateSchema,
  ExitVoteBodySchema,
  type LockedDate,
  OkResponseSchema,
} from "@boardgames/core/protocol";
import { apiFetch } from "./api-fetch.ts";

// EXIT: The Game gets the same bespoke sealed-night handling as D&D
// (`dnd-night.ts`), with one twist: the winner is a *franchise*, not a game,
// so the modal swaps in a second-stage narrowing vote over the individual
// EXIT boxes (`@boardgames/core/games/exit-games`) instead of a single-game
// hero panel.

export type { ExitNightState };
/** Catalog slug of the votable EXIT anchor entry. */
export { EXIT_CATALOG_SLUG };

/**
 * True when a locked night should render its EXIT treatment: picks are locked
 * AND the per-night vote winner is the EXIT anchor. Mirrors `isDndNight`.
 */
export function isExitNight(lock: LockedDate | undefined | null): boolean {
  return !!lock?.picksLockedAt && lock.topGameSlug === EXIT_CATALOG_SLUG;
}

export async function fetchExitNightState(date: string, signal?: AbortSignal) {
  return apiFetch(`/api/calendar/exit?date=${encodeURIComponent(date)}`, {
    response: ExitNightStateSchema,
    signal,
  });
}

export async function setExitVote(date: string, slug: string, on: boolean) {
  return apiFetch("/api/calendar/exit/vote", {
    method: "POST",
    body: { date, slug, on },
    request: ExitVoteBodySchema,
    response: OkResponseSchema,
  });
}
