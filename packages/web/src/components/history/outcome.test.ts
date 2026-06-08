import type {
  MatchOutcome,
  MatchOutcomeCoop,
  MatchOutcomeFreeForAll,
  MatchOutcomeLastStanding,
  MatchOutcomeOneVsMany,
  MatchOutcomeTeams,
  Participant,
} from "@boardgames/core/history/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyParticipants,
  carryOverParticipants,
  describeClocktowerError,
  describeGenericTeamsError,
  describeOutcomeError,
  describeVillainousError,
  describeWerewolfError,
  emptyOutcome,
  flatParticipants,
  isoNow,
  isoToLocalInput,
  localInputToIso,
  sortLockKeys,
  toCreateInput,
} from "./outcome";

// ── Fixtures ─────────────────────────────────────────────────────────────

function p(userId: string, displayName = `Player ${userId}`): Participant {
  return { userId, displayName };
}

function ffa(...players: Array<{ id: string; score: number }>): MatchOutcomeFreeForAll {
  return {
    kind: "free-for-all",
    players: players.map((x) => ({ ...p(x.id), score: x.score })),
  };
}

// Villainous: a point-less free-for-all — score stays 0, villain in `role`,
// sole winner in `rank: 1`.
function villainousFfa(
  ...players: Array<{ id: string; role?: string; winner?: boolean }>
): MatchOutcomeFreeForAll {
  return {
    kind: "free-for-all",
    players: players.map((x) => ({
      ...p(x.id),
      score: 0,
      ...(x.role ? { role: x.role } : {}),
      ...(x.winner ? { rank: 1 } : {}),
    })),
  };
}

function ls(
  ...players: Array<{ id: string; eliminationOrder?: number }>
): MatchOutcomeLastStanding {
  return {
    kind: "last-standing",
    players: players.map((x) => ({
      ...p(x.id),
      ...(x.eliminationOrder !== undefined ? { eliminationOrder: x.eliminationOrder } : {}),
    })),
  };
}

function coop(...ids: string[]): MatchOutcomeCoop {
  return { kind: "coop", participants: ids.map((id) => p(id)), outcome: "win" };
}

function ovm(solo: string, ...team: string[]): MatchOutcomeOneVsMany {
  return {
    kind: "one-vs-many",
    solo: { userId: solo, displayName: `Player ${solo}` },
    team: { members: team.map((id) => p(id)) },
    winnerSide: "team",
  };
}

function teams(teamsArr: Array<{ ids: string[] }>): MatchOutcomeTeams {
  return {
    kind: "teams",
    teams: teamsArr.map((t) => ({ members: t.ids.map((id) => p(id)) })),
    winnerTeamIndices: [],
  };
}

// ── isoNow / iso helpers ─────────────────────────────────────────────────

describe("isoNow", () => {
  it("returns an ISO-8601 string for the current instant", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-21T12:00:00.000Z"));
    expect(isoNow()).toBe("2026-05-21T12:00:00.000Z");
  });
});

describe("isoToLocalInput / localInputToIso", () => {
  it("isoToLocalInput returns an empty string for invalid input", () => {
    expect(isoToLocalInput("not-a-date")).toBe("");
  });

  it("localInputToIso falls back to now() for empty input", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    expect(localInputToIso("")).toBe("2026-01-01T00:00:00.000Z");
  });

  it("localInputToIso falls back to now() for invalid input", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    expect(localInputToIso("definitely not a datetime")).toBe("2026-01-01T00:00:00.000Z");
  });

  it("round-trip preserves the underlying instant", () => {
    // The local-input string drops seconds/ms; round-tripping should land at
    // the same minute-precision instant as the start.
    const original = "2026-05-21T18:30:00.000Z";
    const localStr = isoToLocalInput(original);
    expect(localStr).not.toBe("");
    const back = localInputToIso(localStr);
    // Compare to the minute, since the local-input slice drops :SS.000.
    expect(back.slice(0, 16)).toBe(original.slice(0, 16));
  });
});

// ── sortLockKeys ─────────────────────────────────────────────────────────

