import { describe, expect, it } from "vitest";
import type { CharacterId } from "./characters.ts";
import {
  addTraveller,
  aliveNeighbours,
  beginNight,
  changeCharacter,
  createGame,
  currentNightStep,
  dawn,
  demonAttackStatus,
  endDay,
  isStepResolved,
  kill,
  moveNightCursor,
  moveSeat,
  nightCursorIndex,
  nightQueue,
  nightStepId,
  poChargeActive,
  recordAssassinKill,
  recordDemonKill,
  recordGamblerGuess,
  recordGossipKill,
  recordGossipStatement,
  recordGrandmotherDeath,
  recordInnkeeperChoice,
  recordMoonchildChoice,
  recordNomination,
  recordPoCharge,
  recordPukkaPoison,
  recordTinkerDeath,
  regurgitate,
  reorderSeats,
  resolveMoonchildCurse,
  setApprenticeAbility,
  setGrandchild,
  swapSeats,
  wakeCharacter,
} from "./companion.ts";
import type { GameSetup } from "./setup.ts";

const NAMES = ["Alice", "Bob", "Cara", "Dan", "Eve", "Finn", "Gwen", "Hana"];

function game(edition: "trouble-brewing" | "bad-moon-rising", chars: CharacterId[]) {
  const setup: GameSetup = {
    edition,
    seats: chars.map((character, seat) => ({ seat, name: NAMES[seat], character })),
    distribution: { townsfolk: 5, outsiders: 0, minions: 1, demons: 1 },
    demonBluffs:
      edition === "bad-moon-rising"
        ? ["innkeeper", "courtier", "gossip"]
        : ["chef", "slayer", "saint"],
  };
  return beginNight(createGame(setup));
}

/** Night 1 → day 1 (no deaths) → night 2. */
function secondNight(state: ReturnType<typeof game>) {
  return endDay(dawn(state));
}

const labels = (state: ReturnType<typeof game>) =>
  nightQueue(state).map((s) => (s.kind === "wake" ? s.character : s.kind));

/** Put the cursor on the wake step of `character` (throws when absent). */
function goTo(state: ReturnType<typeof game>, character: CharacterId) {
  const at = nightQueue(state).findIndex((x) => x.kind === "wake" && x.character === character);
  if (at === -1) throw new Error(`no ${character} step in ${labels(state).join(" > ")}`);
  return moveNightCursor(state, at - nightCursorIndex(state));
}

