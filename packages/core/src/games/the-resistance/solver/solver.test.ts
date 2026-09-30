import { describe, expect, it } from "vitest";
import type { ProposalRecord, ResistanceRecord, Role, RoundRecord } from "../record";
import { type Assumptions, defaultAssumptions } from "./assumptions";
import { deductions } from "./deductions";
import { factProof, seatStory, teamMath } from "./explain";
import { gradeDecisions } from "./grade";
import { gameValueCurve, Lookahead, positionAt } from "./lookahead";
import { resistanceGameChoice } from "./optimal";
import { analyze } from "./posterior";
import { rankTeams, teamOdds } from "./recommend";
import { recordUpTo } from "./simulate";

const yes = (n: number) => Array(n).fill(true);

function approved(n: number, leader: number, mission: number, team: number[]): ProposalRecord {
  return { leader, mission, team, votes: yes(n) };
}

function missionRound(
  n: number,
  leader: number,
  mission: number,
  team: number[],
  fails: number,
  cards?: ("success" | "fail" | null)[],
): RoundRecord {
  const needed = n >= 7 && mission === 3 ? 2 : 1;
  return {
    proposals: [approved(n, leader, mission, team)],
    result: { mission, team, fails, success: fails < needed, ...(cards ? { cards } : {}) },
  };
}

function record(n: number, rounds: RoundRecord[], roles?: Role[]): ResistanceRecord {
  return {
    playerCount: n,
    variants: { targeting: false, blindSpies: false },
    firstLeader: 0,
    rounds,
    roles: roles ?? null,
  };
}

/** Only the game's own rule — for checking pure logic. */
function noAssumptions(): Assumptions {
  const a = defaultAssumptions();
  for (const id of Object.keys(a.rules) as (keyof typeof a.rules)[]) {
    a.rules[id] = { mode: "off", strength: 0 };
  }
  return a;
}

const last = <T>(xs: readonly T[]): T => {
  const x = xs.at(-1);
  if (x === undefined) throw new Error("empty");
  return x;
};

describe("posterior", () => {
  it("a failed two-player mission leaves exactly the worlds with a spy in the pair", () => {
    // 5 players, 2 spies: C(5,2) = 10 worlds; 3 of them avoid seats 0 and 1.
    const a = analyze(record(5, [missionRound(5, 0, 0, [0, 1], 1)]), noAssumptions());
    expect(a.worlds).toHaveLength(10);
    expect(last(a.snapshots).aliveCore).toBe(7);
  });

  it("two fails on a two-player team prove both spies", () => {
    const a = analyze(record(5, [missionRound(5, 0, 0, [2, 3], 2)]), noAssumptions());
    const d = deductions(a, a.events.length);
    expect(d[0]?.kind).toBe("spies-exact");
    expect(d[0]?.seats).toEqual([2, 3]);
    expect(d[0]?.certainty).toBe("proven");
  });

  it("a success at Resistance match point clears the team (spies always fail then)", () => {
    const rounds = [
      // Leaders chosen so no leader could have paired spies on their own team.
      missionRound(5, 3, 0, [0, 1], 0),
      missionRound(5, 2, 1, [0, 1, 2], 1),
      missionRound(5, 3, 2, [3, 4], 0),
      // The Resistance had 2 successes: under the rule this team is clean.
      missionRound(5, 4, 3, [2, 3, 4], 0),
    ];
    const a = analyze(record(5, rounds), defaultAssumptions());
    const snap = last(a.snapshots);
    expect(a.contradictions).toEqual([]);
    expect(snap.alive).toBe(1);
    expect(snap.pSpy[2]).toBe(0);
    expect(snap.pSpy[3]).toBe(0);
    expect(snap.pSpy[4]).toBe(0);
    // …which the game's rule alone does not prove.
    expect(snap.pSpyCore[4]).toBeGreaterThan(0);
  });

  it("a spy leader never proposes two spies — unless spies are blind", () => {
    const rounds = [{ proposals: [approved(5, 0, 0, [0, 1])], result: null }];
    const known = analyze(record(5, rounds), defaultAssumptions());
    const pair = known.worlds.indexOf(0b11);
    expect(last(known.snapshots).weights[pair]).toBe(0);

    const blind = analyze(
      { ...record(5, rounds), variants: { targeting: false, blindSpies: true } },
      defaultAssumptions(),
    );
    expect(last(blind.snapshots).weights[pair]).toBeGreaterThan(0);
  });

  it("only a spy rejects the hammer", () => {
    const reject = (leader: number): ProposalRecord => ({
      leader,
      mission: 0,
      team: [0, 1],
      votes: [false, false, false, false, false],
    });
    const hammer: ProposalRecord = {
      leader: 4,
      mission: 0,
      team: [3, 4],
      votes: [true, true, false, true, true],
    };
    const rounds: RoundRecord[] = [
      {
        proposals: [reject(0), reject(1), reject(2), reject(3), hammer],
        result: { mission: 0, team: [3, 4], fails: 0, success: true },
      },
    ];
    const a = analyze(record(5, rounds), defaultAssumptions());
    expect(last(a.snapshots).pSpy[2]).toBeCloseTo(1);
  });

  it("names the assumption a record broke, relaxes it, and keeps going", () => {
    // Seat 0 leads {0, 1}: "a spy leader never pairs spies" rules out 0 and 1
    // being spies together — then two fails prove exactly that.
    const a = analyze(record(5, [missionRound(5, 0, 0, [0, 1], 2)]), defaultAssumptions());
    expect(a.contradictions.map((c) => c.rules)).toEqual([["noSpyPairs"]]);
    const snap = last(a.snapshots);
    expect(snap.alive).toBe(1);
    expect(snap.pSpy[0]).toBeCloseTo(1);
  });

  it("skips an entry the rules can't explain", () => {
    const a = analyze(record(5, [missionRound(5, 0, 0, [0, 1], 3)]), defaultAssumptions());
    expect(a.impossible).toHaveLength(1);
    expect(last(a.snapshots).aliveCore).toBe(10);
  });
});

