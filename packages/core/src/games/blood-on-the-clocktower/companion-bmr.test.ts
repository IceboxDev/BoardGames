import { describe, expect, it } from "vitest";
import type { CharacterId } from "./characters.ts";
import { CHARACTERS } from "./characters.ts";
import {
  abilityVoid,
  addTraveller,
  aliveNeighbours,
  beginMastermindDay,
  beginNight,
  chambermaidNumber,
  createGame,
  dawn,
  demonAlive,
  endDay,
  executeAboutToDie,
  isDrunkPlayer,
  isEvilPlayer,
  kill,
  mastermindVerdict,
  minstrelActive,
  nightQueue,
  recordAdvocateChoice,
  recordAssassinKill,
  recordCourtierChoice,
  recordExorcistChoice,
  recordGamblerGuess,
  recordGoonTrigger,
  recordInnkeeperChoice,
  recordNomination,
  recordPoCharge,
  recordPukkaPoison,
  recordSailorChoice,
  resolvePukkaVictim,
  setDrunk,
  setGrandchild,
  swapSeats,
  teaLadyProtectedSeats,
  votesRequired,
  winPrompts,
} from "./companion.ts";
import type { GameSetup } from "./setup.ts";
import { chooseDemonBluffs, dealBag, setupFromDraws } from "./setup.ts";

const NAMES = ["Alice", "Bob", "Cara", "Dan", "Eve", "Finn", "Gwen", "Hana"];

// Hand-built 8-player Bad Moon Rising game (no randomness):
// seat 0 Alice   Demon (varies per test, default Zombuul)
// seat 1 Bob     Godfather
// seat 2 Cara    Sailor
// seat 3 Dan     Chambermaid
// seat 4 Eve     Innkeeper
// seat 5 Finn    Tea Lady
// seat 6 Gwen    Fool
// seat 7 Hana    Gossip
function bmrSetup(overrides: Partial<Record<number, CharacterId>> = {}): GameSetup {
  const chars: CharacterId[] = [
    "zombuul",
    "godfather",
    "sailor",
    "chambermaid",
    "innkeeper",
    "tea-lady",
    "fool",
    "gossip",
  ];
  for (const [seat, id] of Object.entries(overrides)) chars[Number(seat)] = id as CharacterId;
  return {
    edition: "bad-moon-rising",
    seats: chars.map((character, seat) => ({ seat, name: NAMES[seat], character })),
    distribution: { townsfolk: 5, outsiders: 1, minions: 1, demons: 1 },
    demonBluffs: ["minstrel", "pacifist", "tinker"],
  };
}

function freshBmr(overrides: Partial<Record<number, CharacterId>> = {}) {
  return beginNight(createGame(bmrSetup(overrides)));
}

function stepIds(state: ReturnType<typeof freshBmr>): string[] {
  return nightQueue(state).map((s) => (s.kind === "wake" ? s.character : s.kind));
}

