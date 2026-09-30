import { describe, expect, it } from "vitest";
import type { ProposalRecord, ResistanceRecord, Role, RoundRecord } from "../record";
import { type Assumptions, defaultAssumptions } from "./assumptions";
import { deductions } from "./deductions";
import { gradeDecisions } from "./grade";
import { analyze } from "./posterior";
import { rankTeams } from "./recommend";
import { recordUpTo, winProbability } from "./simulate";

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
    expect(winProbability(rec, a, a.events.length, env).resistance).toBe(1);
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