describe("sortLockKeys", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-21T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("filters out future-dated keys", () => {
    const keys = ["2026-05-22", "2026-05-20", "2026-05-21", "2026-06-01"];
    // Today is 2026-05-21 — yesterday + today survive, tomorrow and later drop.
    expect(sortLockKeys(keys)).toEqual(["2026-05-21", "2026-05-20"]);
  });

  it("returns newest-first", () => {
    const keys = ["2026-05-15", "2026-05-20", "2026-05-21", "2026-05-10"];
    expect(sortLockKeys(keys)).toEqual(["2026-05-21", "2026-05-20", "2026-05-15", "2026-05-10"]);
  });
});

// ── emptyOutcome ─────────────────────────────────────────────────────────

describe("emptyOutcome", () => {
  it("free-for-all seeds every prefill participant at score 0", () => {
    const out = emptyOutcome("free-for-all", [p("a"), p("b")]);
    expect(out.kind).toBe("free-for-all");
    if (out.kind === "free-for-all") {
      expect(out.players.map((x) => x.score)).toEqual([0, 0]);
      expect(out.players.map((x) => x.userId)).toEqual(["a", "b"]);
    }
  });

  it("teams dumps the entire prefill roster into team 0, leaves team 1 empty", () => {
    const out = emptyOutcome("teams", [p("a"), p("b"), p("c")]);
    if (out.kind === "teams") {
      expect(out.teams.length).toBe(2);
      expect(out.teams[0].members.map((m) => m.userId)).toEqual(["a", "b", "c"]);
      expect(out.teams[1].members).toEqual([]);
      expect(out.winnerTeamIndices).toEqual([]);
    }
  });

  it("last-standing keeps the same participant order", () => {
    const out = emptyOutcome("last-standing", [p("a"), p("b")]);
    if (out.kind === "last-standing") {
      expect(out.players.map((x) => x.userId)).toEqual(["a", "b"]);
    }
  });

  it("coop seeds outcome=win and a fresh participant copy", () => {
    const out = emptyOutcome("coop", [p("a")]);
    if (out.kind === "coop") {
      expect(out.outcome).toBe("win");
      expect(out.participants[0]).not.toBe(/* identity */ undefined);
      expect(out.participants[0].userId).toBe("a");
    }
  });

  it("one-vs-many starts with empty solo and empty team (does not seed from prefill)", () => {
    const out = emptyOutcome("one-vs-many", [p("a"), p("b")]);
    if (out.kind === "one-vs-many") {
      expect(out.solo.userId).toBe("");
      expect(out.team.members).toEqual([]);
      expect(out.winnerSide).toBe("team");
    }
  });
});

// ── flatParticipants ─────────────────────────────────────────────────────

describe("flatParticipants", () => {
  it("free-for-all → list of {userId, displayName}", () => {
    const flat = flatParticipants(ffa({ id: "a", score: 10 }, { id: "b", score: 5 }));
    expect(flat.map((x) => x.userId)).toEqual(["a", "b"]);
  });

  it("teams → concat of every team's members in order", () => {
    const flat = flatParticipants(teams([{ ids: ["a", "b"] }, { ids: ["c"] }]));
    expect(flat.map((x) => x.userId)).toEqual(["a", "b", "c"]);
  });

  it("coop → the participants array unchanged", () => {
    const flat = flatParticipants(coop("a", "b"));
    expect(flat.map((x) => x.userId)).toEqual(["a", "b"]);
  });

  it("one-vs-many → solo first, then the team, when solo is assigned", () => {
    const flat = flatParticipants(ovm("solo", "t1", "t2"));
    expect(flat.map((x) => x.userId)).toEqual(["solo", "t1", "t2"]);
  });

  it("one-vs-many → skips empty solo entry", () => {
    const out: MatchOutcomeOneVsMany = {
      kind: "one-vs-many",
      solo: { userId: "", displayName: "" },
      team: { members: [p("t1")] },
      winnerSide: "team",
    };
    expect(flatParticipants(out).map((x) => x.userId)).toEqual(["t1"]);
  });
});

// ── applyParticipants (per-kind) ─────────────────────────────────────────