describe("BMR setup", () => {
  it("deals a full bag with one of the four BMR demons", () => {
    const bag = dealBag(8, () => 0.42, "new", "bad-moon-rising");
    expect(bag.edition).toBe("bad-moon-rising");
    expect(bag.bagTokens).toHaveLength(8);
    const demons = bag.charactersInPlay.filter((id) => CHARACTERS[id].type === "demon");
    expect(demons).toHaveLength(1);
    expect(["zombuul", "pukka", "shabaloth", "po"]).toContain(demons[0]);
    // Every character must belong to the BMR sheet.
    for (const id of bag.charactersInPlay) {
      expect([
        "grandmother",
        "sailor",
        "chambermaid",
        "exorcist",
        "innkeeper",
        "gambler",
        "gossip",
        "courtier",
        "professor",
        "minstrel",
        "tea-lady",
        "pacifist",
        "fool",
        "goon",
        "lunatic",
        "tinker",
        "moonchild",
        "godfather",
        "devils-advocate",
        "assassin",
        "mastermind",
        "zombuul",
        "pukka",
        "shabaloth",
        "po",
      ]).toContain(id);
    }
  });

  it("the Godfather adds or removes exactly one Outsider", () => {
    for (let i = 0; i < 40; i++) {
      const rng = mulberry(i);
      const bag = dealBag(10, rng, "new", "bad-moon-rising");
      const base = 0; // 10 players = 0 outsiders by the sheet
      const outsiders = bag.charactersInPlay.filter(
        (id) => CHARACTERS[id].type === "outsider",
      ).length;
      if (bag.charactersInPlay.includes("godfather")) {
        expect(bag.godfatherAdjustment).toBeDefined();
        expect(outsiders).toBe(base + (bag.godfatherAdjustment ?? 0));
      } else {
        expect(outsiders).toBe(base);
      }
    }
  });

  it("the Lunatic swap: demon-token drawer is the Lunatic, lunatic-token drawer the Demon", () => {
    const tokens: CharacterId[] = [
      "sailor",
      "tea-lady",
      "fool",
      "lunatic",
      "godfather",
      "shabaloth",
    ];
    const bag = {
      edition: "bad-moon-rising" as const,
      charactersInPlay: tokens,
      bagTokens: tokens,
      lunaticDemon: "shabaloth" as const,
      distribution: { townsfolk: 3, outsiders: 1, minions: 1, demons: 1 },
      demonBluffs: ["minstrel", "pacifist", "tinker"] as CharacterId[],
    };
    const setup = setupFromDraws(
      [
        { name: "A", token: "shabaloth" },
        { name: "B", token: "lunatic" },
        { name: "C", token: "sailor" },
        { name: "D", token: "tea-lady" },
        { name: "E", token: "fool" },
        { name: "F", token: "godfather" },
      ],
      bag,
      () => 0.5,
    );
    expect(setup.seats[0].character).toBe("lunatic");
    expect(setup.seats[0].believedCharacter).toBe("shabaloth");
    expect(setup.seats[1].character).toBe("shabaloth");
    expect(setup.seats[1].believedCharacter).toBeUndefined();
  });

  it("BMR demon bluffs are three good not-in-play BMR characters", () => {
    const bag = dealBag(8, mulberry(7), "experienced", "bad-moon-rising");
    expect(bag.demonBluffs).toHaveLength(3);
    for (const id of bag.demonBluffs) {
      expect(bag.charactersInPlay).not.toContain(id);
      expect(["townsfolk", "outsider"]).toContain(CHARACTERS[id].type);
    }
    const again = chooseDemonBluffs(
      { charactersInPlay: bag.charactersInPlay, skill: "new", edition: "bad-moon-rising" },
      mulberry(9),
    );
    expect(again).toHaveLength(3);
  });
});

