import { describe, expect, it } from "vitest";
import type { MatchOutcome } from "../protocol/http/history.ts";
import { SKILL_CONFIG_V1 } from "./config.ts";
import { fitSkillRatings, type SkillMatchInput } from "./fit.ts";
import { highlightsFor } from "./highlights.ts";
import {
  gameLeaderboards,
  hazenPercentile,
  skillScore,
  traitLeaderboard,
  traitStandings,
} from "./percentiles.ts";

const p = (id: string) => ({ userId: id, displayName: id });

function duel(slug: string, winner: string, loser: string): SkillMatchInput {
  const outcome: MatchOutcome = {
    kind: "free-for-all",
    players: [
      { ...p(winner), score: 10 },
      { ...p(loser), score: 5 },
    ],
  };
  return { slug, playedAt: "2026-08-01T17:00:00.000Z", outcome };
}

/**
 * A pool of 6 players; "a" dominates round-robins across three games so
 * everyone clears eligibility (≥8 matches, ≥3 games) with real exposure.
 */
function poolFixture(): SkillMatchInput[] {
  const ids = ["a", "b", "c", "d", "e", "f"];
  const matches: SkillMatchInput[] = [];
  for (const slug of ["chess", "codenames", "jaipur"]) {
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        // Earlier in the list beats later — a strict pecking order.
        matches.push(duel(slug, ids[i], ids[j]));
      }
    }
  }
  return matches;
}

const VISIBLE = new Set(["a", "b", "c", "d", "e", "f"]);

describe("hazenPercentile", () => {
  it("avoids the 0/100 endpoints and centers correctly", () => {
    expect(hazenPercentile(1, 12)).toBeCloseTo(95.83, 1);
    expect(hazenPercentile(12, 12)).toBeCloseTo(4.17, 1);
    expect(hazenPercentile(1, 1)).toBe(50);
  });
});

describe("skillScore", () => {
  it("maps the group's best θ to 100 and the hardcoded floor to ~0", () => {
    const max = 0.6;
    expect(skillScore(max, max)).toBe(100);
    expect(skillScore(SKILL_CONFIG_V1.scoreFloorTheta, max)).toBe(1);
    expect(skillScore(-10, max)).toBe(1);
    expect(skillScore(0.5, max)).toBeGreaterThan(skillScore(0.2, max));
  });

  it("gives the group's best trait exactly 100 while other traits differ", () => {
    // "a" wins everything → rank 1 on every exposed trait, but the games
    // weight traits differently: the single strongest trait pins the 100
    // and the rest land visibly below it. (All-identical-scores regression.)
    const fit = fitSkillRatings(poolFixture());
    const standings = traitStandings(fit, VISIBLE);
    const aScores = ["int", "pln", "soph"].map(
      (t) => standings[t as "int" | "pln" | "soph"].find((s) => s.userId === "a")?.score ?? 0,
    );
    expect(Math.max(...aScores)).toBe(100);
    expect(new Set(aScores).size).toBeGreaterThan(1);
  });

  it("reports provisional axes as score 0 (not computed yet)", () => {
    const fit = fitSkillRatings(poolFixture());
    const standings = traitStandings(fit, VISIBLE);
    for (const s of standings.dex) {
      expect(s.provisional).toBe(true);
      expect(s.score).toBe(0);
    }
  });
});

describe("traitStandings / traitLeaderboard", () => {
  const fit = fitSkillRatings(poolFixture());
  const standings = traitStandings(fit, VISIBLE);

  it("orders the pecking order correctly on an exposed trait", () => {
    expect(standings.int.map((s) => s.userId)).toEqual(["a", "b", "c", "d", "e", "f"]);
    expect(standings.int[0].rank).toBe(1);
    expect(standings.int[0].percentile).toBeGreaterThan(standings.int[5].percentile);
  });

  it("marks unexposed axes provisional and refuses their leaderboard", () => {
    for (const s of standings.dex) expect(s.provisional).toBe(true);
    expect(traitLeaderboard(standings.dex)).toBeNull();
    expect(traitLeaderboard(standings.int)).not.toBeNull();
  });

  it("excludes invisible players from standings", () => {
    const partial = traitStandings(fit, new Set(["a", "b", "c", "d", "e"]));
    expect(partial.int.find((s) => s.userId === "f")).toBeUndefined();
    expect(partial.int).toHaveLength(5);
  });

  it("excludes ineligible players", () => {
    const withRookie = fitSkillRatings([...poolFixture(), duel("chess", "z", "a")]);
    const s = traitStandings(withRookie, new Set([...VISIBLE, "z"]));
    expect(s.int.find((row) => row.userId === "z")).toBeUndefined();
  });
});

describe("gameLeaderboards", () => {
  const fit = fitSkillRatings(poolFixture());

  it("builds boards for games with enough plays, best first", () => {
    const boards = gameLeaderboards(fit, VISIBLE);
    expect(boards.chess?.[0].userId).toBe("a");
    expect(boards.chess?.map((s) => s.rank)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("omits games below the play threshold", () => {
    const sparse = fitSkillRatings([
      ...poolFixture(),
      duel("wizard", "a", "b"),
      duel("wizard", "a", "c"),
    ]);
    // wizard has 2 rated plays < minGameBoardPlays (5) → no board.
    expect(gameLeaderboards(sparse, VISIBLE).wizard).toBeUndefined();
  });
});

describe("highlightsFor", () => {
  const fit = fitSkillRatings(poolFixture());
  const standings = traitStandings(fit, VISIBLE);
  const boards = gameLeaderboards(fit, VISIBLE);

  it("leads with a trait-first for the dominant player", () => {
    const h = highlightsFor("a", standings, boards);
    expect(h[0]).toEqual({ kind: "trait-first", trait: "int" });
    expect(h.some((x) => x.kind === "game-first")).toBe(true);
  });

  it("gives a mid-table player a top-3 or strong-trait fact", () => {
    const h = highlightsFor("b", standings, boards);
    expect(h.length).toBeGreaterThan(0);
    expect(h[0].kind === "trait-top3" || h[0].kind === "trait-strong").toBe(true);
  });

  it("falls back to the player's own strongest axis for the tail", () => {
    const h = highlightsFor("f", standings, boards);
    expect(h.length).toBeGreaterThan(0);
    expect(h[0].kind).toBe("top-trait");
  });

  it("returns nothing for an unknown player", () => {
    expect(highlightsFor("nobody", standings, boards)).toEqual([]);
  });

  it("never claims a first on a provisional-only axis", () => {
    const all = ["a", "b", "c", "d", "e", "f"].flatMap((id) =>
      highlightsFor(id, standings, boards),
    );
    for (const hl of all) {
      if (hl.kind === "trait-first" || hl.kind === "trait-top3") {
        expect(traitLeaderboard(standings[hl.trait], SKILL_CONFIG_V1)).not.toBeNull();
      }
    }
  });
});
