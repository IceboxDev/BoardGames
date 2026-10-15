import { describe, expect, it } from "vitest";
import { applyCompanionAction, CompanionActionSchema } from "../actions.ts";
import type { CharacterId } from "../characters.ts";
import { beginNight, createGame, dawn, endDay, nightQueue } from "../companion.ts";
import type { GameSetup } from "../setup.ts";
import { promptForCharacter } from "../wake-prompts.ts";
import { resolutionsFor } from "./resolutions.ts";

function table(characters: CharacterId[], edition: GameSetup["edition"]) {
  const setup: GameSetup = {
    edition,
    seats: characters.map((character, seat) => ({ seat, name: `P${seat}`, character })),
    distribution: { townsfolk: 0, outsiders: 0, minions: 0, demons: 0 },
    demonBluffs: [],
  };
  return createGame(setup, { gameId: "g", startedAt: "1970-01-01T00:00:00.000Z" });
}

/** Night 2 for the given table, so every "other nights" ability wakes. */
function secondNight(characters: CharacterId[], edition: GameSetup["edition"]) {
  return endDay(dawn(beginNight(table(characters, edition))));
}

function playEveryStep(characters: CharacterId[], edition: GameSetup["edition"]) {
  const state = secondNight(characters, edition);
  let seen = 0;
  for (const step of nightQueue(state)) {
    if (step.kind !== "wake") continue;
    const prompt = promptForCharacter(state, step.character, step.seat);
    const seats =
      prompt.kind === "players"
        ? state.players
            .filter((p) => p.seat !== step.seat && p.alive)
            .slice(0, Math.max(prompt.min, Math.min(1, prompt.max)))
            .map((p) => p.seat)
        : prompt.kind === "player-and-character"
          ? [step.seat === 0 ? 1 : 0]
          : [];
    const character: CharacterId | undefined =
      prompt.kind === "character" || prompt.kind === "player-and-character" ? "chef" : undefined;
    for (const r of resolutionsFor(state, step, { seats, ...(character ? { character } : {}) })) {
      expect(CompanionActionSchema.parse(r.action)).toEqual(r.action);
      expect(() => applyCompanionAction(state, r.action)).not.toThrow();
      seen++;
    }
  }
  return seen;
}

describe("night resolutions", () => {
  it("offer a valid Grimoire edit for every Trouble Brewing night choice", () => {
    expect(
      playEveryStep(
        ["poisoner", "monk", "butler", "imp", "fortune-teller", "empath", "chef", "slayer"],
        "trouble-brewing",
      ),
    ).toBeGreaterThan(3);
  });

  it("offer a valid Grimoire edit for every Bad Moon Rising night choice", () => {
    expect(
      playEveryStep(
        [
          "sailor",
          "innkeeper",
          "exorcist",
          "gambler",
          "devils-advocate",
          "assassin",
          "zombuul",
          "courtier",
          "professor",
          "chambermaid",
        ],
        "bad-moon-rising",
      ),
    ).toBeGreaterThan(5);
  });

  it("offer the Imp's star pass to each Minion", () => {
    const state = secondNight(
      ["imp", "poisoner", "scarlet-woman", "chef", "empath", "monk", "saint"],
      "trouble-brewing",
    );
    const step = nightQueue(state).find((s) => s.kind === "wake" && s.character === "imp");
    if (!step) throw new Error("the Imp doesn't wake");
    const options = resolutionsFor(state, step, { seats: [0] });
    expect(options.map((o) => o.label)).toEqual([
      "Imp dies — P2 becomes the Imp",
      "Imp dies — P1 becomes the Imp",
    ]);
    const after = applyCompanionAction(state, options[0]?.action ?? { type: "dawn" });
    expect(after.players[2]?.character).toBe("imp");
  });
});
