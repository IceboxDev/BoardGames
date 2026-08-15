import { describe, expect, it } from "vitest";
import { createRng } from "../../lib/rng";
import {
  ALL_CODES,
  allGuessesDone,
  buildRoundTransmissions,
  buildTeams,
  chatAllowed,
  checkClueLegality,
  codesEqual,
  defaultTeamPlayers,
  drawCode,
  eligibleSeats,
  encryptorFor,
  evaluateRoundEnd,
  guessDrivenByAi,
  isValidCode,
  normalizeClue,
  pendingGuessPurposes,
  resolveTransmission,
  teamOf,
} from "./rules";
import type { Code, DecryptoContext, TeamState, Transmission } from "./types";
import { DEFAULT_BEATS } from "./types";
import { DECRYPTO_WORDS } from "./words";

function makeCtx(overrides: Partial<DecryptoContext> = {}): DecryptoContext {
  const rng = createRng(42);
  const base: DecryptoContext = {
    variant: "standard",
    timerEnabled: false,
    seed: 42,
    rng,
    humanPlayers: [0],
    aiModels: [null, "gpt-5.5", "gpt-5.5", "gpt-5.5"],
    teams: buildTeams({ variant: "standard", teamPlayers: defaultTeamPlayers("standard"), rng }),
    round: 1,
    current: [],
    txIdx: 0,
    clueTimerDeadlineTs: null,
    chat: [],
    history: [],
    result: null,
    beats: DEFAULT_BEATS,
  };
  const ctx = { ...base, ...overrides };
  if (!overrides.current) ctx.current = buildRoundTransmissions(ctx, ctx.round);
  return ctx;
}

function tx(ctx: DecryptoContext): Transmission {
  return ctx.current[ctx.txIdx] as Transmission;
}

describe("decrypto words", () => {
  it("has no duplicates and enough for both teams", () => {
    expect(new Set(DECRYPTO_WORDS).size).toBe(DECRYPTO_WORDS.length);
    expect(DECRYPTO_WORDS.length).toBeGreaterThanOrEqual(200);
    for (const w of DECRYPTO_WORDS) expect(w).toMatch(/^[a-z]+$/);
  });
});

describe("codes", () => {
  it("enumerates exactly the 24 distinct-digit permutations", () => {
    expect(ALL_CODES).toHaveLength(24);
    expect(new Set(ALL_CODES.map((c) => c.join(""))).size).toBe(24);
    for (const code of ALL_CODES) expect(new Set(code).size).toBe(3);
  });

  it("draws valid codes from the seeded rng", () => {
    const rng = createRng(7);
    for (let i = 0; i < 50; i++) expect(isValidCode(drawCode(rng))).toBe(true);
  });

  it("rejects repeated or out-of-range digits", () => {
    expect(isValidCode([1, 1, 2])).toBe(false);
    expect(isValidCode([0, 1, 2])).toBe(false);
    expect(isValidCode([1, 2])).toBe(false);
    expect(isValidCode([4, 3, 2])).toBe(true);
  });
});

describe("setup", () => {
  it("draws 8 distinct keywords for standard, 4 + none for the variant", () => {
    const std = buildTeams({
      variant: "standard",
      teamPlayers: defaultTeamPlayers("standard"),
      rng: createRng(1),
    });
    const all = [...(std[0].keywords ?? []), ...(std[1].keywords ?? [])];
    expect(all).toHaveLength(8);
    expect(new Set(all).size).toBe(8);

    const variant = buildTeams({
      variant: "interceptor",
      teamPlayers: defaultTeamPlayers("interceptor"),
      rng: createRng(1),
    });
    expect(variant[0].keywords).toHaveLength(4);
    expect(variant[1].keywords).toBeNull();
    expect(variant[1].players).toEqual([2]);
  });

  it("is deterministic for a given seed", () => {
    const a = buildTeams({
      variant: "standard",
      teamPlayers: defaultTeamPlayers("standard"),
      rng: createRng(99),
    });
    const b = buildTeams({
      variant: "standard",
      teamPlayers: defaultTeamPlayers("standard"),
      rng: createRng(99),
    });
    expect(a[0].keywords).toEqual(b[0].keywords);
    expect(a[1].keywords).toEqual(b[1].keywords);
  });

  it("rotates the encryptor round-robin", () => {
    const team: TeamState = {
      players: [2, 3],
      keywords: null,
      interceptions: 0,
      miscommunications: 0,
      usedClues: [],
    };
    expect(encryptorFor(team, 1)).toBe(2);
    expect(encryptorFor(team, 2)).toBe(3);
    expect(encryptorFor(team, 3)).toBe(2);
  });

  it("round 1 requires no interception; later rounds do", () => {
    const r1 = makeCtx({ round: 1 });
    expect(tx(r1).interceptRequired).toBe(false);
    const r2 = makeCtx({ round: 2 });
    expect(tx(r2).interceptRequired).toBe(true);
  });
});

