import { describe, expect, it } from "vitest";
import type { MatchOutcome } from "../protocol/http/history.ts";
import { fitSkillRatings, type SkillMatchInput } from "./fit.ts";

const p = (id: string) => ({ userId: id, displayName: id });

/** A 1v1 free-for-all where `winner` beats `loser`. */
function duel(slug: string, winner: string, loser: string, playedAt = "2026-08-01T17:00:00.000Z") {
  const outcome: MatchOutcome = {
    kind: "free-for-all",
    players: [
      { ...p(winner), score: 10 },
      { ...p(loser), score: 5 },
    ],
  };
  return { slug, playedAt, outcome } satisfies SkillMatchInput;
}

const repeat = (n: number, make: (i: number) => SkillMatchInput) =>
  Array.from({ length: n }, (_, i) => make(i));

// Five INT-heavy catalog games (int weight ≥ 0.4 each).
const INT_GAMES = ["chess", "go", "connect-4", "azul", "brass-birmingham"];

describe("fitSkillRatings — core properties", () => {
  it("converges and is deterministic (bit-identical across runs)", () => {
    const matches = [
      ...repeat(6, () => duel("chess", "a", "b")),
      ...repeat(4, () => duel("codenames", "b", "a")),
      duel("jaipur", "a", "c"),
    ];
    const r1 = fitSkillRatings(matches);
    const r2 = fitSkillRatings(matches);
    expect(r1.converged).toBe(true);
    expect(r1).toEqual(r2);
  });

  it("is order-independent", () => {
    const matches = [
      ...repeat(5, () => duel("chess", "a", "b")),
      ...repeat(5, () => duel("codenames", "b", "c")),
      ...repeat(3, () => duel("jaipur", "c", "a")),
    ];
    const shuffled = [...matches].reverse();
    const r1 = fitSkillRatings(matches);
    const r2 = fitSkillRatings(shuffled);
    expect(r1.players.a.traits.int.theta).toBeCloseTo(r2.players.a.traits.int.theta, 10);
    expect(r1.players.b.games.chess?.rating).toBeCloseTo(r2.players.b.games.chess?.rating ?? 0, 10);
  });

  it("keeps a perfectly balanced matchup at zero", () => {
    const matches = [
      ...repeat(5, () => duel("chess", "a", "b")),
      ...repeat(5, () => duel("chess", "b", "a")),
    ];
    const r = fitSkillRatings(matches);
    expect(r.players.a.traits.int.theta).toBeCloseTo(0, 6);
    expect(r.players.b.traits.int.theta).toBeCloseTo(0, 6);
  });

  it("rates the winner above the loser", () => {
    const r = fitSkillRatings(repeat(10, () => duel("chess", "a", "b")));
    expect(r.players.a.traits.int.theta).toBeGreaterThan(0);
    expect(r.players.b.traits.int.theta).toBeLessThan(0);
    expect(r.players.a.games.chess?.rating).toBeGreaterThan(r.players.b.games.chess?.rating ?? 0);
  });
});

describe("fitSkillRatings — anti-farming", () => {
  it("attributes single-game dominance mostly to the game offset, not the trait", () => {
    const r = fitSkillRatings(repeat(20, () => duel("chess", "a", "b")));
    const a = r.players.a;
    // The hidden game elo absorbs the bulk; trait credit stays a small slice.
    expect(a.games.chess?.offset ?? 0).toBeGreaterThan(a.traits.int.theta);
    // κ_g/κ_θ = 4 with w_int = 0.5 → θ_int ≈ g/8 at the optimum.
    expect(a.traits.int.theta).toBeLessThan(0.35 * (a.games.chess?.offset ?? 0));
  });

  it("gives cross-game dominance far more trait credit than farming one game", () => {
    const farmed = fitSkillRatings(repeat(20, () => duel("chess", "a", "b")));
    const spread = fitSkillRatings(
      INT_GAMES.flatMap((slug) => repeat(4, () => duel(slug, "a", "b"))),
    );
    expect(spread.players.a.traits.int.theta).toBeGreaterThan(
      2 * farmed.players.a.traits.int.theta,
    );
  });

  it("stops trait growth once the win rate is explained (self-limiting farm)", () => {
    const at20 = fitSkillRatings(repeat(20, () => duel("chess", "a", "b")));
    const at60 = fitSkillRatings(repeat(60, () => duel("chess", "a", "b")));
    // Tripling the farm games barely moves the trait.
    expect(at60.players.a.traits.int.theta).toBeLessThan(1.5 * at20.players.a.traits.int.theta);
  });
});

