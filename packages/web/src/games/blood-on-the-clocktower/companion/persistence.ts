// localStorage persistence for the Storyteller companion. The whole
// CompanionState is JSON-serializable by design (see core companion.ts), so a
// running game survives refreshes, phone locks, and accidental navigation.

import type { CompanionState } from "@boardgames/core/games/blood-on-the-clocktower/companion";

const GAME_KEY = "botc-companion-game-v1";
const ROSTER_KEY = "botc-companion-roster-v1";

export function loadGame(): CompanionState | null {
  try {
    const raw = localStorage.getItem(GAME_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      (parsed as { version?: unknown }).version === 1 &&
      Array.isArray((parsed as { players?: unknown }).players)
    ) {
      return parsed as CompanionState;
    }
    return null;
  } catch {
    return null;
  }
}

export function saveGame(state: CompanionState | null): void {
  try {
    if (state === null) localStorage.removeItem(GAME_KEY);
    else localStorage.setItem(GAME_KEY, JSON.stringify(state));
  } catch {
    // Storage full/unavailable — the game keeps running in memory.
  }
}

/** Last-used player roster, so the next game night starts pre-filled. */
export function loadRoster(): string[] {
  try {
    const raw = localStorage.getItem(ROSTER_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function saveRoster(names: string[]): void {
  try {
    localStorage.setItem(ROSTER_KEY, JSON.stringify(names));
  } catch {
    // Best-effort only.
  }
}