describe("clue legality", () => {
  const keywords = ["dragonfly", "cocktail", "sombrero", "shadow"] as const;

  it("normalizes case and whitespace", () => {
    expect(normalizeClue("  Mexico  City ")).toBe("mexico city");
  });

  it("accepts fresh, keyword-free clues", () => {
    expect(checkClueLegality(keywords, [], ["mexico", "insect", "horror"]).ok).toBe(true);
  });

  it("rejects reuse of an earlier team clue, case-insensitively", () => {
    const result = checkClueLegality(keywords, ["mexico"], ["MEXICO", "wings", "night"]);
    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(result.reason).toContain("reuses");
  });

  it("rejects duplicate clues within the same submission", () => {
    const result = checkClueLegality(keywords, [], ["wings", "wings", "night"]);
    expect(result.ok).toBe(false);
  });

  it("rejects a clue containing a team keyword as a word (incl. simple plural)", () => {
    expect(checkClueLegality(keywords, [], ["a black dragonfly", "b", "c"]).ok).toBe(false);
    expect(checkClueLegality(keywords, [], ["sombreros", "b", "c"]).ok).toBe(false);
    // Substring inside a different word is allowed — only whole-word matches are illegal.
    expect(checkClueLegality(keywords, [], ["shadowboxing", "b", "c"]).ok).toBe(true);
  });

  it("interceptor pseudo-team (null keywords) only checks reuse", () => {
    expect(checkClueLegality(null, [], ["anything", "goes", "here"]).ok).toBe(true);
  });
});

describe("eligibility", () => {
  it("decode excludes the encryptor; intercept is the whole opposing team", () => {
    const ctx = makeCtx({ round: 3 }); // odd round → rotation back to seat 0
    const t = tx(ctx); // team 0, encryptor seat 0
    expect(t.team).toBe(0);
    expect(t.encryptor).toBe(0);
    expect(eligibleSeats(ctx, t, "decode")).toEqual([1]);
    expect(eligibleSeats(ctx, t, "intercept")).toEqual([2, 3]);
  });

  it("guessDrivenByAi is true only when no eligible human exists", () => {
    const ctx = makeCtx({ round: 3, humanPlayers: [0] }); // encryptor = seat 0 (human)
    const t = tx(ctx);
    // Seat 1 (the only decoder) is AI; seats 2,3 are AI interceptors.
    expect(guessDrivenByAi(ctx, t, "decode")).toBe(true);
    expect(guessDrivenByAi(ctx, t, "intercept")).toBe(true);
    const ctx2 = makeCtx({ round: 3, humanPlayers: [1, 2] });
    const t2 = tx(ctx2);
    expect(guessDrivenByAi(ctx2, t2, "decode")).toBe(false);
    expect(guessDrivenByAi(ctx2, t2, "intercept")).toBe(false);
  });

  it("pending purposes shrink as guesses commit; skipped is instantly done", () => {
    const ctx = makeCtx({ round: 2 });
    const t = tx(ctx);
    expect(pendingGuessPurposes(t)).toEqual(["decode", "intercept"]);
    t.decodeGuess = [1, 2, 3] as Code;
    expect(pendingGuessPurposes(t)).toEqual(["intercept"]);
    t.interceptGuess = [1, 2, 3] as Code;
    expect(allGuessesDone(t)).toBe(true);
    const skipped = { ...t, decodeGuess: null, interceptGuess: null, skipped: true };
    expect(allGuessesDone(skipped)).toBe(true);
  });

  it("locks the encryptor out of chat until their transmission resolves", () => {
    const ctx = makeCtx({ round: 1 });
    expect(chatAllowed(ctx, 0)).toBe(false); // White encryptor
    expect(chatAllowed(ctx, 1)).toBe(true);
    expect(chatAllowed(ctx, 2)).toBe(false); // Black encryptor (standard: both locked)
    expect(chatAllowed(ctx, 3)).toBe(true);
    const t = tx(ctx);
    t.resolved = { intercepted: false, miscommunicated: false };
    expect(chatAllowed(ctx, 0)).toBe(true);
  });

  it("denies chat to the solo interceptor (team of one)", () => {
    const rng = createRng(5);
    const ctx = makeCtx({
      variant: "interceptor",
      teams: buildTeams({
        variant: "interceptor",
        teamPlayers: defaultTeamPlayers("interceptor"),
        rng,
      }),
    });
    expect(teamOf(ctx, 2)).toBe(1);
    expect(chatAllowed(ctx, 2)).toBe(false);
  });
});

