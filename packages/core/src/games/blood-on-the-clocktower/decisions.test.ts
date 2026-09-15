import { describe, expect, it } from "vitest";
import type { CharacterId } from "./characters.ts";
import {
  addTraveller,
  beginMastermindDay,
  beginNight,
  createGame,
  dawn,
  endDay,
  executeAboutToDie,
  infoGivenTonight,
  kill,
  markAbilityUsed,
  recordAdvocateChoice,
  recordDemonKill,
  recordInfoGiven,
  recordJudgeRuling,
  recordMoonchildChoice,
  recordNomination,
  recordVirginTrigger,
  setDrunk,
  setMonkProtection,
  setPoison,
  spareByPacifist,
} from "./companion.ts";
import {
  deathOutcome,
  demonAttackOutcome,
  executionOutcome,
  exorcistBlocksDemon,
  gamblerOutcome,
  mayorWin,
  moonchildCurseOutcome,
  professorOutcome,
  slayerShot,
  virginNomination,
} from "./decisions.ts";
import type { GameSetup } from "./setup.ts";

const NAMES = ["Alice", "Bob", "Cara", "Dan", "Eve", "Finn", "Gwen", "Hana"];

function game(
  edition: "trouble-brewing" | "bad-moon-rising",
  chars: CharacterId[],
  believed: Partial<Record<number, CharacterId>> = {},
) {
  const setup: GameSetup = {
    edition,
    seats: chars.map((character, seat) => ({
      seat,
      name: NAMES[seat],
      character,
      ...(believed[seat] ? { believedCharacter: believed[seat] } : {}),
    })),
    distribution: { townsfolk: 5, outsiders: 0, minions: 1, demons: 1 },
    demonBluffs:
      edition === "bad-moon-rising"
        ? ["innkeeper", "courtier", "gossip"]
        : ["chef", "slayer", "saint"],
  };
  return beginNight(createGame(setup));
}

// seat 0 Imp, 1 Scarlet Woman, 2 Monk, 3 Soldier, 4 Mayor, 5 Virgin, 6 Slayer, 7 Saint
const tb = () =>
  game("trouble-brewing", [
    "imp",
    "scarlet-woman",
    "monk",
    "soldier",
    "mayor",
    "virgin",
    "slayer",
    "saint",
  ]);

describe("deathOutcome — Trouble Brewing's shields only stop the Demon", () => {
  it("the Monk's ward and the sober Soldier bounce a Demon attack, and the engine honours it", () => {
    let s = endDay(dawn(tb()));
    s = setMonkProtection(s, 4);
    expect(deathOutcome(s, 4, "demon").protections).toEqual(["monk"]);
    expect(deathOutcome(s, 3, "demon").protections).toEqual(["soldier"]);
    expect(deathOutcome(s, 3, "execution").protections).toEqual([]);
    s = recordDemonKill(s, 3, "dies");
    expect(s.players[3].alive).toBe(true);
    expect(s.log.at(-1)?.text).toContain("the Soldier is safe from the Demon");
  });

  it("a poisoned Soldier is not safe; the Storyteller's own kill pierces everything", () => {
    let s = endDay(dawn(tb()));
    s = setPoison(s, 3);
    expect(deathOutcome(s, 3, "demon").protections).toEqual([]);
    s = setMonkProtection(s, 4);
    expect(deathOutcome(s, 4, "storyteller").protections).toEqual([]);
  });

  it("reports an already-dead target", () => {
    let s = endDay(dawn(tb()));
    s = kill(s, 7, "storyteller");
    expect(deathOutcome(s, 7, "demon")).toEqual({
      alreadyDead: true,
      protections: [],
      zombuulFakeDeath: false,
    });
  });

  it("a sober Zombuul only appears to die", () => {
    const s = endDay(
      dawn(
        game("bad-moon-rising", [
          "zombuul",
          "godfather",
          "sailor",
          "chambermaid",
          "innkeeper",
          "tea-lady",
          "fool",
          "gossip",
        ]),
      ),
    );
    expect(deathOutcome(s, 0, "execution").zombuulFakeDeath).toBe(true);
    expect(deathOutcome(s, 2, "demon").protections).toEqual(["sober-sailor"]);
  });
});

describe("demonAttackOutcome", () => {
  it("offers the Mayor redirect only for a sober, alive Mayor that isn't the Demon", () => {
    let s = endDay(dawn(tb()));
    expect(demonAttackOutcome(s, 4).mayorRedirect).toBe(true);
    s = setPoison(s, 4);
    expect(demonAttackOutcome(s, 4).mayorRedirect).toBe(false);
  });

  it("a self-kill lists the star-pass candidates, Scarlet Woman first", () => {
    const s = endDay(
      dawn(
        game("trouble-brewing", [
          "imp",
          "poisoner",
          "scarlet-woman",
          "monk",
          "soldier",
          "mayor",
          "virgin",
        ]),
      ),
    );
    const out = demonAttackOutcome(s, 0);
    expect(out.self).toBe(true);
    expect(out.starPassCandidates).toEqual([2, 1]);
    expect(demonAttackOutcome(s, 3).starPassCandidates).toEqual([]);
  });
});

