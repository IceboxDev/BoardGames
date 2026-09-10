import type { MatchOutcomeFreeForAll, MatchOutcomeTeams } from "@boardgames/core/history/types";
import { describe, expect, it } from "vitest";
import {
  describeSensoFfaError,
  describeSensoTeamsError,
  normalizeSensoFfa,
  normalizeSensoTeams,
  sensoFfaStandings,
} from "./senso-standings";

// The recorder never lets the winner be picked by hand: ranks and the winning
// side fall out of points → cubes → Emperor, the same ladder the online game
// uses. These pin the form policy around that — when ranks appear, what the
// Emperor is spared from entering, and the messages that block a save.

function player(
  userId: string,
  score: number,
  extra: Partial<MatchOutcomeFreeForAll["players"][number]> = {},
): MatchOutcomeFreeForAll["players"][number] {
  return { userId, displayName: userId, score, ...extra };
}

function ffa(...players: MatchOutcomeFreeForAll["players"]): MatchOutcomeFreeForAll {
  return { kind: "free-for-all", players };
}

describe("normalizeSensoFfa", () => {
  it("stamps the Standard subtitle and keeps ranks off an untouched table", () => {
    const out = normalizeSensoFfa(ffa(player("a", 0, { rank: 1 }), player("b", 0)));
    expect(out.scenario).toBe("Standard");
    expect(out.players.map((p) => p.rank)).toEqual([undefined, undefined]);
  });

  it("ranks by points once any are entered", () => {
    const out = normalizeSensoFfa(ffa(player("a", 9), player("b", 12), player("c", 4)));
    expect(out.players.map((p) => p.rank)).toEqual([2, 1, 3]);
  });

  it("breaks a points tie on cubes", () => {
    const out = normalizeSensoFfa(
      ffa(player("a", 12, { tiebreak: 3 }), player("b", 12, { tiebreak: 5 })),
    );
    expect(out.players.map((p) => p.rank)).toEqual([2, 1]);
  });

  it("crowns the Emperor on a persisting tie, below the top score, and spares it the cube input", () => {
    const out = normalizeSensoFfa(
      ffa(
        player("a", 12, { role: "Takeda", tiebreak: 4 }),
        player("b", 12, { role: "Uesugi", tiebreak: 4 }),
        player("c", 8, { role: "Emperor" }),
        player("d", 6, { role: "Oda", tiebreak: 2 }),
        player("e", 5, { role: "Mōri", tiebreak: 1 }),
      ),
    );
    expect(out.players.map((p) => p.rank)).toEqual([2, 2, 1, 4, 5]);
    expect(out.players[2]?.tiebreak).toBe(0);
    expect(sensoFfaStandings(out.players).tiebreak).toBe("emperor");
  });

  it("shares first place on a tie no Emperor can settle", () => {
    const out = normalizeSensoFfa(
      ffa(player("a", 10, { tiebreak: 2 }), player("b", 10, { tiebreak: 2 }), player("c", 1)),
    );
    expect(out.players.map((p) => p.rank)).toEqual([1, 1, 3]);
    expect(sensoFfaStandings(out.players).tiebreak).toBe("draw");
  });
});

describe("describeSensoFfaError", () => {
  const four = () => [
    player("a", 10, { role: "Takeda" }),
    player("b", 8, { role: "Uesugi" }),
    player("c", 6, { role: "Oda" }),
    player("d", 4, { role: "Mōri" }),
  ];

  it("passes a complete standard record", () => {
    expect(describeSensoFfaError(ffa(...four()))).toBeNull();
  });

  it("keeps the Emperor off tables smaller than five and requires one at five", () => {
    expect(describeSensoFfaError(ffa(player("a", 5, { role: "Emperor" }), player("b", 3)))).toBe(
      "The Emperor only sits at a five-player table",
    );
    expect(describeSensoFfaError(ffa(...four(), player("e", 2)))).toBe(
      "Five players means one of them is the Emperor — pick who",
    );
    expect(describeSensoFfaError(ffa(...four(), player("e", 2, { role: "Emperor" })))).toBeNull();
  });

  it("refuses a faction in two seats", () => {
    expect(
      describeSensoFfaError(ffa(player("a", 5, { role: "Oda" }), player("b", 3, { role: "Oda" }))),
    ).toBe("Two players can't both be Oda");
  });

  it("asks for points, then for the tied players' cubes — an entered 0 counts", () => {
    expect(describeSensoFfaError(ffa(player("a", 0), player("b", 0)))).toBe(
      "Enter each player's points",
    );
    expect(describeSensoFfaError(ffa(player("a", 7), player("b", 7)))).toBe(
      "Tied on points — enter each tied player's cubes on the map",
    );
    expect(
      describeSensoFfaError(ffa(player("a", 7, { tiebreak: 0 }), player("b", 7, { tiebreak: 0 }))),
    ).toBeNull();
  });
});

