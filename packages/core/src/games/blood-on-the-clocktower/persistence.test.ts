import { describe, expect, it } from "vitest";
import fixtures from "./__fixtures__/companion-state-v1.json" with { type: "json" };
import {
  beginNight,
  createGame,
  currentNightStep,
  dawn,
  demonAttackStatus,
  endDay,
  poChargeActive,
} from "./companion.ts";
import { parseBagDraft, parseCompanionState, parseRoster } from "./persistence.ts";
import { COMPANION_STATE_VERSION } from "./schema.ts";
import type { GameSetup } from "./setup.ts";
import { dealBag } from "./setup.ts";

// The fixtures were produced by the v1 reducer (commit 14c4d6c) and are
// frozen: a v1 phone that updates the app must load its running game.

function roundTrip(state: unknown) {
  return parseCompanionState(JSON.parse(JSON.stringify(state)));
}

describe("parseCompanionState — current version", () => {
  it("round-trips a fresh game", () => {
    const setup: GameSetup = {
      seats: ["imp", "poisoner", "empath", "fortune-teller", "monk"].map((character, seat) => ({
        seat,
        name: `P${seat}`,
        character: character as never,
      })),
      distribution: { townsfolk: 3, outsiders: 0, minions: 1, demons: 1 },
      demonBluffs: ["chef", "slayer", "saint"],
    };
    const state = endDay(dawn(beginNight(createGame(setup))));
    const result = roundTrip(state);
    expect(result).toEqual({ ok: true, value: state });
  });

  it("rejects garbage with a reason, never throws", () => {
    expect(parseCompanionState(null)).toEqual({ ok: false, reason: "not an object" });
    expect(parseCompanionState("{}")).toEqual({ ok: false, reason: "not an object" });
    const bad = parseCompanionState({ version: COMPANION_STATE_VERSION, players: "nope" });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.reason).toMatch(/players/);
  });

  it("refuses a document from a newer app instead of guessing", () => {
    const result = parseCompanionState({ version: COMPANION_STATE_VERSION + 1 });
    expect(result).toEqual({
      ok: false,
      reason: `saved by a newer app (v${COMPANION_STATE_VERSION + 1})`,
    });
  });

  it("drops unknown keys so a stale field can't linger for ever", () => {
    const setup: GameSetup = {
      seats: [{ seat: 0, name: "A", character: "imp" }],
      distribution: { townsfolk: 0, outsiders: 0, minions: 0, demons: 1 },
      demonBluffs: [],
    };
    const state = { ...createGame(setup), leftover: true };
    const result = roundTrip(state);
    expect(result.ok && "leftover" in result.value).toBe(false);
  });
});

describe("parseCompanionState — v1 migration", () => {
  it("a mid-night TB game keeps its cursor on the same step and knows the Demon already struck", () => {
    const result = parseCompanionState(fixtures.tbNight);
    expect(result.ok, !result.ok ? result.reason : "").toBe(true);
    if (!result.ok) return;
    const state = result.value;
    expect(state.version).toBe(COMPANION_STATE_VERSION);
    expect("nightStep" in state).toBe(false);
    expect(state.storyteller).toBe("Zed");
    // v1 pointed at index 2 of [poisoner, monk, imp, …]: the Imp.
    expect(currentNightStep(state)).toMatchObject({ kind: "wake", character: "imp" });
    // The Empath died to the Demon tonight → the attack is booked as done.
    expect(state.nightProgress.demonChoices).toEqual([2]);
    expect(demonAttackStatus(state).done).toBe(true);
  });

  it("a BMR day with a charged Po keeps the charge for the coming night", () => {
    const result = parseCompanionState(fixtures.bmrDay);
    expect(result.ok, !result.ok ? result.reason : "").toBe(true);
    if (!result.ok) return;
    expect("poCharged" in result.value).toBe(false);
    expect(result.value.poChargedNight).toBe(2);
    expect(poChargeActive(result.value)).toBe(true);
    const night = endDay(result.value);
    expect(demonAttackStatus(night).wanted).toBe(3);
  });

  it("a pre-Bad-Moon-Rising save (no `script`) is Trouble Brewing", () => {
    const result = parseCompanionState(fixtures.preBmr);
    expect(result.ok, !result.ok ? result.reason : "").toBe(true);
    if (result.ok) expect(result.value.script).toBe("trouble-brewing");
  });

  it("treats a document without a version as v1", () => {
    const { version: _v, ...unversioned } = fixtures.tbNight;
    expect(parseCompanionState(unversioned).ok).toBe(true);
  });
});

describe("parseBagDraft", () => {
  const bag = dealBag(7, () => 0.5, "new", "trouble-brewing");
  const seats = Array.from({ length: 7 }, (_, i) => ({ name: `P${i}` }));

  it("round-trips a current draft", () => {
    const draft = {
      version: 1,
      edition: "trouble-brewing",
      seats,
      bag,
      draws: seats.map(() => null),
    };
    expect(parseBagDraft(JSON.parse(JSON.stringify(draft)))).toEqual({ ok: true, value: draft });
  });

  it("migrates the unversioned August-2026 draft, defaulting the edition", () => {
    const legacy = { seats, bag, draws: seats.map(() => null), storyteller: "Zed" };
    const result = parseBagDraft(legacy);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.version).toBe(1);
      expect(result.value.edition).toBe("trouble-brewing");
      expect(result.value.storyteller).toBe("Zed");
    }
  });

  it("rejects a draft whose draws name an unknown character", () => {
    const result = parseBagDraft({
      version: 1,
      edition: "trouble-brewing",
      seats,
      bag,
      draws: ["dragon"],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/draws\.0/);
  });
});

describe("parseRoster", () => {
  it("keeps only string arrays", () => {
    expect(parseRoster(["a", "b"])).toEqual(["a", "b"]);
    expect(parseRoster(["a", 1])).toEqual([]);
    expect(parseRoster("a")).toEqual([]);
  });
});
