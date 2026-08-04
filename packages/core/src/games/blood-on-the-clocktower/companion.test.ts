import { describe, expect, it } from "vitest";
import type { CharacterId } from "./characters.ts";
import {
  beginNight,
  changeCharacter,
  chefNumber,
  createGame,
  dawn,
  empathNumber,
  endDay,
  executeAboutToDie,
  firstNightPairSuggestion,
  fortuneTellerPing,
  kill,
  nightQueue,
  recordDemonKill,
  recordNomination,
  recordSlayerShot,
  recordVirginTrigger,
  saintExecuted,
  setMonkProtection,
  setPoison,
  undertakerInfo,
  votesRequired,
  winPrompts,
} from "./companion.ts";
import type { GameSetup } from "./setup.ts";

// Hand-built 7-player game (no Drunk, no randomness):
// seat 0 Alice   Imp        (demon)
// seat 1 Bob     Poisoner   (minion)
// seat 2 Cara    Empath
// seat 3 Dan     Fortune Teller
// seat 4 Eve     Monk
// seat 5 Finn    Undertaker
// seat 6 Gwen    Soldier
function sevenPlayerSetup(): GameSetup {
  const chars: CharacterId[] = [
    "imp",
    "poisoner",
    "empath",
    "fortune-teller",
    "monk",
    "undertaker",
    "soldier",
  ];
  const names = ["Alice", "Bob", "Cara", "Dan", "Eve", "Finn", "Gwen"];
  return {
    seats: chars.map((character, seat) => ({ seat, name: names[seat], character })),
    distribution: { townsfolk: 5, outsiders: 0, minions: 1, demons: 1 },
    demonBluffs: ["chef", "slayer", "saint"],
    redHerringSeat: 6,
  };
}

function freshGame() {
  return beginNight(createGame(sevenPlayerSetup()));
}

describe("night queue — first night", () => {
  it("follows the first-night sheet with minion/demon info at 7+ players", () => {
    const state = freshGame();
    const kinds = nightQueue(state).map((s) => (s.kind === "wake" ? s.character : s.kind));
    expect(kinds).toEqual([
      "minion-info",
      "demon-info",
      "poisoner",
      "empath",
      "fortune-teller",
      "dawn",
    ]);
  });

  it("omits minion/demon info below 7 players", () => {
    const setup = sevenPlayerSetup();
    setup.seats = setup.seats.slice(0, 5);
    setup.distribution = { townsfolk: 3, outsiders: 0, minions: 1, demons: 1 };
    const state = beginNight(createGame(setup));
    const kinds = nightQueue(state).map((s) => (s.kind === "wake" ? s.character : s.kind));
    expect(kinds[0]).not.toBe("minion-info");
  });
});

describe("night queue — other nights", () => {
  it("wakes the Imp and Monk but not first-night-only characters", () => {
    let state = freshGame();
    state = dawn(state);
    state = endDay(state); // night 2
    const kinds = nightQueue(state).map((s) => (s.kind === "wake" ? s.character : s.kind));
    expect(kinds).toEqual(["poisoner", "monk", "imp", "empath", "fortune-teller", "dawn"]);
  });

  it("adds the Undertaker only the night after an execution", () => {
    let state = freshGame();
    state = dawn(state); // day 1
    state = recordNomination(state, 2, 1, 4); // Bob about to die
    state = executeAboutToDie(state);
    state = endDay(state); // night 2
    const kinds = nightQueue(state).map((s) => (s.kind === "wake" ? s.character : s.kind));
    expect(kinds).toContain("undertaker");
    expect(undertakerInfo(state)).toBe("poisoner");

    // Night 3 without an execution on day 2: no Undertaker step.
    state = dawn(state);
    state = endDay(state);
    const kinds3 = nightQueue(state).map((s) => (s.kind === "wake" ? s.character : s.kind));
    expect(kinds3).not.toContain("undertaker");
  });

  it("wakes the Ravenkeeper only on the night they die", () => {
    const setup = sevenPlayerSetup();
    setup.seats[5] = { seat: 5, name: "Finn", character: "ravenkeeper" };
    let state = beginNight(createGame(setup));
    state = dawn(state);
    state = endDay(state); // night 2
    expect(nightQueue(state).some((s) => s.kind === "wake" && s.character === "ravenkeeper")).toBe(
      false,
    );
    state = recordDemonKill(state, 5, "dies");
    expect(nightQueue(state).some((s) => s.kind === "wake" && s.character === "ravenkeeper")).toBe(
      true,
    );
  });

  it("the Drunk wakes as their believed character with the drunk flag", () => {
    const setup = sevenPlayerSetup();
    setup.seats[5] = { seat: 5, name: "Finn", character: "drunk", believedCharacter: "monk" };
    let state = beginNight(createGame(setup));
    state = dawn(state);
    state = endDay(state); // night 2 — monk acts on other nights
    const monkSteps = nightQueue(state).filter((s) => s.kind === "wake" && s.character === "monk");
    expect(monkSteps).toHaveLength(2); // real Monk (Eve) + drunk Finn
    const drunkStep = monkSteps.find((s) => s.kind === "wake" && s.seat === 5);
    expect(drunkStep && drunkStep.kind === "wake" && drunkStep.isDrunk).toBe(true);
  });
});