describe("applyParticipants", () => {
  it("free-for-all preserves scores for participants that remain", () => {
    const base = ffa({ id: "a", score: 10 }, { id: "b", score: 5 });
    const applied = applyParticipants("free-for-all", base, [p("a"), p("c")]);
    if (applied.kind === "free-for-all") {
      expect(applied.players).toEqual([
        { userId: "a", displayName: "Player a", score: 10 },
        { userId: "c", displayName: "Player c", score: 0 },
      ]);
    }
  });

  it("last-standing preserves eliminationOrder for participants that remain", () => {
    const base = ls({ id: "a", eliminationOrder: 1 }, { id: "b" });
    const applied = applyParticipants("last-standing", base, [p("a"), p("c")]);
    if (applied.kind === "last-standing") {
      expect(applied.players[0]).toMatchObject({ userId: "a", eliminationOrder: 1 });
      expect(applied.players[1]).toMatchObject({ userId: "c" });
      expect(applied.players[1].eliminationOrder).toBeUndefined();
    }
  });

  it("coop swaps the participants array wholesale", () => {
    const base = coop("a");
    const applied = applyParticipants("coop", base, [p("x"), p("y")]);
    if (applied.kind === "coop") {
      expect(applied.participants.map((x) => x.userId)).toEqual(["x", "y"]);
    }
  });

  it("teams dumps participants into team 0 when team 0 is empty and team 1 has members", () => {
    const base = teams([{ ids: [] }, { ids: ["b"] }]);
    const applied = applyParticipants("teams", base, [p("x"), p("y")]);
    if (applied.kind === "teams") {
      // dumpInto picks team 1 here (team 0 empty AND team 1 non-empty)
      expect(applied.teams[0].members).toEqual([]);
      expect(applied.teams[1].members.map((m) => m.userId)).toEqual(["x", "y"]);
    }
  });

  it("teams dumps into team 0 by default", () => {
    const base = teams([{ ids: ["a"] }, { ids: [] }]);
    const applied = applyParticipants("teams", base, [p("x")]);
    if (applied.kind === "teams") {
      expect(applied.teams[0].members.map((m) => m.userId)).toEqual(["x"]);
      expect(applied.teams[1].members).toEqual([]);
    }
  });

  it("teams preserves per-member role when the same userId reappears", () => {
    const base: MatchOutcomeTeams = {
      kind: "teams",
      teams: [{ members: [{ ...p("a"), role: "Werewolf" }] }, { members: [] }],
      winnerTeamIndices: [],
    };
    const applied = applyParticipants("teams", base, [p("a"), p("b")]);
    if (applied.kind === "teams") {
      const a = applied.teams[0].members.find((m) => m.userId === "a");
      expect(a?.role).toBe("Werewolf");
    }
  });

  it("one-vs-many is a no-op (returns the base unchanged)", () => {
    const base = ovm("solo", "t1");
    const applied = applyParticipants("one-vs-many", base, [p("x"), p("y")]);
    expect(applied).toBe(base);
  });
});

// ── carryOverParticipants (kind A → kind B matrix) ───────────────────────

describe("carryOverParticipants — kind transitions", () => {
  it("free-for-all → last-standing keeps the same player order", () => {
    const before = ffa({ id: "a", score: 5 }, { id: "b", score: 3 });
    const after = carryOverParticipants("last-standing", before);
    if (after.kind === "last-standing") {
      expect(after.players.map((x) => x.userId)).toEqual(["a", "b"]);
    }
  });

  it("free-for-all → coop drops scores, keeps participants", () => {
    const before = ffa({ id: "a", score: 5 }, { id: "b", score: 3 });
    const after = carryOverParticipants("coop", before);
    if (after.kind === "coop") {
      expect(after.participants.map((x) => x.userId)).toEqual(["a", "b"]);
      expect(after.outcome).toBe("win");
    }
  });

  it("teams → free-for-all flattens every team into the FFA player list", () => {
    const before = teams([{ ids: ["a", "b"] }, { ids: ["c"] }]);
    const after = carryOverParticipants("free-for-all", before);
    if (after.kind === "free-for-all") {
      expect(after.players.map((x) => x.userId)).toEqual(["a", "b", "c"]);
      expect(after.players.every((x) => x.score === 0)).toBe(true);
    }
  });

  it("coop → teams dumps every participant into team 0", () => {
    const before = coop("a", "b", "c");
    const after = carryOverParticipants("teams", before);
    if (after.kind === "teams") {
      expect(after.teams[0].members.map((m) => m.userId)).toEqual(["a", "b", "c"]);
      expect(after.teams[1].members).toEqual([]);
    }
  });

  it("one-vs-many → free-for-all includes solo as the first player", () => {
    const before = ovm("solo", "t1", "t2");
    const after = carryOverParticipants("free-for-all", before);
    if (after.kind === "free-for-all") {
      expect(after.players.map((x) => x.userId)).toEqual(["solo", "t1", "t2"]);
    }
  });

  it("free-for-all → one-vs-many returns the empty one-vs-many shape (cannot infer roles)", () => {
    const before = ffa({ id: "a", score: 5 });
    const after = carryOverParticipants("one-vs-many", before);
    if (after.kind === "one-vs-many") {
      expect(after.solo.userId).toBe("");
      expect(after.team.members).toEqual([]);
    }
  });
});