describe("night progress — the Demon's step is done by the Demon's own choices", () => {
  it("a Gambler who dies on their guess stays in the queue and does NOT finish the Zombuul's step", () => {
    let s = game("bad-moon-rising", [
      "zombuul",
      "gambler",
      "sailor",
      "chambermaid",
      "goon",
      "courtier",
      "assassin",
    ]);
    s = secondNight(s); // deathless day → the Zombuul acts
    const before = labels(s);
    expect(before.indexOf("gambler")).toBeLessThan(before.indexOf("zombuul"));
    s = goTo(s, "gambler");
    const at = nightCursorIndex(s);
    s = recordGamblerGuess(s, 1, 2, "innkeeper"); // wrong → the Gambler dies
    expect(s.players[1].alive).toBe(false);
    // The dead Gambler's step is kept, resolved, in its sheet slot; the
    // Storyteller is still on it (no jump).
    expect(labels(s)).toEqual(before);
    expect(nightCursorIndex(s)).toBe(at);
    expect(isStepResolved(s, nightQueue(s)[at])).toBe(true);
    // The Demon has not acted: their step must still offer the attack.
    expect(demonAttackStatus(s)).toEqual({ wanted: 1, choices: [], done: false });
    s = moveNightCursor(s, 1);
    expect(currentNightStep(s)).toMatchObject({ kind: "wake", character: "zombuul" });
    s = recordDemonKill(s, 3, "dies");
    expect(demonAttackStatus(s)).toEqual({ wanted: 1, choices: [3], done: true });
    expect(isStepResolved(s, currentNightStep(s) as never)).toBe(true);
  });

  it("a Storyteller 'mark dead' before the Imp's step does not finish it either", () => {
    let s = game("trouble-brewing", [
      "imp",
      "poisoner",
      "empath",
      "fortune-teller",
      "monk",
      "undertaker",
      "soldier",
    ]);
    s = secondNight(s);
    s = kill(s, 2, "storyteller");
    expect(s.players[2].diedTonight).toBe(true);
    expect(demonAttackStatus(s).done).toBe(false);
  });

  it("the Imp's star pass resolves the old Imp's step and the new Imp cannot attack again", () => {
    let s = game("trouble-brewing", [
      "imp",
      "scarlet-woman",
      "empath",
      "fortune-teller",
      "monk",
      "undertaker",
      "soldier",
    ]);
    s = secondNight(s);
    s = goTo(s, "imp");
    s = recordDemonKill(s, 0, "dies");
    s = changeCharacter(s, 1, "imp");
    expect(demonAttackStatus(s).done).toBe(true);
    // The old Imp's step stays under the thumb; the "you are the Imp" step
    // is queued at the Scarlet Woman's (earlier) slot without moving it.
    expect(currentNightStep(s)).toMatchObject({ kind: "wake", character: "imp", seat: 0 });
    expect(labels(s)).toContain("you-are-imp");
    expect(labels(s).indexOf("you-are-imp")).toBeLessThan(nightCursorIndex(s));
  });
});

describe("night progress — multi-pick demons", () => {
  const shabalothGame = () =>
    secondNight(
      game("bad-moon-rising", [
        "shabaloth",
        "godfather",
        "sailor",
        "chambermaid",
        "innkeeper",
        "tea-lady",
        "fool",
        "gossip",
      ]),
    );

  it("the Shabaloth's step is done after TWO picks and the picks become tomorrow's regurgitation menu", () => {
    let s = shabalothGame();
    s = recordDemonKill(s, 3, "dies");
    expect(demonAttackStatus(s)).toEqual({ wanted: 2, choices: [3], done: false });
    s = recordDemonKill(s, 7, "safe");
    expect(demonAttackStatus(s)).toEqual({ wanted: 2, choices: [3, 7], done: true });
    s = dawn(s);
    expect(s.shabalothVictims).toEqual([3, 7]);
    s = endDay(s);
    s = regurgitate(s, 3);
    expect(s.players[3].alive).toBe(true);
    // One regurgitation per night: the menu is consumed.
    expect(s.shabalothVictims).toBeUndefined();
  });

  it("the Po's charge is spent by the night it attacks, never earlier and never later", () => {
    let s = secondNight(
      game("bad-moon-rising", [
        "po",
        "godfather",
        "sailor",
        "chambermaid",
        "innkeeper",
        "tea-lady",
        "fool",
        "gossip",
      ]),
    );
    s = recordPoCharge(s);
    // Charging IS the Po's action tonight — and the three attacks are for NEXT time.
    expect(demonAttackStatus(s)).toEqual({ wanted: 1, choices: [], done: true });
    expect(poChargeActive(s)).toBe(false);
    s = dawn(s);
    expect(s.poChargedNight).toBe(2); // survives the dawn after the charge
    expect(poChargeActive(s)).toBe(true);
    s = endDay(s);
    expect(demonAttackStatus(s).wanted).toBe(3);
    s = recordDemonKill(s, 2, "dies");
    s = recordDemonKill(s, 3, "dies");
    // Only two of three attacks recorded (the Storyteller moved on).
    expect(demonAttackStatus(s).done).toBe(false);
    s = dawn(s);
    expect(s.poChargedNight).toBeUndefined(); // consumed: the Po chose SOMEONE
    expect(poChargeActive(s)).toBe(false);
    s = endDay(s);
    expect(demonAttackStatus(s).wanted).toBe(1);
  });
});

