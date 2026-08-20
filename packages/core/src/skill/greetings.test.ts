import { describe, expect, it } from "vitest";
import type { PlayerSkillResponse, SkillTraitId } from "../protocol/index.ts";
import {
  pickSpotlight,
  type SkillSnapshot,
  SPOTLIGHT_WEIGHTS,
  spotlightCandidates,
} from "./greetings.ts";

// ── fixtures ──────────────────────────────────────────────────────────

function player(
  userId: string,
  opts: { eligible?: boolean; ratedMatches?: number; distinctGames?: number } = {},
): PlayerSkillResponse {
  const eligible = opts.eligible ?? true;
  return {
    userId,
    eligibility: {
      eligible,
      ratedMatches: opts.ratedMatches ?? 20,
      distinctGames: opts.distinctGames ?? 5,
      minMatches: 8,
      minGames: 3,
    },
    traits: null,
    games: [],
    ratedSlugs: [],
    highlights: [],
  };
}

/** Trait board from a userId order; `matches` is irrelevant to trait boards. */
function traitBoard(trait: SkillTraitId, order: readonly string[]) {
  return {
    trait,
    entries: order.map((userId, i) => ({
      userId,
      rank: i + 1,
      percentile: 100 - i * 10,
      score: 90 - i * 5,
    })),
  };
}

function gameBoard(slug: string, order: readonly (readonly [string, number])[]) {
  return {
    slug,
    entries: order.map(([userId, matches], i) => ({ userId, rank: i + 1, matches })),
  };
}

function snapshot(
  partial: Partial<SkillSnapshot> & { players: SkillSnapshot["players"] },
): SkillSnapshot {
  return {
    traitBoards: [],
    gameBoards: [],
    streaks: [],
    ...partial,
  };
}

/** Five ranked members who each played more between the two runs. */
function played(ids: readonly string[], matches: number): SkillSnapshot["players"] {
  return Object.fromEntries(ids.map((id) => [id, player(id, { ratedMatches: matches })]));
}

const FIELD = ["a", "b", "c", "d", "e"];

