import { describe, expect, it } from "vitest";
import { computeResult, fateOf, missionContext, missionScore, scoreMissions } from "./scoring";
import { afterSetup } from "./test-helpers";

describe("final scoring", () => {
  it("majority Missions need strictly more than every other Vampire; tokens count", () => {
    const s = afterSetup(2, 1);
    s.players[0].discard = ["jack#0", "zara#0"];
    s.players[1].discard = ["tania#0", "mindy#0"];
    const cond = { kind: "majority", of: "noble" } as const;
    expect(missionScore(cond, 6, missionContext(s, 0))).toBe(0);
    s.players[0].bonus.push({ id: "noble#0", used: false });
    expect(missionScore(cond, 6, missionContext(s, 0))).toBe(6);
  });

  it("End-of-game cards: Roxane pairs, the X Humans count themselves, Isabel's Rose", () => {
    const s = afterSetup(2, 1);
    s.players[0].discard = [
      "cyrana#0",
      "baron-christien#0",
      "roxane#0",
      "szalai#0",
      "o-nel#0",
      "echo#0",
      "isabel#0",
      "eternal-rose#0",
    ];
    const r = computeResult(s);
    // Cyrana 4 + Baron Christien 2 (Roxane) + Szalai 3 Villagers (Roxane, O'Nel,
    // itself) + Echo 1 (itself, a Wolf) + Isabel 2 (a Rose).
    expect(r.breakdown[0].cardBonuses).toBe(12);
  });

  it("every Wolf scores 1 VP per Wolf you have", () => {
    const s = afterSetup(2, 1);
    s.players[0].discard = ["echo#0", "bo#0", "gray#0"];
    expect(computeResult(s).breakdown[0].cardBonuses).toBe(9);
  });

  it("sunrise: Castle safe, Cemetery −5, Elder Mountains ashes, Rookie Mountains lose the print", () => {
    const elder = afterSetup(2, 1);
    elder.players[0].pos = "cemetery";
    expect(fateOf(elder, elder.players[0])).toEqual({ fate: "cemetery", delta: -5 });
    elder.players[0].pos = "road-1";
    expect(fateOf(elder, elder.players[0]).fate).toBe("ashes");
    elder.options.beginnerSafeMountains = true;
    expect(fateOf(elder, elder.players[0])).toEqual({ fate: "mountains", delta: 0 });
    const rookie = afterSetup(2, 1, { mode: "rookie" });
    rookie.players[0].pos = "road-1";
    expect(fateOf(rookie, rookie.players[0])).toEqual({ fate: "mountains", delta: -4 });
    rookie.players[0].pos = "road-5";
    expect(fateOf(rookie, rookie.players[0]).fate).toBe("ashes");
  });

  it("survivors outrank the ashes; ties go to the earlier Castle arrival", () => {
    const s = afterSetup(3, 1);
    s.publicMissions = [];
    for (const p of s.players) p.missions = [];
    s.players[0].vp = 50;
    s.players[0].pos = "road-9";
    s.players[1].vp = 20;
    s.players[1].castleOrder = 2;
    s.players[2].vp = 20;
    s.players[2].castleOrder = 1;
    const r = computeResult(s);
    expect(r.placements).toEqual([3, 2, 1]);
    expect(r.winner).toBe(2);
  });

  it("a choice token takes the type that scores best", () => {
    const s = afterSetup(2, 1);
    s.publicMissions = [];
    s.players[0].missions = ["a-hankering"];
    s.players[0].discard = ["uwe#0", "grant#0", "diego#0", "tyre#0", "o-nel#0"];
    s.players[0].bonus = [{ id: "human-choice#0", used: false }];
    const r = computeResult(s);
    expect(s.players[0].bonus[0].chosen).toBe("military");
    expect(r.breakdown[0].personalMissions).toBe(6);
  });
});