describe("fitSkillRatings — decay", () => {
  it("weights recent results above two-year-old ones", () => {
    const r = fitSkillRatings([
      ...repeat(8, () => duel("chess", "a", "b", "2024-08-01T17:00:00.000Z")),
      ...repeat(8, () => duel("chess", "b", "a", "2026-08-01T17:00:00.000Z")),
    ]);
    // Same head-to-head count, but b's wins are fresh: b comes out ahead.
    expect(r.players.b.games.chess?.rating ?? 0).toBeGreaterThan(
      r.players.a.games.chess?.rating ?? 0,
    );
  });

  it("anchors decay to the newest match, not wall clock", () => {
    const past = fitSkillRatings(
      repeat(5, () => duel("chess", "a", "b", "2020-01-01T17:00:00.000Z")),
    );
    const recent = fitSkillRatings(
      repeat(5, () => duel("chess", "a", "b", "2026-08-01T17:00:00.000Z")),
    );
    // A history shifted rigidly in time produces identical ratings.
    expect(past.players.a.traits.int.theta).toBeCloseTo(recent.players.a.traits.int.theta, 10);
  });
});

describe("fitSkillRatings — outcome kinds", () => {
  it("credits every member of a winning team", () => {
    const outcome: MatchOutcome = {
      kind: "teams",
      teams: [{ members: [p("a"), p("b")] }, { members: [p("c"), p("d")] }],
      winnerTeamIndices: [0],
    };
    const r = fitSkillRatings(
      repeat(8, () => ({ slug: "decrypto", playedAt: "2026-08-01T17:00:00.000Z", outcome })),
    );
    expect(r.players.a.traits.soph.theta).toBeGreaterThan(0);
    expect(r.players.b.traits.soph.theta).toBeCloseTo(r.players.a.traits.soph.theta, 8);
    expect(r.players.c.traits.soph.theta).toBeLessThan(0);
  });

  it("handles an all-wins co-op without blowing up the baseline", () => {
    const outcome: MatchOutcome = {
      kind: "coop",
      participants: [p("a"), p("b")],
      outcome: "win",
    };
    const r = fitSkillRatings(
      repeat(10, () => ({ slug: "pandemic", playedAt: "2026-08-01T17:00:00.000Z", outcome })),
    );
    expect(r.converged).toBe(true);
    // Baseline is pinned by its prior: bounded, and below the winners.
    expect(Math.abs(r.coopDifficulty.pandemic)).toBeLessThan(2);
    expect(r.players.a.games.pandemic?.rating ?? 0).toBeGreaterThan(r.coopDifficulty.pandemic);
  });
});

describe("fitSkillRatings — bookkeeping", () => {
  it("counts rated matches, distinct games, and eligibility", () => {
    const matches = [
      ...repeat(4, () => duel("chess", "a", "b")),
      ...repeat(3, () => duel("codenames", "a", "b")),
      duel("jaipur", "a", "b"),
    ];
    const r = fitSkillRatings(matches);
    expect(r.players.a.ratedMatches).toBe(8);
    expect(r.players.a.distinctGames).toBe(3);
    expect(r.players.a.eligible).toBe(true);
    const fewer = fitSkillRatings(matches.slice(0, 7));
    expect(fewer.players.a.eligible).toBe(false);
  });

  it("skips off-catalog slugs and evidence-free matches, with counts", () => {
    const scored: MatchOutcome = { kind: "coop", participants: [p("a")], score: 9 };
    const r = fitSkillRatings([
      duel("not-a-real-game", "a", "b"),
      { slug: null, playedAt: "2026-08-01T17:00:00.000Z", outcome: scored },
      { slug: "just-one", playedAt: "2026-08-01T17:00:00.000Z", outcome: scored },
      duel("chess", "a", "b"),
    ]);
    expect(r.skippedOffCatalog).toBe(2);
    expect(r.skippedNoEvidence).toBe(1);
    expect(r.players.a.ratedMatches).toBe(1);
  });

  it("computes trait exposure from normalized weights", () => {
    const r = fitSkillRatings(repeat(4, () => duel("chess", "a", "b")));
    // chess = 50/40/10: four fresh matches → 4·0.5 int exposure.
    expect(r.players.a.traits.int.exposure).toBeCloseTo(2, 6);
    expect(r.players.a.traits.pln.exposure).toBeCloseTo(1.6, 6);
    expect(r.players.a.traits.dex.exposure).toBe(0);
  });

  it("returns an empty result for empty input", () => {
    const r = fitSkillRatings([]);
    expect(r.players).toEqual({});
    expect(r.converged).toBe(true);
  });
});
