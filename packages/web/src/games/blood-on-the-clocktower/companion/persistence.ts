// localStorage persistence for the Storyteller companion. The whole
// CompanionState is JSON-serializable by design (see core companion.ts), so a
// running game survives refreshes, phone locks, and accidental navigation.

import type {
  CharacterId,
  Edition,
} from "@boardgames/core/games/blood-on-the-clocktower/characters";
import type { CompanionState } from "@boardgames/core/games/blood-on-the-clocktower/companion";
import type { BagSetup, DemonSkill } from "@boardgames/core/games/blood-on-the-clocktower/setup";

const GAME_KEY = "botc-companion-game-v1";
const ROSTER_KEY = "botc-companion-roster-v1";
const BAG_KEY = "botc-companion-bag-v2";

/** One chair in circle order. Traveller seats never draw from the bag. */
export type BagDraftSeat = {
  name: string;
  /** Set when this seat was marked a traveller at setup; the character is
   * picked (or rolled) on the Bag screen, alignment is the ST's call. */
  traveller?: { character: CharacterId | null; alignment: "good" | "evil" };
};

/**
 * The in-between stage: the bag has been rolled and players are drawing
 * physical tokens; `draws[i]` is what seat `i` pulled (null until recorded;
 * traveller seats stay null). Persisted so a locked phone mid-draw loses
 * nothing.
 */
export type BagDraft = {
  /** Which edition is being played (absent in pre-BMR drafts = Trouble Brewing). */
  edition?: Edition;
  seats: BagDraftSeat[];
  storyteller?: string;
  bag: BagSetup;
  draws: (CharacterId | null)[];
  /** Bluff weighting for the eventual demon; toggled on the Bag screen. */
  demonSkill?: DemonSkill;
};

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

export function loadBagDraft(): BagDraft | null {
  try {
    const raw = localStorage.getItem(BAG_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      Array.isArray((parsed as { seats?: unknown }).seats) &&
      Array.isArray((parsed as { draws?: unknown }).draws) &&
      typeof (parsed as { bag?: unknown }).bag === "object"
    ) {
      return parsed as BagDraft;
    }
    return null;
  } catch {
    return null;
  }
}

export function saveBagDraft(draft: BagDraft | null): void {
  try {
    if (draft === null) localStorage.removeItem(BAG_KEY);
    else localStorage.setItem(BAG_KEY, JSON.stringify(draft));
  } catch {
    // Best-effort only.
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