describe("night progress — the Pukka", () => {
  const pukkaGame = () =>
    game("bad-moon-rising", [
      "pukka",
      "godfather",
      "sailor",
      "chambermaid",
      "innkeeper",
      "tea-lady",
      "fool",
      "gossip",
    ]);

  it("last night's victim dies BEFORE the new target is poisoned", () => {
    let s = pukkaGame();
    s = recordPukkaPoison(s, 3); // night 1
    expect(s.players[3].poisoned).toBe(true);
    expect(s.pukkaVictim).toBe(3);
    s = secondNight(s);
    s = recordPukkaPoison(s, 7);
    expect(s.players[3].alive).toBe(false);
    expect(s.players[3].poisoned).toBe(false);
    expect(s.players[7].poisoned).toBe(true);
    expect(s.pukkaVictim).toBe(7);
    expect(demonAttackStatus(s)).toEqual({ wanted: 1, choices: [7], done: true });
  });

  it("a protected previous victim is healed instead of killed", () => {
    let s = pukkaGame();
    s = recordPukkaPoison(s, 7);
    s = secondNight(s);
    s = recordInnkeeperChoice(s, 4, [7, 3], 3); // Hana safe tonight
    s = recordPukkaPoison(s, 2);
    expect(s.players[7].alive).toBe(true);
    expect(s.players[7].poisoned).toBe(false);
    expect(s.players[2].poisoned).toBe(true);
  });
});

describe("night progress — resolved steps survive their own consequences", () => {
  it("the Assassin's spent strike keeps their step in the queue tonight", () => {
    let s = secondNight(
      game("bad-moon-rising", [
        "zombuul",
        "assassin",
        "sailor",
        "chambermaid",
        "innkeeper",
        "tea-lady",
        "fool",
        "gossip",
      ]),
    );
    const before = labels(s);
    s = goTo(s, "assassin");
    const at = nightCursorIndex(s);
    s = recordAssassinKill(s, 1, 5); // the Tea Lady (who never wakes) dies
    expect(s.players[5].alive).toBe(false);
    expect(labels(s)).toEqual(before);
    expect(nightCursorIndex(s)).toBe(at);
    expect(isStepResolved(s, currentNightStep(s) as never)).toBe(true);
    // Tomorrow night the spent Assassin no longer wakes.
    s = endDay(dawn(s));
    expect(labels(s)).not.toContain("assassin");
  });

  it("an Apprentice's dusk step stays after the ability is recorded, and they wake as that ability", () => {
    let s = game("bad-moon-rising", [
      "zombuul",
      "godfather",
      "sailor",
      "chambermaid",
      "innkeeper",
      "tea-lady",
      "fool",
      "apprentice",
    ]);
    expect(labels(s)[0]).toBe("apprentice");
    s = setApprenticeAbility(s, 7, "chambermaid");
    expect(labels(s)[0]).toBe("apprentice");
    expect(isStepResolved(s, nightQueue(s)[0])).toBe(true);
    expect(wakeCharacter(s.players[7])).toBe("chambermaid");
    const wakes = nightQueue(s).filter((x) => x.kind === "wake" && x.seat === 7);
    expect(wakes).toHaveLength(1);
    expect(wakes[0]).toMatchObject({ character: "chambermaid" });
  });

  it("Gossip, Tinker, Moonchild and Grandmother reminders stay once resolved", () => {
    let s = game("bad-moon-rising", [
      "zombuul",
      "godfather",
      "sailor",
      "grandmother",
      "innkeeper",
      "tinker",
      "moonchild",
      "gossip",
    ]);
    s = setGrandchild(s, 3, 1); // the Godfather is the grandchild
    s = dawn(s);
    s = recordGossipStatement(s, true);
    s = kill(s, 6, "storyteller"); // the Moonchild dies during the day…
    s = recordMoonchildChoice(s, 4); // …and curses the Innkeeper
    s = endDay(s);
    const reminders = ["gossip-kill", "tinker", "moonchild-kill"];
    const order = (xs: string[]) => reminders.map((r) => xs.indexOf(r));
    expect(order(labels(s)).every((i) => i !== -1)).toBe(true);
    expect(order(labels(s))).toEqual([...order(labels(s))].sort((a, b) => a - b));
    s = recordDemonKill(s, 1, "dies"); // the grandchild — the Grandmother step appears
    expect(labels(s)).toContain("grandmother-dies");
    // Only the reminders are compared: the cursed Innkeeper's (unresolved,
    // already passed) wake step is legitimately dropped once they die.
    const reminderLabels = (st: typeof s) =>
      nightQueue(st)
        .filter((x) => x.kind !== "wake")
        .map((x) => x.kind);
    const before = reminderLabels(s);
    // The Gossip's own statement kills the Gossip: their reminder would no
    // longer be generated (dead Gossip) and must be put back where it was.
    s = recordGossipKill(s, 7);
    s = recordTinkerDeath(s, 5);
    s = resolveMoonchildCurse(s, true);
    s = recordGrandmotherDeath(s, 3);
    // Every reminder ran; they all stay, in order, and each reads as done.
    expect(reminderLabels(s)).toEqual(before);
    for (const step of nightQueue(s)) {
      if (step.kind === "wake" || step.kind === "dawn") continue;
      expect(isStepResolved(s, step), step.kind).toBe(true);
    }
    for (const seat of [1, 3, 4, 5, 7]) expect(s.players[seat].alive, `seat ${seat}`).toBe(false);
    expect(s.moonchildTarget).toBeUndefined();
  });
});

