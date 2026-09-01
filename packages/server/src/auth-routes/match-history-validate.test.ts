import { describe, expect, it } from "vitest";
import { collectUserIds, parseOutcome, refreshDisplayNames } from "./match-history-validate.ts";

describe("parseOutcome — free-for-all role round-trip", () => {
  it("preserves each player's role (Villainous villain) and the winner's rank", () => {
    const result = parseOutcome({
      kind: "free-for-all",
      scenario: "The Worst Takes It All",
      players: [
        { userId: "u1", displayName: "Alice", score: 0, rank: 1, role: "Maleficent" },
        { userId: "u2", displayName: "Bob", score: 0, role: "Jafar" },
      ],
    });
    expect(result.ok).toBe(true);
    if (result.ok && result.value.kind === "free-for-all") {
      expect(result.value.players[0]).toMatchObject({ rank: 1, role: "Maleficent" });
      expect(result.value.players[1].role).toBe("Jafar");
      expect(result.value.scenario).toBe("The Worst Takes It All");
    }
  });

  it("omits role entirely when a player has none", () => {
    const result = parseOutcome({
      kind: "free-for-all",
      players: [
        { userId: "u1", displayName: "Alice", score: 1 },
        { userId: "u2", displayName: "Bob", score: 2 },
      ],
    });
    expect(result.ok).toBe(true);
    if (result.ok && result.value.kind === "free-for-all") {
      expect("role" in result.value.players[0]).toBe(false);
    }
  });
});

describe("parseOutcome — free-for-all drawn duel (chess / Connect 4)", () => {
  it("preserves draw: true on a drawn duel", () => {
    const result = parseOutcome({
      kind: "free-for-all",
      draw: true,
      players: [
        { userId: "u1", displayName: "Alice", score: 0 },
        { userId: "u2", displayName: "Bob", score: 0 },
      ],
    });
    expect(result.ok).toBe(true);
    if (result.ok && result.value.kind === "free-for-all") {
      expect(result.value.draw).toBe(true);
    }
  });

  it("omits draw entirely on a decisive game", () => {
    const result = parseOutcome({
      kind: "free-for-all",
      players: [
        { userId: "u1", displayName: "Alice", score: 0, rank: 1 },
        { userId: "u2", displayName: "Bob", score: 0 },
      ],
    });
    expect(result.ok).toBe(true);
    if (result.ok && result.value.kind === "free-for-all") {
      expect("draw" in result.value).toBe(false);
    }
  });

  it("rejects a drawn match with a ranked winner", () => {
    const result = parseOutcome({
      kind: "free-for-all",
      draw: true,
      players: [
        { userId: "u1", displayName: "Alice", score: 0, rank: 1 },
        { userId: "u2", displayName: "Bob", score: 0 },
      ],
    });
    expect(result.ok).toBe(false);
  });

  it("rejects a non-true draw flag", () => {
    const result = parseOutcome({
      kind: "free-for-all",
      draw: false,
      players: [
        { userId: "u1", displayName: "Alice", score: 0 },
        { userId: "u2", displayName: "Bob", score: 0 },
      ],
    });
    expect(result.ok).toBe(false);
  });
});