describe("virginNomination", () => {
  it("executes a Townsfolk nominator, lets the Storyteller decide for the Spy, and nothing else", () => {
    const s = dawn(
      game("trouble-brewing", ["imp", "spy", "monk", "saint", "mayor", "virgin", "slayer"]),
    );
    expect(virginNomination(s, 2, 5)).toEqual({ kind: "executes" });
    expect(virginNomination(s, 1, 5)).toEqual({ kind: "spy-may-register" });
    expect(virginNomination(s, 3, 5)).toEqual({
      kind: "nothing",
      reason: "nominator-not-townsfolk",
    });
    expect(virginNomination(s, 2, 4)).toBeUndefined();
  });

  it("the Drunk who thinks they're the Virgin, and a poisoned Virgin, trigger nothing — but still spend it", () => {
    const drunk = dawn(
      game("trouble-brewing", ["imp", "poisoner", "monk", "drunk", "mayor", "virgin", "slayer"], {
        3: "virgin",
      }),
    );
    expect(virginNomination(drunk, 2, 3)).toEqual({ kind: "nothing", reason: "virgin-void" });
    let poisoned = dawn(setPoison(tb(), 5));
    expect(virginNomination(poisoned, 2, 5)).toEqual({ kind: "nothing", reason: "virgin-void" });
    poisoned = recordVirginTrigger(poisoned, 2, 5, false);
    expect(virginNomination(poisoned, 2, 5)).toBeUndefined();
  });
});

describe("slayerShot", () => {
  it("kills only when a working Slayer shoots the Demon; the Recluse is the Storyteller's call", () => {
    let s = dawn(
      game("trouble-brewing", [
        "imp",
        "poisoner",
        "recluse",
        "soldier",
        "mayor",
        "virgin",
        "slayer",
      ]),
    );
    expect(slayerShot(s, 6, 0)).toEqual({ kind: "dies" });
    expect(slayerShot(s, 6, 2)).toEqual({ kind: "recluse-may-register" });
    expect(slayerShot(s, 6, 3)).toEqual({ kind: "nothing", reason: "not-demon" });
    expect(slayerShot(s, 4, 0)).toEqual({ kind: "nothing", reason: "not-slayer" });
    s = setPoison(s, 6);
    expect(slayerShot(s, 6, 0)).toEqual({ kind: "nothing", reason: "slayer-void" });
    s = markAbilityUsed(setPoison(s, undefined), 6);
    expect(slayerShot(s, 6, 0)).toEqual({ kind: "nothing", reason: "spent" });
  });
});

describe("executions", () => {
  it("executing the sober Saint ends the game for evil — inside the reducer", () => {
    let s = dawn(tb());
    expect(executionOutcome(s, 7).saintLoss).toBe(true);
    s = recordNomination(s, 2, 7, 4);
    s = executeAboutToDie(s);
    expect(s.phase).toEqual({ kind: "ended", winner: "evil", reason: "the Saint was executed" });
  });

  it("a poisoned Saint is just a dead Outsider", () => {
    let s = dawn(setPoison(tb(), 7));
    expect(executionOutcome(s, 7).saintLoss).toBe(false);
    s = recordNomination(s, 2, 7, 4);
    s = executeAboutToDie(s);
    expect(s.phase.kind).toBe("day");
  });

  it("offers the Scapegoat of the nominee's alignment", () => {
    let s = dawn(tb());
    s = addTraveller(s, "Ivy", "scapegoat", "evil");
    expect(executionOutcome(s, 1).scapegoatSeat).toBe(8);
    expect(executionOutcome(s, 2).scapegoatSeat).toBeUndefined();
  });

  it("BMR: the Devil's Advocate's client is executed but lives; the Pacifist may spare a good nominee", () => {
    let s = game("bad-moon-rising", [
      "zombuul",
      "devils-advocate",
      "sailor",
      "chambermaid",
      "pacifist",
      "tea-lady",
      "fool",
      "gossip",
    ]);
    s = recordAdvocateChoice(s, 1, 7);
    s = dawn(s);
    expect(executionOutcome(s, 7).protections).toEqual(["devils-advocate"]);
    // Already saved — no Pacifist option on top.
    expect(executionOutcome(s, 7).pacifistSeat).toBeUndefined();
    expect(executionOutcome(s, 3).pacifistSeat).toBe(4);
    expect(executionOutcome(s, 1).pacifistSeat).toBeUndefined(); // evil
    s = setDrunk(s, 4, 1, "sailor");
    expect(executionOutcome(s, 3).pacifistSeat).toBeUndefined();
  });

  it("on the Mastermind's final day, the executed player's team loses — by tally, ruling, or mercy", () => {
    const base = () => {
      let s = game("bad-moon-rising", [
        "zombuul",
        "mastermind",
        "sailor",
        "judge",
        "pacifist",
        "tea-lady",
        "fool",
        "gossip",
      ]);
      s = dawn(s);
      s = kill(s, 0, "storyteller"); // Demon dead
      return beginMastermindDay(s);
    };
    // A good player executed → evil wins.
    let s = base();
    s = recordNomination(s, 2, 7, 4);
    s = executeAboutToDie(s);
    expect(s.phase).toMatchObject({ kind: "ended", winner: "evil" });
    // The Judge forcing a Minion's execution → good wins.
    s = base();
    s = recordNomination(s, 2, 1, 1);
    s = recordJudgeRuling(s, 3, 1, true);
    expect(s.phase).toMatchObject({ kind: "ended", winner: "good" });
    // Spared by the Pacifist still counts as the good player's execution.
    s = base();
    s = recordNomination(s, 2, 7, 4);
    s = spareByPacifist(s, 7);
    expect(s.players[7].alive).toBe(true);
    expect(s.phase).toMatchObject({ kind: "ended", winner: "evil" });
    // No execution at all → good wins when the day ends.
    s = base();
    s = endDay(s);
    expect(s.phase).toMatchObject({ kind: "ended", winner: "good" });
  });
});