describe("spotlightCandidates", () => {
  it("returns nothing without a comparable baseline", () => {
    const next = snapshot({
      players: played(FIELD, 21),
      traitBoards: [traitBoard("pln", ["e", "a", "b", "c", "d"])],
    });
    expect(spotlightCandidates(null, next)).toEqual([]);
  });

  it("returns nothing when nothing moved", () => {
    const players = played(FIELD, 20);
    const boards = [traitBoard("pln", FIELD)];
    const prev = snapshot({ players, traitBoards: boards });
    const next = snapshot({ players, traitBoards: boards });
    expect(spotlightCandidates(prev, next)).toEqual([]);
  });

  it("finds a climb to the top and scores it above a shallow one", () => {
    const prev = snapshot({ players: played(FIELD, 20), traitBoards: [traitBoard("pln", FIELD)] });
    // `d` goes 4th → 1st; `c` slides one place to 4th (no candidate, it's a drop).
    const next = snapshot({
      players: played(FIELD, 22),
      traitBoards: [traitBoard("pln", ["d", "a", "b", "c", "e"])],
    });
    const candidates = spotlightCandidates(prev, next);
    expect(candidates.map((c) => c.subjectUserId)).toEqual(["d"]);
    expect(candidates[0].event).toEqual({
      kind: "trait-climb",
      trait: "pln",
      from: 4,
      to: 1,
      fieldSize: 5,
    });
    // 3 of 4 places passed (75) + the crown (80) + capped depth (12).
    expect(candidates[0].score).toBe(167);
  });

  it("never produces a candidate for someone who dropped", () => {
    const prev = snapshot({ players: played(FIELD, 20), traitBoards: [traitBoard("pln", FIELD)] });
    const next = snapshot({
      players: played(FIELD, 22),
      traitBoards: [traitBoard("pln", ["b", "c", "d", "e", "a"])],
    });
    const subjects = spotlightCandidates(prev, next).map((c) => c.subjectUserId);
    expect(subjects).not.toContain("a");
  });

  it("treats an entrant to an existing board as climbing from past the end", () => {
    // `z` was already ranked, just short of this axis's exposure gate.
    const prev = snapshot({
      players: played(["a", "b", "c", "z"], 20),
      traitBoards: [traitBoard("pln", ["a", "b", "c"])],
    });
    const next = snapshot({
      players: played(["a", "b", "c", "z"], 22),
      traitBoards: [traitBoard("pln", ["a", "z", "b", "c"])],
    });
    const [top] = spotlightCandidates(prev, next);
    expect(top.subjectUserId).toBe("z");
    expect(top.event).toMatchObject({ from: null, to: 2, fieldSize: 4 });
  });

  it("ignores a board that only just started rendering", () => {
    const prev = snapshot({ players: played(FIELD, 20) });
    const next = snapshot({
      players: played(FIELD, 22),
      traitBoards: [traitBoard("dex", FIELD)],
    });
    expect(spotlightCandidates(prev, next)).toEqual([]);
  });

  it("drops a passive climb — the subject played nothing", () => {
    // `c` rises to 2nd only because `b` left the board entirely.
    const prev = snapshot({
      players: played(["a", "b", "c"], 20),
      traitBoards: [traitBoard("pln", ["a", "b", "c"])],
    });
    const next = snapshot({
      players: { ...played(["a", "c"], 20), b: player("b", { ratedMatches: 20 }) },
      traitBoards: [traitBoard("pln", ["a", "c"])],
    });
    expect(spotlightCandidates(prev, next)).toEqual([]);
  });

  it("requires a per-game climber to have actually played that game", () => {
    const prev = snapshot({
      players: played(["a", "b"], 20),
      gameBoards: [
        gameBoard("wingspan", [
          ["a", 6],
          ["b", 4],
        ]),
      ],
    });
    // `b` overtakes on rank but their play count is unchanged — impossible in
    // practice, and exactly the shape a passive reshuffle takes.
    const stale = snapshot({
      players: played(["a", "b"], 22),
      gameBoards: [
        gameBoard("wingspan", [
          ["b", 4],
          ["a", 6],
        ]),
      ],
    });
    expect(spotlightCandidates(prev, stale)).toEqual([]);

    const real = snapshot({
      players: played(["a", "b"], 22),
      gameBoards: [
        gameBoard("wingspan", [
          ["b", 6],
          ["a", 6],
        ]),
      ],
    });
    expect(spotlightCandidates(prev, real)[0]).toMatchObject({
      key: "game-climb:wingspan:b",
      event: { kind: "game-climb", slug: "wingspan", from: 2, to: 1, fieldSize: 2 },
    });
  });

  it("scores a per-game climb below the same climb on a trait board", () => {
    const prev = snapshot({
      players: played(["a", "b"], 20),
      traitBoards: [traitBoard("pln", ["a", "b"])],
      gameBoards: [
        gameBoard("wingspan", [
          ["a", 6],
          ["b", 4],
        ]),
      ],
    });
    const next = snapshot({
      players: played(["a", "b"], 22),
      traitBoards: [traitBoard("pln", ["b", "a"])],
      gameBoards: [
        gameBoard("wingspan", [
          ["b", 6],
          ["a", 6],
        ]),
      ],
    });
    const [first, second] = spotlightCandidates(prev, next);
    expect(first.event.kind).toBe("trait-climb");
    expect(second.event.kind).toBe("game-climb");
    expect(second.score).toBeCloseTo(first.score * SPOTLIGHT_WEIGHTS.gameBoardMultiplier, 5);
  });

  it("reports a profile unlocking and suppresses its own side effects", () => {
    const prev = snapshot({
      players: { ...played(["a", "b"], 20), z: player("z", { eligible: false, ratedMatches: 6 }) },
      traitBoards: [traitBoard("pln", ["a", "b"])],
    });
    const next = snapshot({
      players: {
        ...played(["a", "b"], 20),
        z: player("z", { ratedMatches: 9, distinctGames: 3 }),
      },
      // Newly ranked, so `z` appears on the board too — one story, not two.
      traitBoards: [traitBoard("pln", ["a", "z", "b"])],
    });
    const candidates = spotlightCandidates(prev, next);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      key: "profile-unlocked:z",
      subjectUserId: "z",
      event: { kind: "profile-unlocked", ratedMatches: 9, distinctGames: 3 },
      score: SPOTLIGHT_WEIGHTS.profileUnlocked,
    });
  });

  it("announces a new holder of the longest run, but not a retained one", () => {
    const players = played(["a", "b"], 20);
    const prev = snapshot({ players, streaks: [{ userId: "a", length: 4 }] });
    const kept = snapshot({ players, streaks: [{ userId: "a", length: 5 }] });
    expect(spotlightCandidates(prev, kept)).toEqual([]);

    const taken = snapshot({ players, streaks: [{ userId: "b", length: 5 }] });
    expect(spotlightCandidates(prev, taken)[0]).toMatchObject({
      subjectUserId: "b",
      event: { kind: "streak-lead", length: 5 },
    });
  });

  it("stays quiet about a run that is too short or shared", () => {
    const players = played(["a", "b"], 20);
    const prev = snapshot({ players, streaks: [] });
    const short = snapshot({ players, streaks: [{ userId: "b", length: 2 }] });
    expect(spotlightCandidates(prev, short)).toEqual([]);

    const tied = snapshot({
      players,
      streaks: [
        { userId: "a", length: 4 },
        { userId: "b", length: 4 },
      ],
    });
    expect(spotlightCandidates(prev, tied)).toEqual([]);
  });

  it("is order-independent and repeatable", () => {
    const prev = snapshot({ players: played(FIELD, 20), traitBoards: [traitBoard("pln", FIELD)] });
    const next = snapshot({
      players: played(FIELD, 22),
      traitBoards: [
        traitBoard("pln", ["d", "a", "b", "c", "e"]),
        traitBoard("soc", ["e", "a", "b", "c", "d"]),
      ],
    });
    const prevSoc = snapshot({
      players: prev.players,
      traitBoards: [traitBoard("pln", FIELD), traitBoard("soc", FIELD)],
    });
    const once = spotlightCandidates(prevSoc, next);
    const twice = spotlightCandidates(prevSoc, next);
    expect(JSON.stringify(once)).toBe(JSON.stringify(twice));
    // `e` passed four places, `d` three — the deeper climb leads.
    expect(once.map((c) => c.key)).toEqual(["trait-climb:soc:e", "trait-climb:pln:d"]);
  });
});