describe("parseOutcome — free-for-all best-of-three rounds (Jaipur)", () => {
  it("round-trips a coherent record — seal winner ranked 1 over a higher total", () => {
    const result = parseOutcome({
      kind: "free-for-all",
      scenario: "Standard",
      players: [
        { userId: "u1", displayName: "Alice", score: 97, rank: 1, roundScores: [52, 10, 35] },
        { userId: "u2", displayName: "Bob", score: 110, rank: 2, roundScores: [48, 60, 2] },
      ],
    });
    expect(result.ok).toBe(true);
    if (result.ok && result.value.kind === "free-for-all") {
      expect(result.value.players[0]).toMatchObject({ rank: 1, roundScores: [52, 10, 35] });
      expect(result.value.players[1].roundScores).toEqual([48, 60, 2]);
    }
  });

  it("omits roundScores entirely on a plain scored match", () => {
    const result = parseOutcome({
      kind: "free-for-all",
      players: [
        { userId: "u1", displayName: "Alice", score: 1 },
        { userId: "u2", displayName: "Bob", score: 2 },
      ],
    });
    expect(result.ok).toBe(true);
    if (result.ok && result.value.kind === "free-for-all") {
      expect("roundScores" in result.value.players[0]).toBe(false);
    }
  });

  it("rejects a crowned winner contradicting the round wins", () => {
    const result = parseOutcome({
      kind: "free-for-all",
      players: [
        { userId: "u1", displayName: "Alice", score: 97, rank: 2, roundScores: [52, 10, 35] },
        { userId: "u2", displayName: "Bob", score: 110, rank: 1, roundScores: [48, 60, 2] },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/doesn't match the recorded round scores/);
  });

  it("rejects malformed round records — non-numeric entries or a bad round count", () => {
    const nonNumeric = parseOutcome({
      kind: "free-for-all",
      players: [
        { userId: "u1", displayName: "Alice", score: 97, rank: 1, roundScores: [52, "x", 35] },
        { userId: "u2", displayName: "Bob", score: 110, rank: 2, roundScores: [48, 60, 2] },
      ],
    });
    expect(nonNumeric.ok).toBe(false);
    const fourRounds = parseOutcome({
      kind: "free-for-all",
      players: [
        { userId: "u1", displayName: "Alice", score: 4, rank: 1, roundScores: [1, 1, 1, 1] },
        { userId: "u2", displayName: "Bob", score: 0, rank: 2, roundScores: [0, 0, 0, 0] },
      ],
    });
    expect(fourRounds.ok).toBe(false);
  });

  it("rejects a total that isn't the sum of that player's rounds", () => {
    const result = parseOutcome({
      kind: "free-for-all",
      players: [
        { userId: "u1", displayName: "Alice", score: 98, rank: 1, roundScores: [52, 10, 35] },
        { userId: "u2", displayName: "Bob", score: 110, rank: 2, roundScores: [48, 60, 2] },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/sum of that player's round scores/);
  });

  // Round 1 ties at 50 — the rulebook tiebreak (bonus, then goods tokens).
  const tiedPlayers = [
    { userId: "u1", displayName: "Alice", score: 90, rank: 1, roundScores: [50, 10, 30] },
    { userId: "u2", displayName: "Bob", score: 112, rank: 2, roundScores: [50, 60, 2] },
  ];

  it("round-trips a tied round settled by its tiebreak record", () => {
    const result = parseOutcome({
      kind: "free-for-all",
      players: tiedPlayers,
      roundTiebreaks: [{ round: 0, bonusTokens: [3, 1] }],
    });
    expect(result.ok).toBe(true);
    if (result.ok && result.value.kind === "free-for-all") {
      expect(result.value.roundTiebreaks).toEqual([{ round: 0, bonusTokens: [3, 1] }]);
      expect("goodsTokens" in (result.value.roundTiebreaks?.[0] ?? {})).toBe(false);
    }
  });

  it("rejects a tied round without a tiebreak, and malformed tiebreak shapes", () => {
    const missing = parseOutcome({
      kind: "free-for-all",
      players: tiedPlayers.map(({ rank: _drop, ...p }) => p),
    });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error).toMatch(/tied — record its bonus tokens/);
    const badTokens = parseOutcome({
      kind: "free-for-all",
      players: tiedPlayers,
      roundTiebreaks: [{ round: 0, bonusTokens: [3, "x"] }],
    });
    expect(badTokens.ok).toBe(false);
    const badRound = parseOutcome({
      kind: "free-for-all",
      players: tiedPlayers,
      roundTiebreaks: [{ round: -1, bonusTokens: [3, 1] }],
    });
    expect(badRound.ok).toBe(false);
    const stale = parseOutcome({
      kind: "free-for-all",
      players: [
        { userId: "u1", displayName: "Alice", score: 97, rank: 1, roundScores: [52, 10, 35] },
        { userId: "u2", displayName: "Bob", score: 110, rank: 2, roundScores: [48, 60, 2] },
      ],
      roundTiebreaks: [{ round: 0, bonusTokens: [3, 1] }],
    });
    expect(stale.ok).toBe(false);
    if (!stale.ok) expect(stale.error).toMatch(/isn't tied — remove its tiebreak/);
  });
});

describe("parseOutcome — last-standing role round-trip", () => {
  it("preserves each player's role (Dungeon Mayhem hero) and elimination order", () => {
    const result = parseOutcome({
      kind: "last-standing",
      scenario: "Standard + Monster Madness",
      players: [
        { userId: "u1", displayName: "Alice", role: "Sutha" },
        { userId: "u2", displayName: "Bob", eliminationOrder: 0, role: "Blorp" },
      ],
    });
    expect(result.ok).toBe(true);
    if (result.ok && result.value.kind === "last-standing") {
      expect(result.value.players[0]).toMatchObject({ role: "Sutha" });
      expect(result.value.players[1]).toMatchObject({ eliminationOrder: 0, role: "Blorp" });
      expect(result.value.scenario).toBe("Standard + Monster Madness");
    }
  });

  it("omits role entirely when a player has none", () => {
    const result = parseOutcome({
      kind: "last-standing",
      players: [
        { userId: "u1", displayName: "Alice" },
        { userId: "u2", displayName: "Bob", eliminationOrder: 0 },
      ],
    });
    expect(result.ok).toBe(true);
    if (result.ok && result.value.kind === "last-standing") {
      expect("role" in result.value.players[0]).toBe(false);
    }
  });
});

describe("parseOutcome — last-standing survivorRank (poker chip standings)", () => {
  it("preserves survivorRank on surviving players and omits it elsewhere", () => {
    const result = parseOutcome({
      kind: "last-standing",
      players: [
        { userId: "u1", displayName: "Alice", survivorRank: 2 },
        { userId: "u2", displayName: "Bob", survivorRank: 1 },
        { userId: "u3", displayName: "Cara", eliminationOrder: 0 },
      ],
    });
    expect(result.ok).toBe(true);
    if (result.ok && result.value.kind === "last-standing") {
      expect(result.value.players[0]).toMatchObject({ survivorRank: 2 });
      expect(result.value.players[1]).toMatchObject({ survivorRank: 1 });
      expect("survivorRank" in result.value.players[2]).toBe(false);
    }
  });

  it("rejects survivorRank on an eliminated player", () => {
    const result = parseOutcome({
      kind: "last-standing",
      players: [
        { userId: "u1", displayName: "Alice", survivorRank: 1 },
        { userId: "u2", displayName: "Bob", eliminationOrder: 0, survivorRank: 2 },
      ],
    });
    expect(result).toEqual({
      ok: false,
      error: "players[1]: survivorRank is only allowed on survivors",
    });
  });

  it("rejects duplicate survivorRank values", () => {
    const result = parseOutcome({
      kind: "last-standing",
      players: [
        { userId: "u1", displayName: "Alice", survivorRank: 1 },
        { userId: "u2", displayName: "Bob", survivorRank: 1 },
      ],
    });
    expect(result).toEqual({
      ok: false,
      error: "last-standing: survivorRank values must be unique",
    });
  });

  it("rejects a survivorRank below 1", () => {
    const result = parseOutcome({
      kind: "last-standing",
      players: [
        { userId: "u1", displayName: "Alice", survivorRank: 0 },
        { userId: "u2", displayName: "Bob", eliminationOrder: 0 },
      ],
    });
    expect(result).toEqual({ ok: false, error: "players[0]: invalid survivorRank" });
  });
});

describe("parseOutcome — coop score (Just One)", () => {
  it("accepts a scored co-op with no win/loss and preserves the score", () => {
    const result = parseOutcome({
      kind: "coop",
      participants: [
        { userId: "u1", displayName: "Alice" },
        { userId: "u2", displayName: "Bob" },
      ],
      score: 11,
    });
    expect(result.ok).toBe(true);
    if (result.ok && result.value.kind === "coop") {
      expect(result.value.score).toBe(11);
      expect("outcome" in result.value).toBe(false);
    }
  });

  it("still accepts a binary win/loss co-op", () => {
    const result = parseOutcome({
      kind: "coop",
      participants: [{ userId: "u1", displayName: "Alice" }],
      outcome: "win",
    });
    expect(result.ok).toBe(true);
    if (result.ok && result.value.kind === "coop") {
      expect(result.value.outcome).toBe("win");
      expect("score" in result.value).toBe(false);
    }
  });

  it("rejects a co-op with neither outcome nor score", () => {
    expect(
      parseOutcome({ kind: "coop", participants: [{ userId: "u1", displayName: "Alice" }] }).ok,
    ).toBe(false);
  });

  it("rejects an out-of-range score", () => {
    expect(
      parseOutcome({
        kind: "coop",
        participants: [{ userId: "u1", displayName: "Alice" }],
        score: -3,
      }).ok,
    ).toBe(false);
  });
});

describe("parseOutcome — D&D co-op (campaign + condition)", () => {
  it("accepts an unresolved session: a campaign name, no outcome", () => {
    const result = parseOutcome({
      kind: "coop",
      campaign: "Curse of Strahd",
      participants: [{ userId: "u1", displayName: "Alice" }],
    });
    expect(result.ok).toBe(true);
    if (result.ok && result.value.kind === "coop") {
      expect(result.value.campaign).toBe("Curse of Strahd");
      expect("outcome" in result.value).toBe(false);
    }
  });

  it("preserves per-player condition and drops it when absent", () => {
    const result = parseOutcome({
      kind: "coop",
      campaign: "The Wild Beyond",
      outcome: "loss",
      participants: [
        { userId: "u1", displayName: "Alice", condition: "dead" },
        { userId: "u2", displayName: "Bob" },
      ],
    });
    expect(result.ok).toBe(true);
    if (result.ok && result.value.kind === "coop") {
      expect(result.value.participants[0].condition).toBe("dead");
      expect("condition" in result.value.participants[1]).toBe(false);
    }
  });

  it("rejects an unknown condition value", () => {
    expect(
      parseOutcome({
        kind: "coop",
        campaign: "x",
        participants: [{ userId: "u1", displayName: "Alice", condition: "stunned" }],
      }).ok,
    ).toBe(false);
  });

  it("parses the Dungeon Master (moderator) and keeps them out of the party", () => {
    const result = parseOutcome({
      kind: "coop",
      campaign: "Curse of Strahd",
      participants: [{ userId: "u1", displayName: "Alice" }],
      moderator: { userId: "u2", displayName: "Bob" },
    });
    expect(result.ok).toBe(true);
    if (result.ok && result.value.kind === "coop") {
      expect(result.value.moderator?.userId).toBe("u2");
      expect(result.value.participants).toHaveLength(1);
    }
  });

  it("collectUserIds includes the DM so their name refreshes", () => {
    const outcome = parseOutcome({
      kind: "coop",
      campaign: "x",
      participants: [{ userId: "u1", displayName: "Alice" }],
      moderator: { userId: "u2", displayName: "Bob" },
    });
    if (outcome.ok) {
      expect(collectUserIds(outcome.value)).toEqual(new Set(["u1", "u2"]));
    }
  });

  it("refreshDisplayNames preserves per-player condition and updates the DM name", () => {
    const parsed = parseOutcome({
      kind: "coop",
      campaign: "x",
      outcome: "loss",
      participants: [{ userId: "u1", displayName: "old", condition: "dead" }],
      moderator: { userId: "u2", displayName: "old" },
    });
    if (!parsed.ok) throw new Error("expected ok");
    const refreshed = refreshDisplayNames(
      parsed.value,
      new Map([
        ["u1", "Alice"],
        ["u2", "Bob"],
      ]),
    );
    if (refreshed.kind === "coop") {
      // Regression: the condition must survive the name-refresh round-trip.
      expect(refreshed.participants[0].condition).toBe("dead");
      expect(refreshed.participants[0].displayName).toBe("Alice");
      expect(refreshed.moderator?.displayName).toBe("Bob");
    }
  });
});

describe("parseOutcome — Decrypto token rounds", () => {
  const teams = [
    { members: [{ userId: "u1", displayName: "Mantas" }] },
    { members: [{ userId: "u2", displayName: "Aydan" }] },
  ];
  const round = (wi: boolean, wm: boolean, bi: boolean, bm: boolean) => ({
    interception: [wi, bi],
    miscommunication: [wm, bm],
  });
  const blackWins = [round(false, true, false, false), round(false, true, false, false)];

  it("round-trips a coherent token record", () => {
    const result = parseOutcome({
      kind: "teams",
      teams,
      winnerTeamIndices: [1],
      decryptoRounds: blackWins,
    });
    expect(result.ok).toBe(true);
    if (result.ok && result.value.kind === "teams") {
      expect(result.value.decryptoRounds).toEqual(blackWins);
      expect(result.value.decryptoTiebreak).toBeUndefined();
    }
  });

  it("rejects a winner that contradicts the tokens", () => {
    const result = parseOutcome({
      kind: "teams",
      teams,
      winnerTeamIndices: [0],
      decryptoRounds: blackWins,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("doesn't match");
  });

  it("preserves a shared-victory tiebreak and rejects malformed rounds", () => {
    const tied = [round(false, true, false, true), round(false, true, false, true)];
    const shared = parseOutcome({
      kind: "teams",
      teams,
      winnerTeamIndices: [0, 1],
      decryptoRounds: tied,
      decryptoTiebreak: "shared",
    });
    expect(shared.ok).toBe(true);
    if (shared.ok && shared.value.kind === "teams") {
      expect(shared.value.decryptoTiebreak).toBe("shared");
    }

    const bad = parseOutcome({
      kind: "teams",
      teams,
      winnerTeamIndices: [0],
      decryptoRounds: [{ interception: [true], miscommunication: [false, false] }],
    });
    expect(bad.ok).toBe(false);
  });

  it("plain teams outcomes are untouched by the decrypto gate", () => {
    const result = parseOutcome({ kind: "teams", teams, winnerTeamIndices: [0] });
    expect(result.ok).toBe(true);
    if (result.ok && result.value.kind === "teams") {
      expect("decryptoRounds" in result.value).toBe(false);
    }
  });
});
