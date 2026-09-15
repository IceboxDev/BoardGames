// The companion's state lives in ONE place: this store. It owns the two
// persisted documents (the running game and a half-recorded bag draft),
// writes every change through to localStorage, and follows changes made by
// another tab of the same browser via the `storage` event — so two open
// tabs converge instead of clobbering each other's key.
//
// It also keeps the game's UNDO history: every reducer applied through
// `updateGame` pushes the previous state, so a mis-tap at the table — or a
// dawn announced one step too early — is one "Undo" away, phone lock or
// refresh notwithstanding (the recent past is persisted too).
//
// React reads it with `useSyncExternalStore` (see `useCompanionStore`);
// reducers stay pure functions from core, applied through `updateGame`.

import type { CompanionState } from "@boardgames/core/games/blood-on-the-clocktower/companion";
import { useSyncExternalStore } from "react";
import {
  type BagDraft,
  loadBagDraft,
  loadGame,
  loadHistory,
  STORAGE_KEYS,
  saveBagDraft,
  saveGame,
  saveHistory,
} from "./persistence";

/** How many previous states are kept (and persisted) for Undo. */
export const HISTORY_LIMIT = 20;

export type CompanionSnapshot = {
  game: CompanionState | null;
  draft: BagDraft | null;
  /** Previous states, oldest first. */
  past: readonly CompanionState[];
  /** States undone, most recently undone last. In memory only. */
  future: readonly CompanionState[];
};

export type UpdateState = (fn: (state: CompanionState) => CompanionState) => void;

/** What the header's Undo / Redo controls need, derived from a snapshot. */
export type HistoryControls = {
  canUndo: boolean;
  canRedo: boolean;
  /** The log line the next Undo takes back (when the change logged one). */
  undoLabel?: string;
  /** Undo can reach a night from this day. */
  canBackToNight: boolean;
};

type Listener = () => void;

let snapshot: CompanionSnapshot | undefined;
const listeners = new Set<Listener>();

function current(): CompanionSnapshot {
  if (!snapshot) {
    snapshot = { game: loadGame(), draft: loadBagDraft(), past: loadHistory(), future: [] };
  }
  return snapshot;
}

function publish(next: CompanionSnapshot): void {
  snapshot = next;
  for (const l of listeners) l();
}

function onStorage(e: StorageEvent): void {
  // A null key is `localStorage.clear()` from another tab.
  if (
    e.key !== null &&
    e.key !== STORAGE_KEYS.game &&
    e.key !== STORAGE_KEYS.bag &&
    e.key !== STORAGE_KEYS.history
  ) {
    return;
  }
  const prev = current();
  const all = e.key === null;
  publish({
    game: all || e.key === STORAGE_KEYS.game ? loadGame() : prev.game,
    draft: all || e.key === STORAGE_KEYS.bag ? loadBagDraft() : prev.draft,
    past: all || e.key === STORAGE_KEYS.history ? loadHistory() : prev.past,
    future: [],
  });
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  if (listeners.size === 1 && typeof window !== "undefined") {
    window.addEventListener("storage", onStorage);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && typeof window !== "undefined") {
      window.removeEventListener("storage", onStorage);
    }
  };
}

function commit(
  game: CompanionState,
  past: readonly CompanionState[],
  future: readonly CompanionState[],
) {
  saveGame(game);
  saveHistory(past);
  publish({ ...current(), game, past, future });
}

export const companionStore = {
  subscribe,
  getSnapshot: current,

  /** Apply a pure reducer to the running game (no-op when none is running). */
  updateGame(fn: (state: CompanionState) => CompanionState): void {
    const prev = current();
    if (!prev.game) return;
    const game = fn(prev.game);
    if (game === prev.game) return;
    commit(game, [...prev.past, prev.game].slice(-HISTORY_LIMIT), []);
  },

  /** Take back the last change. */
  undo(): void {
    const prev = current();
    const before = prev.past.at(-1);
    if (!prev.game || !before) return;
    commit(before, prev.past.slice(0, -1), [...prev.future, prev.game]);
  },

  /** Take back changes until `stop(state)` holds (or the history runs out). */
  undoUntil(stop: (state: CompanionState) => boolean): void {
    const prev = current();
    if (!prev.game) return;
    const past = [...prev.past];
    const future = [...prev.future];
    let game = prev.game;
    while (!stop(game)) {
      const before = past.pop();
      if (!before) break;
      future.push(game);
      game = before;
    }
    if (game === prev.game) return;
    commit(game, past, future);
  },

  redo(): void {
    const prev = current();
    const after = prev.future.at(-1);
    if (!prev.game || !after) return;
    commit(after, [...prev.past, prev.game].slice(-HISTORY_LIMIT), prev.future.slice(0, -1));
  },

  /** Start (or replace) the running game; the bag draft it came from is spent. */
  startGame(game: CompanionState): void {
    saveGame(game);
    saveBagDraft(null);
    saveHistory([]);
    publish({ game, draft: null, past: [], future: [] });
  },

  setDraft(draft: BagDraft | null): void {
    saveBagDraft(draft);
    publish({ ...current(), draft });
  },

  /** Delete everything — back to setup. */
  abandon(): void {
    saveGame(null);
    saveBagDraft(null);
    saveHistory([]);
    publish({ game: null, draft: null, past: [], future: [] });
  },

  /** Test seam: forget the cached snapshot so the next read hits storage. */
  reset(): void {
    snapshot = undefined;
  },
};

/** The header's Undo / Redo affordances for a snapshot. */
export function historyControls(snap: CompanionSnapshot): HistoryControls {
  const before = snap.past.at(-1);
  const game = snap.game;
  const lastLog = game?.log.at(-1);
  const undoLabel = before && lastLog && lastLog.id >= before.nextLogId ? lastLog.text : undefined;
  return {
    canUndo: Boolean(game && before),
    canRedo: Boolean(game && snap.future.length > 0),
    undoLabel,
    canBackToNight: game?.phase.kind === "day" && snap.past.some((s) => s.phase.kind === "night"),
  };
}

export function useCompanionStore(): CompanionSnapshot {
  return useSyncExternalStore(companionStore.subscribe, companionStore.getSnapshot);
}