describe("statuses", () => {
  it("poison lasts tonight and tomorrow day, expiring at the next dusk", () => {
    let state = freshGame();
    state = setPoison(state, 2);
    expect(state.players[2].poisoned).toBe(true);
    state = dawn(state);
    expect(state.players[2].poisoned).toBe(true); // tomorrow day
    state = endDay(state); // next dusk
    expect(state.players[2].poisoned).toBe(false);
  });

  it("monk protection clears at dawn", () => {
    let state = freshGame();
    state = dawn(state);
    state = endDay(state);
    state = setMonkProtection(state, 2);
    expect(state.players[2].protectedTonight).toBe(true);
    state = dawn(state);
    expect(state.players[2].protectedTonight).toBe(false);
  });

  it("a night kill marks diedTonight and dawn announces + clears it", () => {
    let state = freshGame();
    state = dawn(state);
    state = endDay(state);
    state = recordDemonKill(state, 2, "dies");
    expect(state.players[2].alive).toBe(false);
    expect(state.players[2].diedTonight).toBe(true);
    state = dawn(state);
    expect(state.players[2].diedTonight).toBe(false);
    expect(state.log.at(-1)?.text).toContain("Cara");
  });
});

describe("day phase vote math", () => {
  it("requires ceil(alive/2) votes and tracks about-to-die", () => {
    let state = freshGame();
    state = dawn(state);
    expect(votesRequired(state)).toBe(4); // 7 alive
    state = recordNomination(state, 2, 0, 3);
    expect(state.day.aboutToDie).toBeUndefined();
    state = recordNomination(state, 3, 1, 4);
    expect(state.day.aboutToDie).toEqual({ seat: 1, votes: 4 });
  });

  it("a tie clears about-to-die and a later nominee must EXCEED the tied number", () => {
    let state = freshGame();
    state = dawn(state);
    state = recordNomination(state, 2, 0, 4);
    state = recordNomination(state, 3, 1, 4); // tie
    expect(state.day.aboutToDie).toBeUndefined();
    state = recordNomination(state, 4, 5, 4); // equals the tied number — still nobody
    expect(state.day.aboutToDie).toBeUndefined();
    state = recordNomination(state, 5, 6, 5); // exceeds it
    expect(state.day.aboutToDie).toEqual({ seat: 6, votes: 5 });
  });

  it("each player nominates once and is nominated once per day", () => {
    let state = freshGame();
    state = dawn(state);
    state = recordNomination(state, 2, 0, 1);
    expect(state.day.nominatorsUsed).toContain(2);
    expect(state.day.nomineesUsed).toContain(0);
  });

  it("execution records lastExecution for the Undertaker", () => {
    let state = freshGame();
    state = dawn(state);
    state = recordNomination(state, 2, 6, 4);
    state = executeAboutToDie(state);
    expect(state.players[6].alive).toBe(false);
    expect(state.lastExecution).toMatchObject({ day: 1, seat: 6, character: "soldier" });
  });
});

describe("storyteller info", () => {
  it("chef counts neighbouring evil pairs around the circle", () => {
    const state = freshGame();
    // Seats 0 (Imp) and 1 (Poisoner) are adjacent → one pair.
    expect(chefNumber(state)).toBe(1);
  });

  it("empath counts evil among the two nearest ALIVE neighbours", () => {
    let state = freshGame();
    // Cara (2) neighbours Bob (1, evil) and Dan (3, good) → 1.
    expect(empathNumber(state, 2)).toBe(1);
    // Kill Bob: Cara's neighbours become Alice (0, evil) and Dan (3) → 1.
    state = kill(state, 1, "storyteller");
    expect(empathNumber(state, 2)).toBe(1);
    // Kill Dan too: neighbours become Alice (0, evil) and Eve (4, good) → 1.
    state = kill(state, 3, "storyteller");
    expect(empathNumber(state, 2)).toBe(1);
  });

  it("fortune teller pings on the Demon and on the red herring", () => {
    const state = freshGame();
    expect(fortuneTellerPing(state, 0, 2)).toBe(true); // Imp
    expect(fortuneTellerPing(state, 6, 2)).toBe(true); // red herring (Gwen)
    expect(fortuneTellerPing(state, 2, 3)).toBe(false);
  });

  it("suggests a real pair for the Investigator-style info", () => {
    const state = freshGame();
    const suggestion = firstNightPairSuggestion(state, 2, "minion", () => 0);
    expect(suggestion).toBeDefined();
    if (suggestion) {
      expect(state.players[suggestion.realSeat].character).toBe("poisoner");
      expect(suggestion.character).toBe("poisoner");
      expect(suggestion.decoySeat).not.toBe(suggestion.realSeat);
    }
  });

  it("returns undefined when no player of the type is in play (Librarian zero)", () => {
    const state = freshGame();
    expect(firstNightPairSuggestion(state, 2, "outsider", () => 0)).toBeUndefined();
  });
});