describe("the real Mission tiles", () => {
  const score = (s: ReturnType<typeof afterSetup>, seat: number, ids: string[]) =>
    scoreMissions(ids, missionContext(s, seat));

  it("counts Humans by printed VP (Meh, Three-Star Dinner, Haute Cuisine, Picky)", () => {
    const s = afterSetup(2, 1);
    // O'Nel 1, Ivo 2, Mary 3, Carlyle 4 — and a token, which has no VP.
    s.players[0].discard = ["o-nel#0", "ivo#0", "mary#0", "carlyle#0"];
    s.players[0].bonus = [{ id: "noble#0", used: false }];
    expect(score(s, 0, ["meh"])).toBe(2);
    expect(score(s, 0, ["three-star-dinner"])).toBe(1);
    expect(score(s, 0, ["haute-cuisine"])).toBe(1);
    expect(score(s, 0, ["picky"])).toBe(6);
  });

  it("Selective, Family Business and Varied Diet read the type counts", () => {
    const s = afterSetup(2, 1);
    s.players[0].discard = ["o-nel#0", "ivo#0", "ruth#0", "tyre#0", "mindy#0", "agnes#0"];
    expect(score(s, 0, ["selective"])).toBe(2);
    expect(score(s, 0, ["family-business"])).toBe(2);
    expect(score(s, 0, ["varied-diet"])).toBe(3);
  });

  it("On a Diet and Gluttony are strict, opposite majorities", () => {
    const s = afterSetup(2, 1);
    s.players[0].discard = ["o-nel#0"];
    s.players[1].discard = ["ivo#0", "boris#0"];
    expect(score(s, 0, ["on-a-diet"])).toBe(5);
    expect(score(s, 1, ["gluttony"])).toBe(5);
    s.players[0].discard.push("boo#0");
    expect(score(s, 0, ["on-a-diet"])).toBe(0);
  });

  it("The Host and Early Night reward coming home first", () => {
    const s = afterSetup(3, 1);
    s.players[0].castleOrder = 1;
    s.players[1].castleOrder = 2;
    expect(score(s, 0, ["the-host"])).toBe(2 + 2 * 2);
    expect(score(s, 1, ["the-host"])).toBe(2 + 2);
    expect(score(s, 2, ["the-host"])).toBe(0);
    expect(score(s, 0, ["early-night"])).toBe(6);
    expect(score(s, 1, ["early-night"])).toBe(0);
  });

  it("Rich Get Richer and Catch Up compare the score before Missions", () => {
    const s = afterSetup(3, 1);
    for (const p of s.players) p.pos = "castle";
    s.players[0].vp = 30;
    s.players[1].vp = 20;
    s.players[2].vp = 10;
    expect(score(s, 0, ["rich-get-richer"])).toBe(4);
    expect(score(s, 2, ["catch-up"])).toBe(10);
    expect(score(s, 1, ["catch-up", "rich-get-richer"])).toBe(0);
  });

  it("Tipsy and Dangerous Diet count Confuse, Spicy and Holy Water Humans", () => {
    const s = afterSetup(2, 1);
    // Theresa: Confuse. Bernard: Spicy. Bolat: Holy Water.
    s.players[0].discard = ["theresa#0", "bernard#0", "bolat#0", "o-nel#0"];
    expect(score(s, 0, ["tipsy"])).toBe(4);
    expect(score(s, 0, ["dangerous-diet"])).toBe(6);
  });

  it("Missionary counts every scoring Mission in the same set, itself included", () => {
    const s = afterSetup(2, 1);
    s.players[0].discard = ["o-nel#0", "ruth#0"];
    // Common Taste 1 + Holier than Thou 1 + Royal 0 → Missionary 3.
    expect(score(s, 0, ["common-taste", "holier-than-thou", "royal", "missionary"])).toBe(5);
    expect(score(s, 0, ["missionary"])).toBe(1);
  });

  it("distinct Powers and Familiars, Digested Humans and Bonus tokens", () => {
    const s = afterSetup(2, 1);
    s.players[0].discard = [
      "form-of-bat#0",
      "form-of-bat#1",
      "vampiric-speed-3#0",
      "tyson#0",
      "chop#0",
    ];
    s.players[0].digested = ["o-nel#0", "ruth#0"];
    s.players[0].bonus = [{ id: "speed-1#0", used: true }];
    expect(score(s, 0, ["my-body-is-my-temple"])).toBe(2);
    expect(score(s, 0, ["animal-lover"])).toBe(2);
    expect(score(s, 0, ["gourmet"])).toBe(4);
    expect(score(s, 0, ["the-collector"])).toBe(1);
  });

  it("an unused Instant scores nothing", () => {
    const s = afterSetup(2, 1);
    expect(score(s, 0, ["hungry", "treasure-chest"])).toBe(0);
  });
});

describe("the final breakdown", () => {
  it("itemises every Mission (Public and personal) and every End-of-the-Game card", () => {
    const s = afterSetup(2, 1);
    s.publicMissions = ["common-taste", "romantic"];
    s.players[0].missions = ["holier-than-thou", "missionary"];
    s.players[0].usedMissions = ["hungry"];
    s.players[0].discard = ["o-nel#0", "ruth#0", "szalai#0"];
    const b = computeResult(s).breakdown[0];
    expect(b.missions).toEqual([
      { id: "common-taste", vp: 2, public: true },
      { id: "romantic", vp: 0, public: true },
      { id: "holier-than-thou", vp: 1, public: false },
      { id: "missionary", vp: 2, public: false },
      { id: "hungry", vp: 0, public: false, used: true },
    ]);
    expect(b.cards).toEqual([{ card: "szalai#0", vp: 2 }]);
    expect(b.publicMissions + b.personalMissions).toBe(5);
    expect(b.cardBonuses).toBe(2);
  });
});
