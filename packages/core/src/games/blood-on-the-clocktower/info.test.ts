import { describe, expect, it } from "vitest";
import { createRng } from "../../lib/rng.ts";
import {
  beginNight,
  chefNumber,
  createGame,
  empathNumber,
  fortuneTellerPing,
  nightQueue,
  setPoison,
} from "./companion.ts";
import { describeInfo, InfoPayloadSchema, suggestedInfo } from "./info.ts";
import type { GameSetup } from "./setup.ts";

// 7 players, no Drunk: Washerwoman, Chef, Empath, Fortune Teller, Butler, Poisoner, Imp.
const SETUP: GameSetup = {
  edition: "trouble-brewing",
  seats: [
    { seat: 0, name: "Ann", character: "washerwoman" },
    { seat: 1, name: "Ben", character: "chef" },
    { seat: 2, name: "Cid", character: "empath" },
    { seat: 3, name: "Dee", character: "fortune-teller" },
    { seat: 4, name: "Eve", character: "butler" },
    { seat: 5, name: "Fin", character: "poisoner" },
    { seat: 6, name: "Gus", character: "imp" },
  ],
  distribution: { townsfolk: 4, outsiders: 1, minions: 1, demons: 1 },
  demonBluffs: ["librarian", "monk", "virgin"],
  redHerringSeat: 0,
};

function night1() {
  return beginNight(createGame(SETUP, { gameId: "g", startedAt: "1970-01-01T00:00:00.000Z" }));
}

function wakeStep(state: ReturnType<typeof night1>, seat: number) {
  const step = nightQueue(state).find((s) => s.kind === "wake" && s.seat === seat);
  if (!step) throw new Error(`seat ${seat} doesn't wake`);
  return step;
}

describe("suggested info", () => {
  it("tells the Chef and Empath their true numbers", () => {
    const s = night1();
    expect(suggestedInfo(s, wakeStep(s, 1))?.payload).toMatchObject({ value: chefNumber(s) });
    expect(suggestedInfo(s, wakeStep(s, 2))?.payload).toMatchObject({ value: empathNumber(s, 2) });
  });

  it("answers the Fortune Teller only once they have picked", () => {
    const s = night1();
    const step = wakeStep(s, 3);
    expect(suggestedInfo(s, step)).toBeNull();
    const told = suggestedInfo(s, step, { choice: { seats: [0, 6] } });
    expect(told?.payload).toEqual({
      kind: "yes-no",
      value: fortuneTellerPing(s, 0, 6),
      label: "Is either the Demon?",
    });
  });

  it("gives the Washerwoman a real Townsfolk among the pair, in room seats", () => {
    const s = night1();
    const told = suggestedInfo(s, wakeStep(s, 0), { rng: createRng(1), seatId: (c) => c + 10 });
    expect(told?.payload.kind).toBe("players-character");
    if (told?.payload.kind !== "players-character") return;
    expect(told.payload.seats.every((x) => x >= 10)).toBe(true);
    const real = told.payload.seats.map((x) => SETUP.seats[x - 10]?.character);
    expect(real).toContain(told.payload.character);
  });

  it("shows the Minions their Demon and the Demon its bluffs", () => {
    const s = night1();
    const minionInfo = nightQueue(s).find((x) => x.kind === "minion-info");
    const demonInfo = nightQueue(s).find((x) => x.kind === "demon-info");
    if (!minionInfo || !demonInfo) throw new Error("no evil info at 7 players");
    expect(suggestedInfo(s, minionInfo)?.payload).toEqual({
      kind: "evil-team",
      demon: 6,
      minions: [5],
    });
    expect(suggestedInfo(s, demonInfo)?.payload).toEqual({
      kind: "evil-team",
      minions: [5],
      bluffs: ["librarian", "monk", "virgin"],
    });
  });

  it("flags a poisoned player's info as void", () => {
    const s = setPoison(night1(), 1);
    expect(suggestedInfo(s, wakeStep(s, 1))?.voided).toBe(true);
  });

  it("describes every payload in words, and the schema accepts them", () => {
    const s = night1();
    for (const step of nightQueue(s)) {
      const told = suggestedInfo(s, step, { choice: { seats: [0, 1] }, rng: createRng(2) });
      if (!told) continue;
      expect(InfoPayloadSchema.parse(told.payload)).toEqual(told.payload);
      expect(describeInfo(told.payload, (x) => SETUP.seats[x]?.name ?? "?")).not.toBe("");
    }
  });
});
