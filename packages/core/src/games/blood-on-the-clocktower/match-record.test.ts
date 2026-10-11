import { describe, expect, it } from "vitest";
import { CompanionRecordSchema } from "../../protocol/http/companion-records.ts";
import type { CharacterId } from "./characters.ts";
import { beginNight, createGame, endGame } from "./companion.ts";
import { botcMatchRecord, daysReached } from "./match-record.ts";
import type { GameSetup } from "./setup.ts";

function setup(): GameSetup {
  const chars: CharacterId[] = ["imp", "poisoner", "empath", "monk", "drunk"];
  const names = ["Alice", "Bob", "Cara", "Dan", "Eve"];
  return {
    seats: chars.map((character, seat) => ({
      seat,
      name: names[seat] ?? "",
      character,
      ...(character === "drunk" ? { believedCharacter: "chef" as const } : {}),
    })),
    distribution: { townsfolk: 3, outsiders: 1, minions: 1, demons: 1 },
    demonBluffs: ["chef", "slayer", "saint"],
    redHerringSeat: 3,
  };
}

const STARTED = "2026-10-10T19:00:00.000Z";
const ENDED = "2026-10-10T20:30:00.000Z";

function game() {
  return beginNight(
    createGame(setup(), { storyteller: " Mantas ", gameId: "game-0001", startedAt: STARTED }),
  );
}

describe("botcMatchRecord", () => {
  it("is null while the game is running", () => {
    expect(botcMatchRecord(game(), ENDED)).toBeNull();
  });

  it("records who was what, the winner and the days reached", () => {
    let state = game();
    state = { ...state, log: [...state.log, { id: 90, when: "Day 2", text: "x" }] };
    state = endGame(state, "evil", "two players remain");
    const record = botcMatchRecord(state, ENDED);
    expect(record).toMatchObject({
      game: "blood-on-the-clocktower",
      edition: "trouble-brewing",
      storyteller: "Mantas",
      winner: "evil",
      reason: "two players remain",
      days: 2,
      startedAt: STARTED,
      endedAt: ENDED,
    });
    expect(record?.players.map((p) => [p.name, p.character, p.alignment])).toEqual([
      ["Alice", "imp", "evil"],
      ["Bob", "poisoner", "evil"],
      ["Cara", "empath", "good"],
      ["Dan", "monk", "good"],
      // The Drunk is recorded as the Drunk, not the Chef they believed.
      ["Eve", "drunk", "good"],
    ]);
    expect(CompanionRecordSchema.safeParse(record).success).toBe(true);
  });

  it("keeps games dealt before start times existed recordable", () => {
    const { startedAt: _s, gameId: _g, ...legacy } = endGame(game(), "good", "the Demon is dead");
    const record = botcMatchRecord(legacy, ENDED);
    expect(record?.startedAt).toBeNull();
    expect(CompanionRecordSchema.safeParse(record).success).toBe(true);
  });
});

describe("daysReached", () => {
  it("is 0 before the first day", () => {
    expect(daysReached(game())).toBe(0);
  });
});