// ── toCreateInput ────────────────────────────────────────────────────────

describe("toCreateInput", () => {
  const outcome = ffa({ id: "a", score: 1 }) as MatchOutcome;

  it("trims notes and drops empty strings to null", () => {
    expect(
      toCreateInput({
        dateKey: null,
        playedAt: "2026-05-21T12:00:00.000Z",
        gameSlug: "uno",
        gameTitle: "UNO",
        outcome,
        notes: "   ",
      }).notes,
    ).toBeNull();
    expect(
      toCreateInput({
        dateKey: null,
        playedAt: "2026-05-21T12:00:00.000Z",
        gameSlug: "uno",
        gameTitle: "UNO",
        outcome,
        notes: "  hello  ",
      }).notes,
    ).toBe("hello");
  });

  it("passes every other field through unchanged", () => {
    const state = {
      dateKey: "2026-05-21",
      playedAt: "2026-05-21T12:00:00.000Z",
      gameSlug: "uno",
      gameTitle: "UNO",
      outcome,
      notes: "x",
    };
    const out = toCreateInput(state);
    expect(out.dateKey).toBe(state.dateKey);
    expect(out.playedAt).toBe(state.playedAt);
    expect(out.gameSlug).toBe(state.gameSlug);
    expect(out.gameTitle).toBe(state.gameTitle);
    expect(out.outcome).toBe(state.outcome);
  });
});

// ── describeOutcomeError + family ────────────────────────────────────────

describe("describeOutcomeError", () => {
  it("free-for-all needs at least two players", () => {
    expect(describeOutcomeError(ffa({ id: "a", score: 0 }), "uno")).toBe(
      "Add at least two players",
    );
    expect(
      describeOutcomeError(ffa({ id: "a", score: 0 }, { id: "b", score: 0 }), "uno"),
    ).toBeNull();
  });

  it("last-standing needs ≥2 players and at least one survivor", () => {
    expect(describeOutcomeError(ls({ id: "a" }), "chess")).toBe("Add at least two players");
    expect(
      describeOutcomeError(
        ls({ id: "a", eliminationOrder: 1 }, { id: "b", eliminationOrder: 2 }),
        "chess",
      ),
    ).toBe("At least one player must survive");
  });

  it("coop needs at least one participant", () => {
    expect(
      describeOutcomeError({ kind: "coop", participants: [], outcome: "win" }, "pandemic"),
    ).toBe("Add at least one participant");
  });

  it("one-vs-many needs solo + at least one team player", () => {
    const noSolo: MatchOutcomeOneVsMany = {
      kind: "one-vs-many",
      solo: { userId: "", displayName: "" },
      team: { members: [p("t")] },
      winnerSide: "team",
    };
    expect(describeOutcomeError(noSolo, "scotland-yard")).toBe("Pick the solo player");
    const noTeam: MatchOutcomeOneVsMany = {
      kind: "one-vs-many",
      solo: p("solo"),
      team: { members: [] },
      winnerSide: "team",
    };
    expect(describeOutcomeError(noTeam, "scotland-yard")).toBe("Add at least one team player");
  });

  it("teams routes Clocktower / Werewolf slugs to specialized validators", () => {
    const base = teams([{ ids: ["a"] }, { ids: ["b"] }]);
    base.winnerTeamIndices = [0];
    // No role assigned on members → Werewolf validator flags it as "Pick a role".
    expect(describeOutcomeError(base, "one-night-ultimate-werewolf")).toContain("Pick a role");
    // Clocktower flags the same thing as "Pick a character".
    expect(describeOutcomeError(base, "blood-on-the-clocktower")).toContain("Pick a character");
  });

  it("teams without specialization uses the generic team validator", () => {
    const empty: MatchOutcomeTeams = {
      kind: "teams",
      teams: [{ members: [p("a")] }, { members: [] }],
      winnerTeamIndices: [0],
    };
    expect(describeOutcomeError(empty, "codenames")).toBe("Team 2 needs at least one player");
  });

  it("free-for-all routes the villainous slug to the villainous validator", () => {
    expect(
      describeOutcomeError(
        villainousFfa({ id: "a", role: "Jafar", winner: true }, { id: "b" }),
        "villainous",
      ),
    ).toBe("Pick a villain for Player b");
    // A non-villainous free-for-all keeps the generic minimum-players check.
    expect(describeOutcomeError(villainousFfa({ id: "a" }), "uno")).toBe(
      "Add at least two players",
    );
  });
});