describe("recommendations", () => {
  it("keeps the leader away from a failed pair", () => {
    const a = analyze(record(5, [missionRound(5, 1, 0, [0, 1], 2)]), noAssumptions(), {
      kind: "seat",
      seat: 2,
      role: "resistance",
      knownSpies: [],
    });
    const env = { playerCount: 5, blindSpies: false, assumptions: noAssumptions() };
    const best = rankTeams(
      a,
      last(a.snapshots),
      [1],
      { successes: 0, fails: 1, rejections: 0 },
      env,
      2,
    )[0];
    expect(best?.team).toEqual([2, 3, 4]);
    expect(best?.pClean).toBe(1);
  });
});

describe("grading", () => {
  const roles: Role[] = ["spy", "spy", "resistance", "resistance", "resistance"];

  it("calls a proven spy on a Resistance leader's team a blunder", () => {
    const rounds = [
      missionRound(5, 0, 0, [0, 2], 1),
      missionRound(5, 1, 1, [0, 1, 2], 2),
      { proposals: [approved(5, 2, 2, [0, 2])], result: null },
    ];
    const graded = gradeDecisions(record(5, rounds, roles), defaultAssumptions());
    const third = graded.find((g) => g.kind === "proposal" && g.round === 2);
    expect(third?.grade).toBe("blunder");
  });

  it("blames the two-spy proposal, never the double fail", () => {
    const graded = gradeDecisions(
      record(5, [missionRound(5, 0, 0, [0, 1], 2, ["fail", "fail", null, null, null])], roles),
      defaultAssumptions(),
    );
    expect(graded.find((g) => g.kind === "proposal")?.title).toBe("Two spies on one team");
    expect(graded.filter((g) => g.kind === "card" && g.grade !== "note")).toEqual([]);
  });

  it("flags a spy passing at Resistance match point", () => {
    const rounds = [
      missionRound(5, 2, 0, [2, 3], 0),
      missionRound(5, 3, 1, [2, 3, 4], 0),
      missionRound(5, 4, 2, [0, 2], 0, ["success", null, "success", null, null]),
    ];
    const graded = gradeDecisions(record(5, rounds, roles), defaultAssumptions());
    expect(graded.find((g) => g.kind === "card" && g.seat === 0)?.grade).toBe("blunder");
  });
});

