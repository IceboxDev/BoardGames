import { describe, expect, it } from "vitest";
import { determineWinner, scoreFinal, scoreScience } from "./scoring";
import { makeTestState } from "./test-fixtures";

describe("scoreScience", () => {
  it("scores n^2 per symbol plus 7 per complete set", () => {
    expect(scoreScience({ gear: 1, compass: 1, tablet: 1 }, 0)).toBe(10);
    expect(scoreScience({ gear: 2, compass: 2, tablet: 2 }, 0)).toBe(26);
    expect(scoreScience({ gear: 3, compass: 0, tablet: 0 }, 0)).toBe(9);
    expect(scoreScience({ gear: 0, compass: 0, tablet: 0 }, 0)).toBe(0);
  });

  it("assigns a wildcard to complete a set when that beats stacking", () => {
    // (2,2,1)+wild → (2,2,2) = 26 beats (3,2,1) = 21.
    expect(scoreScience({ gear: 2, compass: 2, tablet: 1 }, 1)).toBe(26);
  });

  it("stacks a wildcard when that beats completing nothing", () => {
    // (3,0,0)+wild → (4,0,0) = 16 beats (3,1,0) = 10.
    expect(scoreScience({ gear: 3, compass: 0, tablet: 0 }, 1)).toBe(16);
  });

  it("optimizes two wildcards jointly", () => {
    // (1,1,0)+2 wilds → (1,1,2)? 1+1+4+7=13 vs (2,2,0)=8 vs (2,1,1)=4+1+1+7=13...
    // best is (1,2,1) or (2,1,1) or (1,1,2): 13.
    expect(scoreScience({ gear: 1, compass: 1, tablet: 0 }, 2)).toBe(13);
  });
});

describe("scoreFinal categories", () => {
  it("scores civilian, wonder, coins and military", () => {
    const state = makeTestState([
      {
        wonder: "giza",
        stagesBuilt: 2, // 3 + 5 wonder points
        coins: 8, // floor(8/3) = 2
        tableau: ["Altar", "Baths"], // 2 + 3 civilian
        militaryTokens: [1, -1, 3], // 3
      },
      { wonder: "babylon" },
      { wonder: "olympia" },
    ]);
    const b = scoreFinal(state)[0];
    expect(b.wonder).toBe(8);
    expect(b.coins).toBe(2);
    expect(b.civilian).toBe(5);
    expect(b.military).toBe(3);
    expect(b.total).toBe(8 + 2 + 5 + 3);
  });

  it("scores commercial end-game effects (Haven per own brown, Arena per own stage)", () => {
    const state = makeTestState([
      {
        wonder: "giza",
        stagesBuilt: 2,
        coins: 0,
        tableau: ["Haven", "Arena", "Lumber Yard", "Sawmill"],
      },
      { wonder: "babylon" },
      { wonder: "olympia" },
    ]);
    const b = scoreFinal(state)[0];
    // Haven: 1/brown = 2; Arena: 1/stage = 2.
    expect(b.commercial).toBe(4);
  });

  it("scores science from green cards plus Babylon's wildcard stage", () => {
    const state = makeTestState([
      {
        wonder: "babylon",
        side: "A",
        stagesBuilt: 2, // stage 2 = science wildcard
        coins: 0,
        tableau: ["Apothecary", "Workshop", "Scriptorium"], // one of each
      },
      { wonder: "giza" },
      { wonder: "olympia" },
    ]);
    const b = scoreFinal(state)[0];
    // (1,1,1) + wildcard → (2,1,1) = 4+1+1+7 = 13.
    expect(b.science).toBe(13);
    // Wonder stage 1 of Babylon A is 3 points.
    expect(b.wonder).toBe(3);
  });
});