describe("BMR night queue", () => {
  it("first night follows the sheet: info steps, Sailor, Godfather, Chambermaid", () => {
    const state = freshBmr();
    expect(stepIds(state)).toEqual([
      "minion-info",
      "demon-info",
      "sailor",
      "godfather",
      "chambermaid",
      "dawn",
    ]);
  });

  it("the Pukka acts on the first night; the Zombuul does not", () => {
    const pukka = freshBmr({ 0: "pukka" });
    expect(stepIds(pukka)).toContain("pukka");
    const zombuul = freshBmr();
    expect(stepIds(zombuul)).not.toContain("zombuul");
  });

  it("the Zombuul wakes only after a deathless day", () => {
    let state = freshBmr();
    state = dawn(state); // day 1
    let night2 = endDay(state); // nobody died today
    expect(stepIds(night2)).toContain("zombuul");
    // A death during the day keeps the Zombuul asleep.
    state = kill(state, 7, "storyteller");
    night2 = endDay(state);
    expect(stepIds(night2)).not.toContain("zombuul");
  });

  it("the Lunatic gets fake demon info before the real demon info", () => {
    const setup = bmrSetup({ 6: "lunatic" });
    const seats = setup.seats.map((s) =>
      s.character === "lunatic" ? { ...s, believedCharacter: "zombuul" as CharacterId } : s,
    );
    const state = beginNight(createGame({ ...setup, seats }));
    const ids = stepIds(state);
    expect(ids.indexOf("lunatic-info")).toBeGreaterThan(ids.indexOf("minion-info"));
    expect(ids.indexOf("lunatic-info")).toBeLessThan(ids.indexOf("demon-info"));
  });

  it("the Exorcist choosing the Demon blocks the demon's wake", () => {
    let state = freshBmr({ 3: "exorcist" });
    state = dawn(state);
    state = endDay(state); // night 2, deathless day → zombuul would act
    expect(stepIds(state)).toContain("zombuul");
    state = recordExorcistChoice(state, 3, 0);
    expect(state.exorcisedDemon).toBe(true);
    expect(stepIds(state)).not.toContain("zombuul");
  });

  it("a blocked Pukka still delivers last night's venom as a reminder step", () => {
    let state = freshBmr({ 0: "pukka", 3: "exorcist" });
    state = recordPukkaPoison(state, 6); // night 1
    state = dawn(state);
    state = endDay(state); // night 2
    state = recordExorcistChoice(state, 3, 0);
    const kinds = nightQueue(state).map((s) => s.kind);
    expect(kinds).toContain("pukka-victim");
  });

  it("the Godfather wakes to kill only after an Outsider died during the day", () => {
    // Seat 3 is away from the Tea Lady, so nothing shields the Outsider.
    let state = freshBmr({ 3: "goon" });
    state = dawn(state);
    state = kill(state, 3, "execution"); // Outsider executed
    expect(state.outsiderDiedToday).toBe(true);
    state = endDay(state);
    expect(stepIds(state)).toContain("godfather");
  });

  it("the Chambermaid counts wakers, not sleepers", () => {
    let state = freshBmr();
    state = dawn(state);
    state = endDay(state); // night 2: sailor wakes, innkeeper wakes, fool doesn't
    expect(chambermaidNumber(state, [2, 6])).toBe(1); // Sailor yes, Fool no
    expect(chambermaidNumber(state, [4, 2])).toBe(2); // Innkeeper + Sailor
    expect(chambermaidNumber(state, [6, 7])).toBe(0); // Fool + Gossip
  });
});