describe("night progress — the cursor is a step identity, not a position", () => {
  it("moves by step and clamps at both ends", () => {
    let s = game("trouble-brewing", [
      "imp",
      "poisoner",
      "empath",
      "fortune-teller",
      "monk",
      "undertaker",
      "soldier",
    ]);
    expect(nightCursorIndex(s)).toBe(0);
    s = moveNightCursor(s, -1);
    expect(nightCursorIndex(s)).toBe(0);
    s = moveNightCursor(s, 2);
    expect(nightCursorIndex(s)).toBe(2);
    expect(s.nightProgress.cursor).toBe(nightStepId(nightQueue(s)[2]));
    s = moveNightCursor(s, 99);
    expect(currentNightStep(s)).toEqual({ kind: "dawn" });
  });

  it("a step that vanished UNRESOLVED drops the cursor onto the next step of the sheet", () => {
    let s = secondNight(
      game("trouble-brewing", [
        "imp",
        "poisoner",
        "empath",
        "fortune-teller",
        "monk",
        "undertaker",
        "soldier",
      ]),
    );
    s = goTo(s, "empath");
    // The Storyteller marks the Empath dead from the Grimoire mid-night.
    s = kill(s, 2, "storyteller");
    expect(currentNightStep(s)).toMatchObject({ kind: "wake", character: "fortune-teller" });
  });

  it("survives a seat swap", () => {
    let s = secondNight(
      game("bad-moon-rising", [
        "shabaloth",
        "godfather",
        "sailor",
        "chambermaid",
        "innkeeper",
        "tea-lady",
        "fool",
        "matron",
      ]),
    );
    s = recordDemonKill(s, 2, "dies");
    s = swapSeats(s, 0, 5);
    expect(s.nightProgress.demonChoices).toEqual([2]);
    expect(demonAttackStatus(s).choices).toEqual([2]);
    s = recordDemonKill(s, 3, "dies");
    expect(demonAttackStatus(s).done).toBe(true);
    expect(s.nightProgress.resolved).toContain("wake:5");
  });
});