function team(
  members: [string, string?][],
  extra: Partial<MatchOutcomeTeams["teams"][number]> = {},
): MatchOutcomeTeams["teams"][number] {
  return {
    members: members.map(([userId, role]) => ({
      userId,
      displayName: userId,
      ...(role ? { role } : {}),
    })),
    ...extra,
  };
}

function teams(...list: MatchOutcomeTeams["teams"]): MatchOutcomeTeams {
  return { kind: "teams", teams: list, winnerTeamIndices: [] };
}

describe("normalizeSensoTeams", () => {
  it("holds exactly two teams and stamps the 2v2 subtitle", () => {
    const out = normalizeSensoTeams(teams(team([["a"]]), team([["b"]]), team([["c"]])));
    expect(out.scenario).toBe("2v2");
    expect(out.teams).toHaveLength(2);
    expect(out.winnerTeamIndices).toEqual([]);
  });

  it("derives the winning side from points, then combined cubes", () => {
    expect(
      normalizeSensoTeams(
        teams(team([["a"], ["b"]], { score: 20 }), team([["c"], ["d"]], { score: 24 })),
      ).winnerTeamIndices,
    ).toEqual([1]);
    expect(
      normalizeSensoTeams(
        teams(
          team([["a"], ["b"]], { score: 20, tiebreak: 9 }),
          team([["c"], ["d"]], { score: 20, tiebreak: 7 }),
        ),
      ).winnerTeamIndices,
    ).toEqual([0]);
    expect(
      normalizeSensoTeams(
        teams(
          team([["a"], ["b"]], { score: 20, tiebreak: 9 }),
          team([["c"], ["d"]], { score: 20, tiebreak: 9 }),
        ),
      ).winnerTeamIndices,
    ).toEqual([0, 1]);
  });
});

describe("describeSensoTeamsError", () => {
  it("wants two full pairs, no Emperor, unique factions, points, then cubes on a tie", () => {
    expect(describeSensoTeamsError(teams(team([["a"]]), team([["c"], ["d"]])))).toBe(
      "Team 1 needs exactly 2 players",
    );
    expect(
      describeSensoTeamsError(teams(team([["a", "Emperor"], ["b"]]), team([["c"], ["d"]]))),
    ).toBe("The Emperor doesn't play 2v2");
    expect(
      describeSensoTeamsError(teams(team([["a", "Oda"], ["b"]]), team([["c", "Oda"], ["d"]]))),
    ).toBe("Two players can't both be Oda");
    expect(describeSensoTeamsError(teams(team([["a"], ["b"]]), team([["c"], ["d"]])))).toBe(
      "Enter each team's points",
    );
    expect(
      describeSensoTeamsError(
        teams(team([["a"], ["b"]], { score: 15 }), team([["c"], ["d"]], { score: 15 })),
      ),
    ).toBe("Tied on points — enter each team's cubes on the map");
    expect(
      describeSensoTeamsError(
        teams(
          team(
            [
              ["a", "Takeda"],
              ["b", "Uesugi"],
            ],
            { score: 15, tiebreak: 6 },
          ),
          team(
            [
              ["c", "Oda"],
              ["d", "Mōri"],
            ],
            { score: 15, tiebreak: 6 },
          ),
        ),
      ),
    ).toBeNull();
  });
});