describe("BMR protections in kill()", () => {
  it("the sober Sailor cannot die; a drunk Sailor can", () => {
    let state = freshBmr();
    state = kill(state, 2, "demon");
    expect(state.players[2].alive).toBe(true);
    state = setDrunk(state, 2, 1, "sailor");
    state = kill(state, 2, "demon");
    expect(state.players[2].alive).toBe(false);
  });

  it("the Fool survives their first death only, spending the ability", () => {
    // Seat 3, away from the Tea Lady's aura — only the Fool's own ability acts.
    let state = freshBmr({ 3: "fool" });
    state = kill(state, 3, "demon");
    expect(state.players[3].alive).toBe(true);
    expect(state.players[3].usedAbility).toBe(true);
    state = kill(state, 3, "demon");
    expect(state.players[3].alive).toBe(false);
  });

  it("another protection shields the Fool first, leaving their ability intact", () => {
    // The default Fool sits beside the Tea Lady: the Tea Lady saves them and
    // the Fool's once-per-game escape is NOT spent.
    let state = freshBmr();
    state = kill(state, 6, "demon");
    expect(state.players[6].alive).toBe(true);
    expect(state.players[6].usedAbility).toBe(false);
  });

  it("the Assassin pierces every protection", () => {
    let state = freshBmr();
    state = kill(state, 6, "assassin"); // Fool + Tea Lady protection — futile
    expect(state.players[6].alive).toBe(false);
    state = kill(state, 2, "assassin"); // sober Sailor
    expect(state.players[2].alive).toBe(false);
  });

  it("the Tea Lady protects her two good alive neighbours", () => {
    const state = freshBmr();
    // Finn (5, Tea Lady) neighbours Eve (4, Innkeeper) and Gwen (6, Fool) — both good.
    expect(teaLadyProtectedSeats(state).sort()).toEqual([4, 6]);
    const after = kill(state, 4, "demon");
    expect(after.players[4].alive).toBe(true);
    // An evil neighbour breaks the protection entirely.
    const evilNeighbour = freshBmr({ 4: "assassin" });
    expect(teaLadyProtectedSeats(evilNeighbour)).toEqual([]);
  });

  it("the Innkeeper's guests can't die tonight (and one is drunk)", () => {
    let state = freshBmr();
    state = dawn(state);
    state = endDay(state); // night 2
    state = recordInnkeeperChoice(state, [7, 3], 3);
    expect(state.players[7].safeTonight).toBe(true);
    expect(isDrunkPlayer(state, state.players[3])).toBe(true);
    state = kill(state, 7, "demon");
    expect(state.players[7].alive).toBe(true);
  });

  it("the Devil's Advocate's client survives execution (which still counts)", () => {
    let state = freshBmr({ 1: "devils-advocate" });
    state = recordAdvocateChoice(state, 1, 7);
    state = dawn(state);
    state = kill(state, 7, "execution");
    expect(state.players[7].alive).toBe(true);
    expect(state.day.executed).toBe(7);
    // The protection covers one day only.
    state = endDay(state);
    expect(state.players[7].survivesExecution).toBeUndefined();
  });
});

describe("Zombuul", () => {
  it("first death is fake: registers dead, still the functioning demon", () => {
    let state = freshBmr();
    state = dawn(state);
    state = kill(state, 0, "execution");
    expect(state.players[0].alive).toBe(false);
    expect(state.players[0].registersDead).toBe(true);
    expect(demonAlive(state)).toBe(true);
    expect(winPrompts(state)).toEqual([]);
    // The fake death counted as today's death — no Zombuul attack tonight.
    expect(state.day.deaths).toBe(1);
    expect(state.day.executed).toBe(0);
  });

  it("second death is real and good wins", () => {
    let state = freshBmr();
    state = dawn(state);
    state = kill(state, 0, "execution");
    state = endDay(state);
    state = dawn(state);
    state = kill(state, 0, "execution");
    expect(state.players[0].registersDead).toBeUndefined();
    expect(demonAlive(state)).toBe(false);
    expect(winPrompts(state)).toEqual([{ kind: "good-wins", reason: "the Demon is dead" }]);
  });

  it("a drunk Zombuul dies for real the first time", () => {
    let state = freshBmr();
    state = setDrunk(state, 0, 1, "sailor");
    state = dawn(state);
    state = kill(state, 0, "execution");
    expect(state.players[0].registersDead).toBeUndefined();
    expect(demonAlive(state)).toBe(false);
  });
});

describe("Pukka", () => {
  it("poisons on night one; the victim dies the following night and is cured", () => {
    let state = freshBmr({ 0: "pukka" });
    state = recordPukkaPoison(state, 3);
    expect(state.players[3].poisoned).toBe(true);
    expect(state.pukkaVictim).toBe(3);
    state = dawn(state);
    // Pukka poison persists through dusk (unlike the TB Poisoner's).
    state = endDay(state);
    expect(state.players[3].poisoned).toBe(true);
    state = recordPukkaPoison(state, 4); // new victim first…
    state = resolvePukkaVictim(state, 3, true); // …then last night's dies
    expect(state.players[3].alive).toBe(false);
    expect(state.pukkaVictim).toBe(4);
  });

  it("a protected victim is spared and the venom purged", () => {
    let state = freshBmr({ 0: "pukka" });
    state = recordPukkaPoison(state, 3);
    state = dawn(state);
    state = endDay(state);
    state = resolvePukkaVictim(state, 3, false);
    expect(state.players[3].alive).toBe(true);
    expect(state.players[3].poisoned).toBe(false);
    expect(state.pukkaVictim).toBeUndefined();
  });
});

