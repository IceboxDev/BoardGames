import { describe, expect, it } from "vitest";
import { createRng } from "../../lib/rng.ts";
import {
  applyCompanionAction,
  COMPANION_ACTION_TYPES,
  CompanionActionSchema,
  UnknownSeatError,
} from "./actions.ts";
import * as companion from "./companion.ts";
import { beginNight, createGame, nightQueue } from "./companion.ts";
import { dealSetup } from "./setup.ts";
import * as voting from "./voting.ts";

/** Exported functions that read state or build it — not grimoire edits. */
const NOT_AN_ACTION = new Set([
  // construction
  "createGame",
  // selectors
  "apparentCharacter",
  "isTraveller",
  "isEvilPlayer",
  "minstrelActive",
  "isDrunkPlayer",
  "abilityVoid",
  "teaLadyProtectedSeats",
  "aliveCount",
  "aliveResidents",
  "presentCount",
  "exileVotesRequired",
  "demonAlive",
  "demonPlayer",
  "playerAt",
  "nameAt",
  "nightStepId",
  "wakeCharacter",
  "isStepResolved",
  "nightQueue",
  "nightCursorIndex",
  "currentNightStep",
  "chambermaidNumber",
  "deathProtections",
  "infoGivenTonight",
  "poChargeActive",
  "demonAttacksWanted",
  "demonAttackStatus",
  "lunaticPoChargeActive",
  "lunaticAttacksWanted",
  "voudonActive",
  "votesRequired",
  "canNominate",
  "canBeNominated",
  "evilSeats",
  "chefNumber",
  "aliveNeighbours",
  "empathNumber",
  "fortuneTellerPing",
  "firstNightPairSuggestion",
  "undertakerInfo",
  "winPrompts",
  "mastermindVerdict",
  "saintExecuted",
  "voterStatus",
  "voteOrder",
  "tallyVotes",
]);

function game() {
  return beginNight(
    createGame(dealSetup(["A", "B", "C", "D", "E", "F", "G"], createRng(5)), {
      gameId: "g",
      startedAt: "1970-01-01T00:00:00.000Z",
    }),
  );
}

describe("grimoire actions", () => {
  it("cover every reducer — a new one needs an action (or a NOT_AN_ACTION entry)", () => {
    const exported = [...Object.entries(companion), ...Object.entries(voting)]
      .filter(([, v]) => typeof v === "function")
      .map(([k]) => k);
    const missing = exported.filter(
      (name) => !NOT_AN_ACTION.has(name) && !COMPANION_ACTION_TYPES.includes(name),
    );
    expect(missing).toEqual([]);
    // …and every action names a real reducer.
    expect(COMPANION_ACTION_TYPES.filter((t) => !exported.includes(t))).toEqual([]);
  });

  it("apply exactly like calling the reducer", () => {
    const s = game();
    expect(applyCompanionAction(s, { type: "kill", seat: 2, cause: "storyteller" })).toEqual(
      companion.kill(s, 2, "storyteller"),
    );
  });

  it("apply a batch in order (the Imp's star-pass)", () => {
    const s = game();
    const batch = CompanionActionSchema.parse({
      type: "batch",
      actions: [
        { type: "setPoison", seat: 1 },
        { type: "setMonkProtection", seat: 3 },
      ],
    });
    const out = applyCompanionAction(s, batch);
    expect(out.players[1]?.poisoned).toBe(true);
    expect(out.players[3]?.protectedTonight).toBe(true);
  });

  it("refuse a chair the table doesn't have", () => {
    expect(() => applyCompanionAction(game(), { type: "revive", seat: 9 })).toThrow(
      UnknownSeatError,
    );
  });

  it("reject malformed payloads at the schema", () => {
    expect(
      CompanionActionSchema.safeParse({ type: "kill", seat: -1, cause: "demon" }).success,
    ).toBe(false);
    expect(CompanionActionSchema.safeParse({ type: "nope" }).success).toBe(false);
    expect(CompanionActionSchema.safeParse({ type: "revive", seat: 1, extra: true }).success).toBe(
      false,
    );
    expect(
      CompanionActionSchema.safeParse({
        type: "batch",
        actions: Array.from({ length: 11 }, () => ({ type: "dawn" })),
      }).success,
    ).toBe(false);
  });

  it("move the night cursor", () => {
    const s = game();
    const next = applyCompanionAction(s, { type: "moveNightCursor", delta: 1 });
    expect(next.nightProgress.cursor).not.toEqual(s.nightProgress.cursor);
    expect(nightQueue(next).length).toBeGreaterThan(0);
  });
});