describe("night queue invariants", () => {
  it("a seat wakes at most once per night, on every sheet", () => {
    const boards: Array<["trouble-brewing" | "bad-moon-rising", CharacterId[]]> = [
      [
        "trouble-brewing",
        ["imp", "poisoner", "empath", "fortune-teller", "monk", "undertaker", "soldier"],
      ],
      [
        "trouble-brewing",
        ["imp", "spy", "washerwoman", "librarian", "investigator", "chef", "butler", "thief"],
      ],
      [
        "bad-moon-rising",
        [
          "pukka",
          "assassin",
          "sailor",
          "chambermaid",
          "innkeeper",
          "exorcist",
          "gambler",
          "courtier",
        ],
      ],
      [
        "bad-moon-rising",
        [
          "po",
          "devils-advocate",
          "lunatic",
          "professor",
          "grandmother",
          "gossip",
          "tea-lady",
          "apprentice",
        ],
      ],
    ];
    for (const [edition, chars] of boards) {
      let s = game(edition, chars);
      for (const night of [s, secondNight(s)]) {
        const seats = nightQueue(night)
          .filter((x) => x.kind === "wake")
          .map((x) => (x as { seat: number }).seat);
        expect(new Set(seats).size, `${edition} ${chars.join(",")}`).toBe(seats.length);
        s = night;
      }
    }
  });
});

describe("seating", () => {
  const tb = () =>
    game("trouble-brewing", [
      "imp",
      "poisoner",
      "empath",
      "fortune-teller",
      "monk",
      "undertaker",
      "soldier",
    ]);

  it("a traveller can be seated between any two players, and every seat reference follows", () => {
    let s = dawn(tb());
    s = addTraveller(s, "Ivy", "beggar", "good", { afterSeat: 2 });
    expect(s.players.map((p) => p.name)).toEqual([
      "Alice",
      "Bob",
      "Cara",
      "Ivy",
      "Dan",
      "Eve",
      "Finn",
      "Gwen",
    ]);
    expect(s.players.map((p) => p.seat)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(s.log.at(-1)?.text).toContain("seated between Cara and Dan");
    // The Empath (Cara, still seat 2) now neighbours Bob and Ivy.
    expect(aliveNeighbours(s, 2).sort()).toEqual([1, 3]);
    // The Fortune Teller moved from seat 3 to 4 and their state moved with them.
    expect(s.players[4]).toMatchObject({ name: "Dan", character: "fortune-teller" });
  });

  it("afterSeat null takes the first chair; the default is the last", () => {
    let s = addTraveller(dawn(tb()), "Ivy", "beggar", "good", { afterSeat: null });
    expect(s.players[0].name).toBe("Ivy");
    expect(s.players[1]).toMatchObject({ name: "Alice", seat: 1, character: "imp" });
    s = addTraveller(dawn(tb()), "Ivy", "beggar", "good");
    expect(s.players.at(-1)?.name).toBe("Ivy");
  });

  it("moveSeat re-seats one player and remaps the day's bookkeeping", () => {
    let s = dawn(tb());
    s = recordNomination(s, 1, 6, 4); // Bob nominates Gwen — about to die
    s = moveSeat(s, 6, 0); // Gwen moves to sit after Alice
    expect(s.players.map((p) => p.name)).toEqual([
      "Alice",
      "Gwen",
      "Bob",
      "Cara",
      "Dan",
      "Eve",
      "Finn",
    ]);
    expect(s.day.aboutToDie).toEqual({ seat: 1, votes: 4 });
    expect(s.day.nominations[0]).toMatchObject({ nominator: 2, nominee: 1 });
    expect(s.day.nomineesUsed).toEqual([1]);
    expect(s.log.at(-1)?.text).toBe("Gwen moves to sit between Alice and Bob.");
    // No-ops stay no-ops.
    expect(moveSeat(s, 1, 0)).toBe(s);
  });

  it("reorderSeats rejects anything but a permutation", () => {
    const s = tb();
    expect(() => reorderSeats(s, [0, 1, 2])).toThrow();
    expect(() => reorderSeats(s, [0, 0, 1, 2, 3, 4, 5])).toThrow();
  });
});