describe("Minstrel, Courtier & drunkenness", () => {
  it("executing a Minion with a sober Minstrel makes everyone drunk until dusk tomorrow", () => {
    let state = freshBmr({ 3: "minstrel" });
    state = dawn(state); // day 1
    state = kill(state, 1, "execution"); // Godfather executed
    expect(state.minstrelDrunkDay).toBe(1);
    expect(minstrelActive(state)).toBe(true);
    expect(abilityVoid(state, state.players[2])).toBe(true); // Sailor drunk
    expect(abilityVoid(state, state.players[3])).toBe(false); // the Minstrel isn't
    state = endDay(state); // night 2 — still drunk
    expect(minstrelActive(state)).toBe(true);
    state = dawn(state); // day 2 — still drunk
    expect(minstrelActive(state)).toBe(true);
    state = endDay(state); // dusk of night 3 — sober again
    expect(minstrelActive(state)).toBe(false);
    expect(state.minstrelDrunkDay).toBeUndefined();
  });

  it("the Courtier's target is drunk for three dusks and sobers up after", () => {
    let state = freshBmr({ 3: "courtier" });
    state = dawn(state);
    state = endDay(state); // night 2
    state = recordCourtierChoice(state, 3, "sailor");
    expect(state.players[3].usedAbility).toBe(true);
    expect(state.players[2].drunkNights).toBe(3);
    state = dawn(state);
    state = endDay(state); // night 3
    expect(state.players[2].drunkNights).toBe(2);
    state = dawn(state);
    state = endDay(state); // night 4
    expect(state.players[2].drunkNights).toBe(1);
    state = dawn(state);
    state = endDay(state); // night 5
    expect(state.players[2].drunkNights).toBeUndefined();
  });

  it("drunkenness ends when its source dies", () => {
    let state = freshBmr();
    state = recordSailorChoice(state, 2, 3, "target");
    expect(isDrunkPlayer(state, state.players[3])).toBe(true);
    state = kill(state, 2, "assassin"); // the Sailor dies
    expect(isDrunkPlayer(state, state.players[3])).toBe(false);
  });
});

describe("Goon, Gambler & Grandmother", () => {
  it("the Goon makes the first chooser drunk and flips to their alignment", () => {
    let state = freshBmr({ 6: "goon" });
    expect(isEvilPlayer(state.players[6])).toBe(false);
    state = recordGoonTrigger(state, 1); // the evil Godfather chose the Goon
    expect(state.players[6].alignment).toBe("evil");
    expect(isEvilPlayer(state.players[6])).toBe(true);
    expect(isDrunkPlayer(state, state.players[1])).toBe(true);
  });

  it("a wrong Gambler guess kills them; a right one doesn't", () => {
    let state = freshBmr({ 3: "gambler" });
    state = dawn(state);
    state = endDay(state);
    state = recordGamblerGuess(state, 3, 2, "sailor"); // correct
    expect(state.players[3].alive).toBe(true);
    state = recordGamblerGuess(state, 3, 7, "pacifist"); // wrong (Hana is the Gossip)
    expect(state.players[3].alive).toBe(false);
  });

  it("the Grandmother dies when the Demon kills her grandchild", () => {
    let state = freshBmr({ 3: "grandmother" });
    state = setGrandchild(state, 3, 7);
    state = dawn(state);
    state = endDay(state); // night 2
    state = kill(state, 7, "demon");
    expect(state.players[7].diedByDemonTonight).toBe(true);
    const kinds = nightQueue(state).map((s) => s.kind);
    expect(kinds).toContain("grandmother-dies");
    // Any other cause of death leaves the Grandmother alone.
    let other = freshBmr({ 3: "grandmother" });
    other = setGrandchild(other, 3, 7);
    other = dawn(other);
    other = endDay(other);
    other = kill(other, 7, "gossip");
    expect(nightQueue(other).map((s) => s.kind)).not.toContain("grandmother-dies");
  });
});