describe("resolution", () => {
  function resolveWith(
    ctx: DecryptoContext,
    guesses: { decode?: Code | null; intercept?: Code | null; skipped?: boolean },
  ): DecryptoContext {
    const t = tx(ctx);
    t.decodeGuess = guesses.decode ?? null;
    t.interceptGuess = guesses.intercept ?? null;
    if (guesses.skipped) t.skipped = true;
    const { current, teams } = resolveTransmission(ctx);
    return { ...ctx, current, teams };
  }

  it("awards an interception on an exact match only", () => {
    const ctx = makeCtx({ round: 2 });
    const code = tx(ctx).code;
    const wrong = ALL_CODES.find((c) => !codesEqual(c, code)) as Code;
    const next = resolveWith(ctx, { decode: [...code] as Code, intercept: [...code] as Code });
    expect(next.teams[1].interceptions).toBe(1);
    expect(next.teams[0].miscommunications).toBe(0);

    const miss = resolveWith(makeCtx({ round: 2 }), { decode: null, intercept: wrong });
    expect(miss.teams[1].interceptions).toBe(0);
  });

  it("awards a miscommunication when the own team is wrong — both can co-occur", () => {
    const ctx = makeCtx({ round: 2 });
    const code = tx(ctx).code;
    const wrong = ALL_CODES.find((c) => !codesEqual(c, code)) as Code;
    const next = resolveWith(ctx, { decode: wrong, intercept: [...code] as Code });
    expect(next.teams[0].miscommunications).toBe(1);
    expect(next.teams[1].interceptions).toBe(1);
    expect(tx(next).resolved).toEqual({ intercepted: true, miscommunicated: true });
  });

  it("no interception is possible in round 1 (interceptRequired false)", () => {
    const ctx = makeCtx({ round: 1 });
    const code = tx(ctx).code;
    // Even a "correct" stray intercept guess cannot score in round 1.
    const next = resolveWith(ctx, { decode: [...code] as Code, intercept: [...code] as Code });
    expect(next.teams[1].interceptions).toBe(0);
  });

  it("a skipped transmission is a miscommunication", () => {
    const next = resolveWith(makeCtx({ round: 2 }), { skipped: true });
    expect(next.teams[0].miscommunications).toBe(1);
  });

  it("variant: interceptor gains a token on intercept AND on decode failure", () => {
    const rng = createRng(3);
    const base = makeCtx({
      variant: "interceptor",
      round: 2,
      humanPlayers: [2],
      teams: buildTeams({
        variant: "interceptor",
        teamPlayers: defaultTeamPlayers("interceptor"),
        rng,
      }),
    });
    const code = tx(base).code;
    const wrong = ALL_CODES.find((c) => !codesEqual(c, code)) as Code;
    const next = resolveWith(base, { decode: wrong, intercept: [...code] as Code });
    expect(next.teams[1].interceptions).toBe(2); // both award paths in one round
    expect(next.teams[0].miscommunications).toBe(1);
  });
});