describe("describeVillainousError", () => {
  it("requires at least two players", () => {
    expect(describeVillainousError(villainousFfa({ id: "a", role: "Jafar", winner: true }))).toBe(
      "Add at least two players",
    );
  });

  it("requires a villain for every player", () => {
    expect(
      describeVillainousError(villainousFfa({ id: "a", role: "Jafar", winner: true }, { id: "b" })),
    ).toBe("Pick a villain for Player b");
  });

  it("requires exactly one crowned winner", () => {
    expect(
      describeVillainousError(
        villainousFfa({ id: "a", role: "Jafar" }, { id: "b", role: "Ursula" }),
      ),
    ).toBe("Crown the player who won");
    expect(
      describeVillainousError(
        villainousFfa(
          { id: "a", role: "Jafar", winner: true },
          { id: "b", role: "Ursula", winner: true },
        ),
      ),
    ).toBe("Only one player can win Villainous");
  });

  it("returns null for a complete record", () => {
    expect(
      describeVillainousError(
        villainousFfa({ id: "a", role: "Jafar", winner: true }, { id: "b", role: "Ursula" }),
      ),
    ).toBeNull();
  });
});

describe("describeGenericTeamsError", () => {
  it("flags missing winner", () => {
    expect(
      describeGenericTeamsError({
        kind: "teams",
        teams: [{ members: [p("a")] }, { members: [p("b")] }],
        winnerTeamIndices: [],
      }),
    ).toBe("Pick at least one winning team");
  });

  it("returns null when teams are populated and a winner is picked", () => {
    expect(
      describeGenericTeamsError({
        kind: "teams",
        teams: [{ members: [p("a")] }, { members: [p("b")] }],
        winnerTeamIndices: [0],
      }),
    ).toBeNull();
  });
});

describe("describeWerewolfError", () => {
  it("flags empty roster as 'Add players'", () => {
    expect(
      describeWerewolfError({
        kind: "teams",
        teams: [{ members: [] }, { members: [] }],
        winnerTeamIndices: [],
      }),
    ).toBe("Add players");
  });

  it("flags an unassigned member by name", () => {
    expect(
      describeWerewolfError({
        kind: "teams",
        teams: [{ members: [{ ...p("a", "Anna") }] }, { members: [] }],
        winnerTeamIndices: [],
      }),
    ).toBe("Pick a role for Anna");
  });
});

describe("describeClocktowerError", () => {
  it("requires at least one good and one evil player", () => {
    expect(
      describeClocktowerError({
        kind: "teams",
        teams: [{ members: [{ ...p("a"), role: "Imp" }] }, { members: [] }],
        winnerTeamIndices: [0],
      }),
    ).toBe("At least one evil player is required");
  });
});