describe("mayorWin", () => {
  it("needs exactly three alive, no execution, and a sober Mayor; travellers block it", () => {
    let s = dawn(tb());
    expect(mayorWin(s)).toBeUndefined();
    for (const seat of [0, 1, 2, 5, 6]) s = kill(s, seat, "storyteller");
    expect(mayorWin(s)).toEqual({ kind: "available" });
    s = addTraveller(s, "Ivy", "beggar", "good");
    expect(mayorWin(s)).toEqual({ kind: "blocked-by-travellers", alive: 4 });
    s = kill(s, 8, "exile");
    s = setPoison(s, 4);
    expect(mayorWin(s)).toBeUndefined();
  });
});

describe("night verdicts", () => {
  const bmr = () =>
    game("bad-moon-rising", [
      "pukka",
      "godfather",
      "gambler",
      "professor",
      "exorcist",
      "tea-lady",
      "fool",
      "moonchild",
    ]);

  it("the Gambler", () => {
    let s = bmr();
    expect(gamblerOutcome(s, 2, 0, "pukka")).toBe("correct");
    expect(gamblerOutcome(s, 2, 0, "zombuul")).toBe("dies");
    s = setDrunk(s, 2, 1, "sailor");
    expect(gamblerOutcome(s, 2, 0, "zombuul")).toBe("void");
  });

  it("the Professor", () => {
    let s = bmr();
    s = kill(s, 4, "storyteller");
    s = kill(s, 1, "storyteller");
    expect(professorOutcome(s, 3, 4)).toBe("resurrects");
    expect(professorOutcome(s, 3, 1)).toBe("not-townsfolk");
    s = setDrunk(s, 3, 1, "sailor");
    expect(professorOutcome(s, 3, 4)).toBe("void");
  });

  it("the Exorcist", () => {
    let s = bmr();
    expect(exorcistBlocksDemon(s, 4, 0)).toBe(true);
    expect(exorcistBlocksDemon(s, 4, 1)).toBe(false);
    s = setDrunk(s, 4, 1, "sailor");
    expect(exorcistBlocksDemon(s, 4, 0)).toBe(false);
  });

  it("the Moonchild's curse remembers whether it was cast void", () => {
    let s = dawn(bmr());
    s = kill(s, 7, "storyteller");
    s = recordMoonchildChoice(s, 5);
    s = endDay(s);
    expect(moonchildCurseOutcome(s)).toEqual({
      target: 5,
      good: true,
      castVoid: false,
      dies: true,
    });
    let v = dawn(bmr());
    v = setDrunk(v, 7, 1, "sailor");
    v = kill(v, 7, "storyteller");
    v = recordMoonchildChoice(v, 1);
    v = endDay(v);
    expect(moonchildCurseOutcome(v)).toEqual({
      target: 1,
      good: false,
      castVoid: true,
      dies: false,
    });
  });
});

describe("recordInfoGiven", () => {
  it("keeps one entry per night, next to the truth, and logs it", () => {
    let s = tb();
    s = recordInfoGiven(s, 2, "1", "0");
    expect(s.players[2].infoGiven).toEqual([{ night: 1, told: "1", truth: "0" }]);
    expect(s.log.at(-1)?.text).toBe("Told Cara (Monk): 1 (true: 0).");
    s = recordInfoGiven(s, 2, "0", "0"); // corrected
    expect(s.players[2].infoGiven).toEqual([{ night: 1, told: "0", truth: "0" }]);
    expect(s.log.at(-1)?.text).toBe("Told Cara (Monk): 0.");
    expect(infoGivenTonight(s, 2)).toEqual({ night: 1, told: "0", truth: "0" });
    s = endDay(dawn(s));
    expect(infoGivenTonight(s, 2)).toBeUndefined();
    s = recordInfoGiven(s, 2, "YES");
    expect(s.players[2].infoGiven).toHaveLength(2);
    // Nothing is recorded outside the night.
    const daytime = dawn(s);
    expect(recordInfoGiven(daytime, 2, "x")).toBe(daytime);
  });
});