describe("pickSpotlight", () => {
  it("returns null when nothing moved", () => {
    expect(pickSpotlight([])).toBeNull();
  });

  it("keeps the best candidate and two mentions of DIFFERENT people", () => {
    const prev = snapshot({
      players: played(FIELD, 20),
      traitBoards: [traitBoard("pln", FIELD), traitBoard("soc", FIELD)],
      gameBoards: [
        gameBoard("wingspan", [
          ["a", 6],
          ["b", 4],
          ["c", 4],
        ]),
      ],
    });
    const next = snapshot({
      players: played(FIELD, 22),
      // `d` takes both trait boards; `c` takes the game board.
      traitBoards: [
        traitBoard("pln", ["d", "a", "b", "c", "e"]),
        traitBoard("soc", ["d", "a", "b", "c", "e"]),
      ],
      gameBoards: [
        gameBoard("wingspan", [
          ["c", 6],
          ["a", 6],
          ["b", 4],
        ]),
      ],
    });
    const picked = pickSpotlight(spotlightCandidates(prev, next));
    expect(picked?.headline.subjectUserId).toBe("d");
    expect(picked?.runnersUp.map((r) => r.subjectUserId)).toEqual(["c"]);
  });
});

describe("relative worth of the candidate kinds", () => {
  // Regression for a ranking that read wrong against real history: a five-place
  // climb to 3rd outscored someone taking 1st outright, and a first appearance
  // on a board outscored a real climb by claiming credit for passing people who
  // were never ahead.
  const FIELD9 = ["a", "b", "c", "d", "e", "f", "g", "h", "i"];

  it("puts taking 1st above a deep climb that stopped short of it", () => {
    const prev = snapshot({
      players: played(FIELD9, 20),
      traitBoards: [traitBoard("pln", FIELD9)],
    });
    // `i` climbs seven places to 2nd; `h` climbs one place to 1st.
    const next = snapshot({
      players: played(FIELD9, 23),
      traitBoards: [traitBoard("pln", ["h", "i", "a", "b", "c", "d", "e", "f", "g"])],
    });
    const [top, second] = spotlightCandidates(prev, next);
    expect(top.subjectUserId).toBe("h");
    expect(second.subjectUserId).toBe("i");
  });

  it("discounts a first appearance against a real climb to the same rank", () => {
    const prev = snapshot({
      players: played(FIELD9, 20),
      traitBoards: [
        // `i` is ranked but not yet on the Planning board.
        traitBoard("pln", ["a", "b", "c", "d", "e", "f", "g", "h"]),
        traitBoard("soc", FIELD9),
      ],
    });
    const next = snapshot({
      players: played(FIELD9, 23),
      traitBoards: [
        // `i` arrives at 3rd from nowhere…
        traitBoard("pln", ["a", "b", "i", "c", "d", "e", "f", "g", "h"]),
        // …while `h` passes five actual people to reach the same rank.
        traitBoard("soc", ["a", "b", "h", "c", "d", "e", "f", "g", "i"]),
      ],
    });
    const byKey = Object.fromEntries(spotlightCandidates(prev, next).map((c) => [c.key, c.score]));
    expect(byKey["trait-climb:pln:i"]).toBeLessThan(byKey["trait-climb:soc:h"]);
  });
});