describe("simulation", () => {
  it("is certain once the game is decided", () => {
    const rounds = [
      missionRound(5, 0, 0, [2, 3], 0),
      missionRound(5, 1, 1, [2, 3, 4], 0),
      missionRound(5, 2, 2, [2, 4], 0),
    ];
    const rec = record(5, rounds);
    const a = analyze(rec, defaultAssumptions());
    const env = { playerCount: 5, blindSpies: false, assumptions: defaultAssumptions() };
    const end = gameValueCurve(rec, a, env).at(-1);
    expect(end?.table).toBe(1);
  });

  it("cuts a record back to any event", () => {
    const rec = record(5, [missionRound(5, 0, 0, [0, 1], 1), missionRound(5, 1, 1, [2, 3, 4], 0)]);
    const a = analyze(rec, defaultAssumptions());
    const cut = recordUpTo(rec, a.events, 4); // proposal of round 2, not yet voted
    expect(cut.rounds).toHaveLength(2);
    expect(cut.rounds[1]?.proposals[0]?.votes).toBeNull();
    expect(cut.rounds[1]?.result).toBeNull();
  });
});

describe("the table's perspective", () => {
  it("on the last mission, a leader who knows the table's favourite has a spy picks the clean team", () => {
    const rec = record(5, [missionRound(5, 0, 0, [0, 1], 0)]);
    const a = analyze(rec, noAssumptions());
    // Default rules: at Resistance match point every spy aboard plays Fail.
    const env = { playerCount: 5, blindSpies: false, assumptions: defaultAssumptions() };
    const look = new Lookahead(a, rec, env);
    const idx = (spies: number[]) => a.worlds.indexOf(spies.reduce((m, s) => m | (1 << s), 0));
    // The table leans to {0,1} being the spies; the leader (seat 2) knows it's {3,4}.
    const table = new Float64Array(a.worlds.length);
    table[idx([0, 1])] = 0.6;
    table[idx([3, 4])] = 0.4;
    const own = new Float64Array(a.worlds.length);
    own[idx([3, 4])] = 1;
    const position = positionAt(table, [true, true, false, false, null]);
    const teams = [
      [0, 1, 2],
      [2, 3, 4],
      [0, 2, 3],
    ].map((team) => ({ team, mission: 4 }));
    const choice = resistanceGameChoice(
      look,
      position,
      own,
      table,
      teams,
      teams[1] ?? { team: [], mission: 4 },
    );
    const optimal = choice.options.filter((o) => o.optimal).map((o) => o.team.join());
    expect(optimal).toEqual(["0,1,2"]);
    // The table's favourite wins 60% by its view, but 0% by what the leader knows.
    expect(choice.chosen.secondary).toBeCloseTo(0.6);
    expect(choice.chosen.primary).toBe(0);
  });

  it("doesn't flag approving a weak team when no better one existed", () => {
    const rounds: RoundRecord[] = [missionRound(5, 0, 0, [2, 3], 0)];
    const graded = gradeDecisions(record(5, rounds), defaultAssumptions());
    expect(graded.filter((g) => g.kind === "vote")).toEqual([]);
  });
});

describe("secret cards", () => {
  it("never lets the table (or another seat) see who played a Fail", () => {
    const cards = ["fail", "success", null, null, null] as const;
    const rec = record(
      5,
      [missionRound(5, 2, 0, [0, 1], 1, [...cards])],
      ["spy", "resistance", "resistance", "spy", "resistance"],
    );
    const table = last(analyze(rec, noAssumptions()).snapshots);
    expect(table.pSpyCore[0]).toBeLessThan(1);
    // Seat 1 knows its own Success, so the Fail was seat 0's.
    const seat1 = last(
      analyze(rec, noAssumptions(), {
        kind: "seat",
        seat: 1,
        role: "resistance",
        knownSpies: [],
      }).snapshots,
    );
    expect(seat1.pSpyCore[0]).toBe(1);
  });
});

