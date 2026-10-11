import {
  beginNight,
  createGame,
  endGame,
} from "@boardgames/core/games/blood-on-the-clocktower/companion";
import type { GameSetup } from "@boardgames/core/games/blood-on-the-clocktower/setup";
import { beforeEach, describe, expect, it, vi } from "vitest";

const recordCompanionGame = vi.fn(async (_id: string, _record: unknown) => true);
vi.mock("../../../lib/companion-records", () => ({
  recordCompanionGame: (id: string, record: unknown) => recordCompanionGame(id, record),
  newCompanionRecordId: () => "stamped-0001",
  useCompanionRecordOutbox: () => ({ pendingCount: 0 }),
}));

const { recordEndedGame } = await import("./match-history");
const { companionStore } = await import("./store");

const setup: GameSetup = {
  seats: ["imp", "poisoner", "empath", "fortune-teller", "monk"].map((character, seat) => ({
    seat,
    name: `P${seat}`,
    character: character as never,
  })),
  distribution: { townsfolk: 3, outsiders: 0, minions: 1, demons: 1 },
  demonBluffs: ["chef", "slayer", "saint"],
};

beforeEach(() => {
  localStorage.clear();
  companionStore.reset();
  recordCompanionGame.mockClear();
});

describe("recordEndedGame", () => {
  it("queues the ended game under its id, validated", async () => {
    const game = endGame(
      beginNight(createGame(setup, { gameId: "game-0001", startedAt: "2026-10-10T19:00:00.000Z" })),
      "good",
      "the Demon is dead",
    );
    expect(await recordEndedGame(game, new Date("2026-10-10T20:00:00.000Z"))).toBe(true);
    expect(recordCompanionGame).toHaveBeenCalledWith(
      "game-0001",
      expect.objectContaining({ winner: "good", days: 0, endedAt: "2026-10-10T20:00:00.000Z" }),
    );
  });

  it("does nothing for a running game or one without an id yet", async () => {
    const running = beginNight(createGame(setup, { gameId: "game-0001" }));
    expect(await recordEndedGame(running)).toBe(false);
    const noId = endGame(beginNight(createGame(setup)), "evil", "two players remain");
    expect(await recordEndedGame(noId)).toBe(false);
    expect(recordCompanionGame).not.toHaveBeenCalled();
  });
});

describe("companionStore.stampGameId", () => {
  it("gives an older game one id across the running state and its Undo history", () => {
    companionStore.startGame(beginNight(createGame(setup)));
    companionStore.updateGame((s) => ({ ...s, storyteller: "Mantas" }));
    companionStore.stampGameId("stamped-0001");
    const snap = companionStore.getSnapshot();
    expect(snap.game?.gameId).toBe("stamped-0001");
    expect(snap.past.map((s) => s.gameId)).toEqual(["stamped-0001"]);
    // Bookkeeping, not a move: nothing new to undo.
    expect(snap.past).toHaveLength(1);
    companionStore.undo();
    expect(companionStore.getSnapshot().game?.gameId).toBe("stamped-0001");
    // An id once given is kept.
    companionStore.stampGameId("other-00001");
    expect(companionStore.getSnapshot().game?.gameId).toBe("stamped-0001");
  });
});
