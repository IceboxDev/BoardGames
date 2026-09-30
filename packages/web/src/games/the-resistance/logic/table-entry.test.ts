import { tablePosition } from "@boardgames/core/games/the-resistance/rules";
import { describe, expect, it } from "vitest";
import {
  emptyRecord,
  entryStep,
  propose,
  recordResult,
  recordVotes,
  setRoles,
  undo,
} from "./table-entry";

const all = (n: number, v: boolean) => Array(n).fill(v);

describe("tabletop entry", () => {
  it("walks propose → votes → result and passes the lead", () => {
    let r = emptyRecord(5);
    expect(entryStep(r)).toBe("propose");
    r = propose(r, 0, [3, 1]);
    expect(r.rounds[0]?.proposals[0]?.team).toEqual([1, 3]);
    expect(entryStep(r)).toBe("votes");
    r = recordVotes(r, all(5, true));
    expect(entryStep(r)).toBe("result");
    r = recordResult(r, 1);
    expect(r.rounds[0]?.result?.success).toBe(false);
    expect(entryStep(r)).toBe("propose");
    expect(tablePosition(r).leader).toBe(1);
    // The next proposal opens a new round.
    r = propose(r, 1, [0, 2, 4]);
    expect(r.rounds).toHaveLength(2);
  });

  it("a rejected proposal stays in the round and the next leader proposes", () => {
    let r = propose(emptyRecord(5), 0, [0, 1]);
    r = recordVotes(r, [true, true, false, false, false]);
    expect(entryStep(r)).toBe("propose");
    r = propose(r, 0, [1, 2]);
    expect(r.rounds[0]?.proposals).toHaveLength(2);
    expect(r.rounds[0]?.proposals[1]?.leader).toBe(1);
  });

  it("undoes one step at a time back to an empty table", () => {
    let r = propose(emptyRecord(5), 0, [0, 1]);
    r = recordVotes(r, all(5, true));
    r = recordResult(r, 0);
    r = undo(r);
    expect(entryStep(r)).toBe("result");
    r = undo(r);
    expect(entryStep(r)).toBe("votes");
    r = undo(r);
    expect(r.rounds).toEqual([]);
  });

  it("ends the game and takes the roles reveal", () => {
    let r = emptyRecord(5);
    for (const [m, team] of [
      [0, [0, 1]],
      [1, [0, 1, 2]],
      [2, [0, 1]],
    ] as const) {
      r = recordResult(recordVotes(propose(r, m, team), all(5, true)), 0);
    }
    expect(entryStep(r)).toBe("over");
    expect(r.winner).toBe("resistance");
    r = setRoles(r, [3, 4]);
    expect(r.roles).toEqual(["resistance", "resistance", "resistance", "spy", "spy"]);
  });
});