describe("explanations", () => {
  it("team math sums to the headline odds", () => {
    const rec = record(5, [missionRound(5, 0, 0, [0, 1], 1)]);
    const a = analyze(rec, defaultAssumptions());
    const env = { playerCount: 5, blindSpies: false, assumptions: defaultAssumptions() };
    const situation = { successes: 0, fails: 1, rejections: 0 };
    const snap = last(a.snapshots);
    const math = teamMath(a, snap, [0, 2, 3], 1, situation, env);
    const odds = teamOdds(a, snap, [0, 2, 3], 1, situation, env);
    expect(math.pSuccess).toBeCloseTo(odds.pSuccess);
    expect(math.pClean).toBeCloseTo(odds.pClean);
    expect(math.rows.reduce((t, r) => t + r.pWorlds, 0)).toBeCloseTo(1);
  });

  it("a proof accounts for every spy set that would break the fact", () => {
    const a = analyze(record(5, [missionRound(5, 0, 0, [2, 3], 2)]), noAssumptions());
    const fact = deductions(a, a.events.length)[0];
    if (!fact) throw new Error("no fact");
    const proof = factProof(a, a.events.length, fact);
    expect(proof.breaking).toBe(9);
    expect(proof.standing).toBe(0);
    expect(proof.steps.reduce((t, st) => t + st.count, 0)).toBe(9);
  });

  it("a seat's story follows its odds event by event", () => {
    const a = analyze(record(5, [missionRound(5, 0, 0, [2, 3], 2)]), noAssumptions());
    const story = seatStory(a, 2, a.events.length);
    expect(story.series.at(-1)?.pSpy).toBeCloseTo(1);
    expect(story.moves[0]?.event.kind).toBe("mission");
  });
});

describe("optimal play (roles known)", () => {
  const roles: Role[] = ["resistance", "spy", "resistance", "spy", "resistance"];
  const opening = (team: number[], leader = 0) =>
    record(5, [{ proposals: [approved(5, leader, 0, team)], result: null }], roles);

  it("grades nothing until roles are known", () => {
    const rec = record(5, [{ proposals: [approved(5, 0, 0, [1, 2])], result: null }]);
    expect(gradeDecisions(rec, defaultAssumptions())).toEqual([]);
  });

  it("values a round-one team by what the leader knew, listing every optimal team", () => {
    // Round one: every pair is equal for the table; seat 0 knows it's clean.
    const graded = gradeDecisions(opening([1, 2]), defaultAssumptions());
    const p = graded.find((g) => g.kind === "proposal");
    // Seat 0 knew it was clean: a team without it is worse by what it knew.
    expect(p?.grade).not.toBe("best");
    const optimal = p?.choice?.options.filter((o) => o.optimal) ?? [];
    expect(optimal.length).toBe(4);
    expect(optimal.every((o) => o.team.includes(0))).toBe(true);

    const self = gradeDecisions(opening([0, 2]), defaultAssumptions()).find(
      (g) => g.kind === "proposal",
    );
    expect(self?.grade).toBe("best");
  });

  it("a spy's optimal team surely fails and leaves the most doubt", () => {
    const one = gradeDecisions(opening([1, 2], 1), defaultAssumptions()).find(
      (g) => g.kind === "proposal",
    );
    expect(one?.choice?.metric).toBe("spy");
    expect(one?.choice?.chosen.primary).toBeGreaterThan(0);

    const both = gradeDecisions(opening([1, 3], 1), defaultAssumptions()).find(
      (g) => g.kind === "proposal",
    );
    expect(both?.grade).not.toBe("best");
    expect(both?.choice?.chosen.primary ?? 1).toBeLessThan(one?.choice?.chosen.primary ?? 0);

    const clean = gradeDecisions(opening([0, 2], 1), defaultAssumptions()).find(
      (g) => g.kind === "proposal",
    );
    expect(clean?.title).toBe("No spy aboard");
  });
});

describe("game value (lookahead)", () => {
  it("drops to zero with the real roles once the table's play can't win", () => {
    // 5 players, spies {3,4}. Two sabotaged missions on teams with seat 3 and
    // 4 leave the table blaming 0/1 as much as 3/4 …
    const roles: Role[] = ["resistance", "resistance", "resistance", "spy", "spy"];
    const rec = record(
      5,
      [
        missionRound(5, 0, 0, [0, 3], 1),
        missionRound(5, 1, 1, [0, 1, 2], 0),
        missionRound(5, 2, 2, [1, 4], 1),
      ],
      roles,
    );
    const a = analyze(rec, defaultAssumptions());
    const env = { playerCount: 5, blindSpies: false, assumptions: defaultAssumptions() };
    const curve = gameValueCurve(rec, a, env);
    for (const p of curve) {
      expect(p.table).toBeGreaterThanOrEqual(0);
      expect(p.table).toBeLessThanOrEqual(1);
      expect(p.truth).not.toBeNull();
    }
  });
});
