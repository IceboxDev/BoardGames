import {
  beginNight,
  createGame,
  dawn,
  kill,
  recordDemonKill,
  recordNomination,
} from "@boardgames/core/games/blood-on-the-clocktower/companion";
import type { GameSetup } from "@boardgames/core/games/blood-on-the-clocktower/setup";
import { beforeEach, describe, expect, it } from "vitest";
import { loadBagDraft, loadGame, loadHistory, STORAGE_KEYS, saveGame } from "./persistence";
import { companionStore, HISTORY_LIMIT, historyControls } from "./store";

const setup: GameSetup = {
  seats: ["imp", "poisoner", "empath", "fortune-teller", "monk"].map((character, seat) => ({
    seat,
    name: `P${seat}`,
    character: character as never,
  })),
  distribution: { townsfolk: 3, outsiders: 0, minions: 1, demons: 1 },
  demonBluffs: ["chef", "slayer", "saint"],
};
const fresh = () => beginNight(createGame(setup));

beforeEach(() => {
  localStorage.clear();
  companionStore.reset();
});

describe("companion persistence", () => {
  it("round-trips the running game", () => {
    const game = fresh();
    saveGame(game);
    expect(loadGame()).toEqual(game);
    saveGame(null);
    expect(loadGame()).toBeNull();
  });

  it("re-homes a game saved under the August-2026 key and forgets the old key", () => {
    const v1 = { ...fresh(), version: 1, nightStep: 0 } as Record<string, unknown>;
    delete v1.nightProgress;
    localStorage.setItem("botc-companion-game-v1", JSON.stringify(v1));
    const loaded = loadGame();
    expect(loaded?.version).toBe(2);
    expect(localStorage.getItem("botc-companion-game-v1")).toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.game)).not.toBeNull();
  });

  it("parks a corrupt document instead of silently deleting it", () => {
    localStorage.setItem(STORAGE_KEYS.game, '{"version":2,"players":"nope"}');
    expect(loadGame()).toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.game)).toBeNull();
    expect(localStorage.getItem(`${STORAGE_KEYS.game}-corrupt`)).toContain('"nope"');
    localStorage.setItem(STORAGE_KEYS.bag, "{not json");
    expect(loadBagDraft()).toBeNull();
    expect(localStorage.getItem(`${STORAGE_KEYS.bag}-corrupt`)).toBe("{not json");
  });
});

describe("companionStore", () => {
  it("writes every update through to storage and notifies subscribers", () => {
    companionStore.startGame(fresh());
    let ticks = 0;
    const unsubscribe = companionStore.subscribe(() => ticks++);
    companionStore.updateGame((s) => ({ ...s, storyteller: "Zed" }));
    expect(ticks).toBe(1);
    expect(companionStore.getSnapshot().game?.storyteller).toBe("Zed");
    expect(loadGame()?.storyteller).toBe("Zed");
    // A reducer that returns the same object is not a change.
    companionStore.updateGame((s) => s);
    expect(ticks).toBe(1);
    unsubscribe();
  });

  it("follows a change made by another tab", () => {
    companionStore.startGame(fresh());
    const unsubscribe = companionStore.subscribe(() => {});
    const other = { ...fresh(), storyteller: "Other tab" };
    localStorage.setItem(STORAGE_KEYS.game, JSON.stringify(other));
    window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEYS.game }));
    expect(companionStore.getSnapshot().game?.storyteller).toBe("Other tab");
    // localStorage.clear() elsewhere arrives with a null key.
    localStorage.clear();
    window.dispatchEvent(new StorageEvent("storage", { key: null }));
    expect(companionStore.getSnapshot()).toEqual({ game: null, draft: null, past: [], future: [] });
    unsubscribe();
  });

  it("abandon wipes both documents and the history", () => {
    companionStore.startGame(fresh());
    companionStore.updateGame((s) => ({ ...s, storyteller: "Zed" }));
    companionStore.abandon();
    expect(companionStore.getSnapshot()).toEqual({ game: null, draft: null, past: [], future: [] });
    expect(localStorage.getItem(STORAGE_KEYS.game)).toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.bag)).toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.history)).toBeNull();
  });
});

describe("companionStore — undo history", () => {
  it("undoes and redoes reducer applications, and survives a reload", () => {
    companionStore.startGame(fresh());
    companionStore.updateGame((s) => ({ ...s, storyteller: "A" }));
    companionStore.updateGame((s) => ({ ...s, storyteller: "B" }));
    expect(historyControls(companionStore.getSnapshot()).canUndo).toBe(true);
    companionStore.undo();
    expect(companionStore.getSnapshot().game?.storyteller).toBe("A");
    expect(historyControls(companionStore.getSnapshot()).canRedo).toBe(true);
    companionStore.redo();
    expect(companionStore.getSnapshot().game?.storyteller).toBe("B");
    companionStore.undo();
    companionStore.undo();
    expect(companionStore.getSnapshot().game?.storyteller).toBeUndefined();
    expect(historyControls(companionStore.getSnapshot()).canUndo).toBe(false);
    // A new change after an undo drops the redo branch.
    companionStore.updateGame((s) => ({ ...s, storyteller: "C" }));
    expect(historyControls(companionStore.getSnapshot()).canRedo).toBe(false);
    // The past is persisted: a fresh store (a reload) can still undo.
    companionStore.reset();
    expect(companionStore.getSnapshot().past).toHaveLength(1);
    companionStore.undo();
    expect(companionStore.getSnapshot().game?.storyteller).toBeUndefined();
  });

  it("labels the next undo with the log line it takes back", () => {
    companionStore.startGame(fresh());
    companionStore.updateGame((s) => kill(s, 2, "storyteller"));
    expect(historyControls(companionStore.getSnapshot()).undoLabel).toBe("P2 died.");
    companionStore.updateGame((s) => ({ ...s, storyteller: "Zed" })); // no log line
    expect(historyControls(companionStore.getSnapshot()).undoLabel).toBeUndefined();
  });

  it("'back to the night' rewinds through the dawn and the day's changes", () => {
    companionStore.startGame(fresh());
    companionStore.updateGame((s) => recordDemonKill(s, 2, "dies"));
    companionStore.updateGame(dawn);
    companionStore.updateGame((s) => recordNomination(s, 1, 3, 3));
    const controls = historyControls(companionStore.getSnapshot());
    expect(controls.canBackToNight).toBe(true);
    companionStore.undoUntil((s) => s.phase.kind === "night");
    const game = companionStore.getSnapshot().game;
    expect(game?.phase).toEqual({ kind: "night", night: 1 });
    // The kill recorded before dawn is still there; only dawn and after were undone.
    expect(game?.players[2].diedTonight).toBe(true);
    expect(companionStore.getSnapshot().future).toHaveLength(2);
    expect(historyControls(companionStore.getSnapshot()).canBackToNight).toBe(false);
  });

  it("keeps at most HISTORY_LIMIT states", () => {
    companionStore.startGame(fresh());
    for (let i = 0; i < HISTORY_LIMIT + 5; i++) {
      companionStore.updateGame((s) => ({ ...s, storyteller: `S${i}` }));
    }
    expect(companionStore.getSnapshot().past).toHaveLength(HISTORY_LIMIT);
    expect(loadHistory()).toHaveLength(HISTORY_LIMIT);
  });
});