describe("Moonchild & Mastermind & Voudon", () => {
  it("a dead Moonchild must choose, and the curse resolves at night", () => {
    let state = freshBmr({ 3: "moonchild" });
    state = dawn(state);
    state = kill(state, 3, "execution");
    expect(state.moonchildPending).toBe(3);
  });

  it("the Mastermind extends the game after the Demon's execution", () => {
    let state = freshBmr({ 1: "mastermind" });
    state = dawn(state);
    state = kill(state, 0, "execution"); // the Zombuul's FAKE death — no prompt
    expect(winPrompts(state)).toEqual([]);
    state = endDay(state);
    state = dawn(state);
    state = kill(state, 0, "execution"); // real death
    expect(winPrompts(state)).toEqual([{ kind: "mastermind", seat: 1 }]);
    state = beginMastermindDay(state);
    expect(winPrompts(state)).toEqual([]);
    expect(mastermindVerdict(state, 1)).toBe("good"); // executing evil → good wins
    expect(mastermindVerdict(state, 2)).toBe("evil"); // executing good → evil wins
  });

  it("an alive Voudon reduces the execution threshold to a plurality of one", () => {
    let state = freshBmr();
    state = dawn(state);
    expect(votesRequired(state)).toBe(4);
    state = addTraveller(state, "Vlad", "voudon", "evil");
    expect(votesRequired(state)).toBe(1);
    state = recordNomination(state, 1, 7, 1);
    expect(state.day.aboutToDie).toEqual({ seat: 7, votes: 1 });
    state = executeAboutToDie(state);
    expect(state.players[7].alive).toBe(false);
  });
});

describe("Po & seat swaps", () => {
  it("the Po charge is recorded and spent", () => {
    let state = freshBmr({ 0: "po" });
    state = dawn(state);
    state = endDay(state);
    state = recordPoCharge(state);
    expect(state.poCharged).toBe(true);
  });

  it("swapSeats exchanges chairs and remaps seat references", () => {
    let state = freshBmr({ 3: "grandmother" });
    state = setGrandchild(state, 3, 7);
    // Before: Finn (5) neighbours Eve (4) and Gwen (6).
    expect(aliveNeighbours(state, 5).sort()).toEqual([4, 6]);
    state = swapSeats(state, 4, 7); // Eve and Hana swap chairs
    // Eve now sits in chair 7; Finn's neighbours are Hana (chair 4) and Gwen.
    expect(state.players[4].name).toBe("Hana");
    expect(state.players[7].name).toBe("Eve");
    // The Grandmother (chair 3) still tracks HANA's old grandchild… which was
    // seat 7 = Hana; Hana moved to chair 4, so the reference follows her.
    expect(state.players[3].grandchild).toBe(4);
  });
});

/** Deterministic PRNG for statistical assertions. */
function mulberry(seed: number): () => number {
  let a = seed + 0x6d2b79f5;
  return () => {
    a = Math.imul(a ^ (a >>> 15), a | 1);
    a ^= a + Math.imul(a ^ (a >>> 7), a | 61);
    return ((a ^ (a >>> 14)) >>> 0) / 4294967296;
  };
}

describe("BMR assassin edge", () => {
  it("a drunk Assassin's strike is spent but does nothing", () => {
    let state = freshBmr({ 1: "assassin" });
    state = dawn(state);
    state = endDay(state);
    state = setDrunk(state, 1, 1, "sailor"); // drunk TONIGHT, when they strike
    state = recordAssassinKill(state, 1, 7);
    expect(state.players[1].usedAbility).toBe(true);
    expect(state.players[7].alive).toBe(true);
  });
});