describe("win evaluation", () => {
  function withTokens(
    ctx: DecryptoContext,
    tokens: [{ i?: number; m?: number }, { i?: number; m?: number }],
  ): DecryptoContext {
    const teams = ctx.teams.map((t, idx) => ({
      ...t,
      interceptions: tokens[idx as 0 | 1]?.i ?? 0,
      miscommunications: tokens[idx as 0 | 1]?.m ?? 0,
    })) as [TeamState, TeamState];
    return { ...ctx, teams };
  }

  it("2 interceptions win; 2 miscommunications lose", () => {
    expect(evaluateRoundEnd(withTokens(makeCtx({ round: 3 }), [{ i: 2 }, {}]))).toMatchObject({
      winner: 0,
      reason: "interceptions",
    });
    expect(evaluateRoundEnd(withTokens(makeCtx({ round: 3 }), [{ m: 2 }, {}]))).toMatchObject({
      winner: 1,
      reason: "miscommunications",
    });
    expect(evaluateRoundEnd(withTokens(makeCtx({ round: 3 }), [{ i: 1, m: 1 }, {}]))).toBeNull();
  });

  it("simultaneous thresholds fall through to the points tiebreak", () => {
    // Both teams reach 2 interceptions the same round; team 1 has fewer miscommunications.
    const both = withTokens(makeCtx({ round: 4 }), [
      { i: 2, m: 1 },
      { i: 2, m: 0 },
    ]);
    expect(evaluateRoundEnd(both)).toMatchObject({ winner: 1, reason: "points" });
    // One team simultaneously wins and loses.
    const wl = withTokens(makeCtx({ round: 4 }), [
      { i: 2, m: 2 },
      { i: 0, m: 1 },
    ]);
    expect(evaluateRoundEnd(wl)).toMatchObject({ reason: "points", winner: 0 });
    // Perfect symmetry → shared victory.
    const tie = withTokens(makeCtx({ round: 4 }), [
      { i: 2, m: 2 },
      { i: 2, m: 2 },
    ]);
    const result = evaluateRoundEnd(tie);
    expect(result?.reason).toBe("shared");
    expect(result?.winner).toBeUndefined();
  });

  it("round 8 hard stop: points decide, tie shares", () => {
    const ahead = withTokens(makeCtx({ round: 8 }), [
      { i: 1, m: 0 },
      { i: 0, m: 1 },
    ]);
    expect(evaluateRoundEnd(ahead)).toMatchObject({ winner: 0, reason: "points" });
    const level = withTokens(makeCtx({ round: 8 }), [
      { i: 1, m: 1 },
      { i: 1, m: 1 },
    ]);
    expect(evaluateRoundEnd(level)?.reason).toBe("shared");
    const early = withTokens(makeCtx({ round: 7 }), [
      { i: 1, m: 0 },
      { i: 0, m: 1 },
    ]);
    expect(evaluateRoundEnd(early)).toBeNull();
  });

  it("variant: interceptor wins at 2 tokens; team survives 5 rounds", () => {
    const rng = createRng(6);
    const base = makeCtx({
      variant: "interceptor",
      teams: buildTeams({
        variant: "interceptor",
        teamPlayers: defaultTeamPlayers("interceptor"),
        rng,
      }),
    });
    expect(evaluateRoundEnd(withTokens({ ...base, round: 2 }, [{}, { i: 2 }]))).toMatchObject({
      winner: 1,
      reason: "interceptor-tokens",
    });
    expect(evaluateRoundEnd(withTokens({ ...base, round: 5 }, [{}, { i: 1 }]))).toMatchObject({
      winner: 0,
      reason: "survived",
    });
    expect(evaluateRoundEnd(withTokens({ ...base, round: 4 }, [{}, { i: 1 }]))).toBeNull();
  });
});