describe("guild scoring", () => {
  it("counts neighbor cards for the counting guilds", () => {
    const state = makeTestState([
      { wonder: "giza", coins: 0, tableau: ["Workers Guild", "Magistrates Guild"] },
      { wonder: "babylon", tableau: ["Lumber Yard", "Sawmill", "Altar"] }, // 2 brown, 1 blue
      { wonder: "olympia", tableau: ["Ore Vein", "Baths", "Theater"] }, // 1 brown, 2 blue
    ]);
    const b = scoreFinal(state)[0];
    // Workers: 3 neighbor browns; Magistrates: 3 neighbor blues.
    expect(b.guilds).toBe(6);
  });

  it("Craftsmens Guild pays 2 per neighbor grey", () => {
    const state = makeTestState([
      { wonder: "giza", coins: 0, tableau: ["Craftsmens Guild"] },
      { wonder: "babylon", tableau: ["Loom", "Glassworks"] },
      { wonder: "olympia", tableau: ["Press"] },
    ]);
    expect(scoreFinal(state)[0].guilds).toBe(6);
  });

  it("Shipowners Guild counts own brown, grey and purple cards", () => {
    const state = makeTestState([
      {
        wonder: "giza",
        coins: 0,
        tableau: ["Shipowners Guild", "Lumber Yard", "Loom", "Workers Guild"],
      },
      { wonder: "babylon" },
      { wonder: "olympia" },
    ]);
    // brown 1 + grey 1 + purple 2 (Shipowners counts itself) = 4,
    // plus Workers Guild scoring 0 neighbor browns.
    expect(scoreFinal(state)[0].guilds).toBe(4);
  });

  it("Builders Guild counts stages on self and both neighbors", () => {
    const state = makeTestState([
      { wonder: "giza", coins: 0, stagesBuilt: 1, tableau: ["Builders Guild"] },
      { wonder: "babylon", stagesBuilt: 2 },
      { wonder: "olympia", stagesBuilt: 3 },
    ]);
    // 1 own stage worth of wonder points (3) + guild 1+2+3 = 6.
    expect(scoreFinal(state)[0].guilds).toBe(6);
  });

  it("Strategists Guild counts neighbor defeat tokens", () => {
    const state = makeTestState([
      { wonder: "giza", coins: 0, tableau: ["Strategists Guild"] },
      { wonder: "babylon", militaryTokens: [-1, -1, 5] },
      { wonder: "olympia", militaryTokens: [-1] },
    ]);
    expect(scoreFinal(state)[0].guilds).toBe(3);
  });

  it("Scientists Guild acts as a science wildcard", () => {
    const state = makeTestState([
      {
        wonder: "giza",
        coins: 0,
        tableau: ["Scientists Guild", "Apothecary", "Workshop", "Scriptorium"],
      },
      { wonder: "babylon" },
      { wonder: "olympia" },
    ]);
    const b = scoreFinal(state)[0];
    expect(b.science).toBe(13); // (1,1,1) + wildcard
    expect(b.guilds).toBe(0); // value lands in the science category
  });

  it("Olympia B copies the best neighbor guild, evaluated on its own board", () => {
    const state = makeTestState([
      {
        wonder: "olympia",
        side: "B",
        stagesBuilt: 3, // stage 3 = copy-guild
        coins: 0,
        tableau: [],
      },
      // Left neighbor owns Workers Guild (browns counted around Olympia).
      { wonder: "babylon", tableau: ["Workers Guild", "Lumber Yard"] },
      { wonder: "giza", tableau: ["Sawmill", "Ore Vein"] },
    ]);
    const b = scoreFinal(state)[0];
    // Copied Workers Guild: Olympia's neighbors have 1 + 2 browns = 3 points.
    expect(b.guilds).toBe(3);
  });

  it("copying the Scientists Guild is worth the extra-wildcard delta", () => {
    const state = makeTestState([
      {
        wonder: "olympia",
        side: "B",
        stagesBuilt: 3,
        coins: 0,
        tableau: ["Apothecary", "Workshop", "Scriptorium"],
      },
      { wonder: "babylon", tableau: ["Scientists Guild"] },
      { wonder: "giza" },
    ]);
    const b = scoreFinal(state)[0];
    expect(b.science).toBe(10); // own (1,1,1)
    expect(b.guilds).toBe(3); // 13 - 10 delta from the copied wildcard
  });
});

describe("determineWinner", () => {
  it("breaks total ties by coins", () => {
    // Same totals (3 points from coins each), p1 holds more raw coins.
    const state = makeTestState([
      { wonder: "giza", coins: 9 },
      { wonder: "babylon", coins: 11 },
      { wonder: "olympia", coins: 0 },
    ]);
    const breakdowns = scoreFinal(state);
    expect(breakdowns[0].total).toBe(breakdowns[1].total);
    expect(determineWinner(state, breakdowns)).toBe(1);
  });

  it("keeps the lowest seat on a full tie", () => {
    const state = makeTestState([
      { wonder: "giza", coins: 9 },
      { wonder: "babylon", coins: 9 },
      { wonder: "olympia", coins: 9 },
    ]);
    expect(determineWinner(state, scoreFinal(state))).toBe(0);
  });
});