describe("virgin & slayer day actions", () => {
  it("virgin trigger executes the nominator and consumes the day's execution", () => {
    const setup = sevenPlayerSetup();
    setup.seats[6] = { seat: 6, name: "Gwen", character: "virgin" };
    let state = beginNight(createGame(setup));
    state = dawn(state);
    state = recordVirginTrigger(state, 2, 6, true);
    expect(state.players[2].alive).toBe(false); // Cara executed
    expect(state.players[6].usedAbility).toBe(true);
    expect(state.day.executed).toBe(2);
    expect(state.lastExecution).toMatchObject({ day: 1, seat: 2 });
    expect(state.day.nominatorsUsed).toContain(2);
    expect(state.day.nomineesUsed).toContain(6);
  });

  it("virgin no-trigger only spends the ability, leaving the vote free to proceed", () => {
    const setup = sevenPlayerSetup();
    setup.seats[6] = { seat: 6, name: "Gwen", character: "virgin" };
    let state = beginNight(createGame(setup));
    state = dawn(state);
    state = recordVirginTrigger(state, 1, 6, false);
    expect(state.players[1].alive).toBe(true);
    expect(state.players[6].usedAbility).toBe(true);
    expect(state.day.nominatorsUsed).toHaveLength(0);
    state = recordNomination(state, 1, 6, 4);
    expect(state.day.aboutToDie).toEqual({ seat: 6, votes: 4 });
  });

  it("slayer shot kills the demon and spends a real slayer's ability", () => {
    const setup = sevenPlayerSetup();
    setup.seats[6] = { seat: 6, name: "Gwen", character: "slayer" };
    let state = beginNight(createGame(setup));
    state = dawn(state);
    state = recordSlayerShot(state, 6, 0, true);
    expect(state.players[0].alive).toBe(false);
    expect(state.players[6].usedAbility).toBe(true);
  });

  it("a bluffed slayer shot spends nothing", () => {
    let state = freshGame();
    state = dawn(state);
    state = recordSlayerShot(state, 2, 0, false); // Cara (Empath) bluffs
    expect(state.players[0].alive).toBe(true);
    expect(state.players[2].usedAbility).toBe(false);
  });
});

describe("win prompts", () => {
  it("good wins when the demon dies with no eligible Scarlet Woman", () => {
    let state = freshGame();
    state = dawn(state);
    state = kill(state, 0, "execution");
    expect(winPrompts(state)).toEqual([{ kind: "good-wins", reason: "the Demon is dead" }]);
  });

  it("offers the Scarlet Woman takeover with 5+ players alive", () => {
    const setup = sevenPlayerSetup();
    setup.seats[1] = { seat: 1, name: "Bob", character: "scarlet-woman" };
    let state = beginNight(createGame(setup));
    state = dawn(state);
    state = kill(state, 0, "execution");
    expect(winPrompts(state)).toEqual([{ kind: "scarlet-woman", seat: 1 }]);
    // Promote her: demon alive again, no prompts.
    state = changeCharacter(state, 1, "imp");
    expect(winPrompts(state)).toEqual([]);
    expect(state.pendingImpInfo).toBe(1);
  });

  it("evil wins at two players alive", () => {
    let state = freshGame();
    state = dawn(state);
    for (const seat of [1, 2, 3, 4, 5]) state = kill(state, seat, "storyteller");
    expect(winPrompts(state)).toEqual([{ kind: "evil-wins", reason: "only two players live" }]);
  });

  it("saint check ignores a poisoned saint", () => {
    const setup = sevenPlayerSetup();
    setup.seats[6] = { seat: 6, name: "Gwen", character: "saint" };
    let state = beginNight(createGame(setup));
    expect(saintExecuted(state, 6)).toBe(true);
    state = setPoison(state, 6);
    expect(saintExecuted(state, 6)).toBe(false);
  });
});
