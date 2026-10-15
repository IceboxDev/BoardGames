import { describe, expect, it } from "vitest";
import { createRng } from "../../lib/rng.ts";
import { CHARACTERS, type CharacterId } from "./characters.ts";
import { beginNight, createGame, kill, nightQueue } from "./companion.ts";
import { dealSetup } from "./setup.ts";
import {
  choiceProblem,
  promptForCharacter,
  publiclyAlive,
  wakePrompt,
  wakersOf,
} from "./wake-prompts.ts";

function game() {
  return beginNight(
    createGame(dealSetup(["A", "B", "C", "D", "E", "F", "G", "H"], createRng(11)), {
      gameId: "g",
      startedAt: "1970-01-01T00:00:00.000Z",
    }),
  );
}

/** Characters whose night action is a pure "learn something" — no pick. */
const INFO_ONLY = new Set<CharacterId>([
  "washerwoman",
  "librarian",
  "investigator",
  "chef",
  "empath",
  "undertaker",
  "spy",
  "scarlet-woman",
  "grandmother",
  "apprentice",
]);

describe("wake prompts", () => {
  it("ask every character with a night choice for it, and the rest nothing", () => {
    const s = game();
    for (const c of Object.values(CHARACTERS)) {
      if (!c.firstNightAction && !c.otherNightsAction) continue;
      const prompt = promptForCharacter(s, c.id, 0);
      if (INFO_ONLY.has(c.id)) expect(prompt.kind, c.id).toBe("info");
      else if (c.id !== "godfather") expect(prompt.kind, c.id).not.toBe("info");
    }
  });

  it("check a Fortune Teller's two picks", () => {
    const s = game();
    const prompt = promptForCharacter(s, "fortune-teller", 0);
    expect(choiceProblem(s, 0, prompt, { seats: [1, 2] })).toBeNull();
    expect(choiceProblem(s, 0, prompt, { seats: [1] })).toBe("choose 2 players");
    expect(choiceProblem(s, 0, prompt, { seats: [1, 1] })).toBe("pick each player once");
    expect(choiceProblem(s, 0, prompt, { seats: [1, 99] })).toBe("no such player");
  });

  it("refuse the Monk themself", () => {
    const s = game();
    const prompt = promptForCharacter(s, "monk", 3);
    expect(choiceProblem(s, 3, prompt, { seats: [3] })).toBe("you can't choose yourself");
  });

  it("never leak a night kill: tonight's victim still counts as alive", () => {
    const s = kill(game(), 4, "demon");
    const victim = s.players[4];
    if (!victim) throw new Error("no seat 4");
    expect(victim.alive).toBe(false);
    expect(publiclyAlive(s, victim)).toBe(true);
    const prompt = promptForCharacter(s, "chambermaid", 0);
    expect(choiceProblem(s, 0, prompt, { seats: [4, 5] })).toBeNull();
  });

  it("wake the woken player for each wake step", () => {
    const s = game();
    for (const step of nightQueue(s)) {
      const wakers = wakersOf(s, step);
      if (step.kind === "wake") expect(wakers).toEqual([step.seat]);
      if (step.kind === "dawn") expect(wakers).toEqual([]);
      expect(() => wakePrompt(s, step)).not.toThrow();
    }
  });
});
