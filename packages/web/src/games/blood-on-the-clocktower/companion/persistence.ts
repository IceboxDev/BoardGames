// localStorage persistence for the Storyteller companion. Shapes and their
// migration history live in core (`schema.ts` / `persistence.ts`); this
// module only knows the keys and the browser.
//
// Keys are unversioned — the payload carries its `version` and core migrates
// it — but the two keys the August-2026 build wrote are still read (once)
// so a phone that updates mid-game loses nothing.

import {
  parseBagDraft,
  parseCompanionState,
  parseRoster,
} from "@boardgames/core/games/blood-on-the-clocktower/persistence";
import type {
  BagDraft,
  CompanionState,
} from "@boardgames/core/games/blood-on-the-clocktower/schema";

export type { BagDraft, BagDraftSeat } from "@boardgames/core/games/blood-on-the-clocktower/schema";

export const STORAGE_KEYS = {
  game: "botc-companion-game",
  bag: "botc-companion-bag",
  /** The recent past of the running game, oldest first — the Undo stack. */
  history: "botc-companion-history",
  roster: "botc-companion-roster-v1",
} as const;

/** Beyond this the history is kept in memory only (localStorage is ~5 MB). */
const HISTORY_BYTE_BUDGET = 1_500_000;

const LEGACY_KEYS = { game: "botc-companion-game-v1", bag: "botc-companion-bag-v2" } as const;

/** A document that failed to parse is parked here, never silently discarded. */
const corruptKey = (key: string) => `${key}-corrupt`;

function readRaw(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeRaw(key: string, text: string | null): void {
  try {
    if (text === null) localStorage.removeItem(key);
    else localStorage.setItem(key, text);
  } catch {
    // Storage full/unavailable — the game keeps running in memory.
  }
}

/**
 * Read `key` (falling back to its legacy spelling), parse it with `parse`,
 * and tidy up: a legacy document is re-homed under the current key, a
 * corrupt one is parked under `<key>-corrupt` and the slot cleared.
 */
function load<T>(
  key: string,
  legacy: string | undefined,
  parse: (raw: unknown) => { ok: true; value: T } | { ok: false; reason: string },
): T | null {
  let text = readRaw(key);
  let fromLegacy = false;
  if (text === null && legacy) {
    text = readRaw(legacy);
    fromLegacy = text !== null;
  }
  if (text === null) return null;
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    json = undefined;
  }
  const result = json === undefined ? { ok: false as const, reason: "not JSON" } : parse(json);
  if (!result.ok) {
    if (import.meta.env.DEV) console.warn(`[botc] discarding ${key}: ${result.reason}`);
    writeRaw(corruptKey(key), text);
    writeRaw(key, null);
    if (fromLegacy && legacy) writeRaw(legacy, null);
    return null;
  }
  if (fromLegacy && legacy) {
    writeRaw(key, JSON.stringify(result.value));
    writeRaw(legacy, null);
  }
  return result.value;
}

export function loadGame(): CompanionState | null {
  return load(STORAGE_KEYS.game, LEGACY_KEYS.game, parseCompanionState);
}

export function saveGame(state: CompanionState | null): void {
  writeRaw(STORAGE_KEYS.game, state === null ? null : JSON.stringify(state));
}

export function loadBagDraft(): BagDraft | null {
  return load(STORAGE_KEYS.bag, LEGACY_KEYS.bag, parseBagDraft);
}

export function saveBagDraft(draft: BagDraft | null): void {
  writeRaw(STORAGE_KEYS.bag, draft === null ? null : JSON.stringify(draft));
}

/**
 * The Undo stack. Each entry is validated like the game itself; a bad entry
 * ends the history there (older states are unreachable anyway).
 */
export function loadHistory(): CompanionState[] {
  const text = readRaw(STORAGE_KEYS.history);
  if (text === null) return [];
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return [];
  }
  if (!Array.isArray(json)) return [];
  const out: CompanionState[] = [];
  for (const raw of json) {
    const result = parseCompanionState(raw);
    if (!result.ok) break;
    out.push(result.value);
  }
  return out;
}

export function saveHistory(states: readonly CompanionState[]): void {
  if (states.length === 0) {
    writeRaw(STORAGE_KEYS.history, null);
    return;
  }
  const text = JSON.stringify(states);
  // Too big to mirror: keep the newest that fit rather than nothing.
  if (text.length > HISTORY_BYTE_BUDGET) {
    const half = states.slice(Math.ceil(states.length / 2));
    if (half.length < states.length) saveHistory(half);
    return;
  }
  writeRaw(STORAGE_KEYS.history, text);
}

/** Last-used player roster, so the next game night starts pre-filled. */
export function loadRoster(): string[] {
  const text = readRaw(STORAGE_KEYS.roster);
  if (text === null) return [];
  try {
    return parseRoster(JSON.parse(text));
  } catch {
    return [];
  }
}

export function saveRoster(names: string[]): void {
  writeRaw(STORAGE_KEYS.roster, JSON.stringify(names));
}
