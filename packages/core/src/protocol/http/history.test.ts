import { describe, expect, it } from "vitest";
import {
  AdminLastPlayedResponseSchema,
  HistoryListQuerySchema,
  HistoryListResponseSchema,
  MatchCreateInputSchema,
  MatchOutcomeSchema,
  MatchRecordSchema,
  MatchReorderInputSchema,
} from "./history.ts";

const sampleParticipant = (id: string, name: string) => ({
  userId: id,
  displayName: name,
});

const sampleFreeForAll = {
  kind: "free-for-all",
  players: [
    { ...sampleParticipant("u1", "Alice"), score: 42 },
    { ...sampleParticipant("u2", "Bob"), score: 30, rank: 2 },
  ],
} as const;

const sampleTeams = {
  kind: "teams",
  teams: [
    { members: [sampleParticipant("u1", "Alice")], score: 5 },
    { members: [sampleParticipant("u2", "Bob"), sampleParticipant("u3", "Carol")], score: 3 },
  ],
  winnerTeamIndices: [0],
} as const;

const sampleLastStanding = {
  kind: "last-standing",
  players: [
    { ...sampleParticipant("u1", "Alice") },
    { ...sampleParticipant("u2", "Bob"), eliminationOrder: 0 },
  ],
} as const;

const sampleCoop = {
  kind: "coop",
  participants: [sampleParticipant("u1", "Alice"), sampleParticipant("u2", "Bob")],
  outcome: "win",
} as const;

const sampleOneVsMany = {
  kind: "one-vs-many",
  solo: { ...sampleParticipant("u1", "Alice"), roleLabel: "Hunter" },
  team: { members: [sampleParticipant("u2", "Bob")], roleLabel: "Hunted" },
  winnerSide: "solo",
} as const;

describe("MatchOutcomeSchema", () => {
  it("accepts every valid outcome variant", () => {
    expect(() => MatchOutcomeSchema.parse(sampleFreeForAll)).not.toThrow();
    expect(() => MatchOutcomeSchema.parse(sampleTeams)).not.toThrow();
    expect(() => MatchOutcomeSchema.parse(sampleLastStanding)).not.toThrow();
    expect(() => MatchOutcomeSchema.parse(sampleCoop)).not.toThrow();
    expect(() => MatchOutcomeSchema.parse(sampleOneVsMany)).not.toThrow();
  });

  it("rejects an unknown discriminator", () => {
    expect(() => MatchOutcomeSchema.parse({ kind: "duel", players: [] })).toThrow();
  });

  it("rejects free-for-all with a single player", () => {
    expect(() =>
      MatchOutcomeSchema.parse({
        kind: "free-for-all",
        players: [{ ...sampleParticipant("u1", "Alice"), score: 1 }],
      }),
    ).toThrow();
  });

  it("keeps the optional per-player role label (Villainous villain) when present", () => {
    const parsed = MatchOutcomeSchema.parse({
      kind: "free-for-all",
      scenario: "The Worst Takes It All",
      players: [
        { ...sampleParticipant("u1", "Alice"), score: 0, rank: 1, role: "Maleficent" },
        { ...sampleParticipant("u2", "Bob"), score: 0, role: "Jafar" },
      ],
    });
    expect(parsed.kind).toBe("free-for-all");
    if (parsed.kind === "free-for-all") {
      expect(parsed.players[0].role).toBe("Maleficent");
      expect(parsed.players[0].rank).toBe(1);
      expect(parsed.players[1].role).toBe("Jafar");
      expect(parsed.scenario).toBe("The Worst Takes It All");
    }
  });

  // ── Win/draw/loss duels (chess, Connect 4) ────────────────────────────

  it("accepts a drawn duel — draw: true, no ranks, zero scores", () => {
    const parsed = MatchOutcomeSchema.parse({
      kind: "free-for-all",
      draw: true,
      players: [
        { ...sampleParticipant("u1", "Alice"), score: 0 },
        { ...sampleParticipant("u2", "Bob"), score: 0 },
      ],
    });
    expect(parsed.kind).toBe("free-for-all");
    if (parsed.kind === "free-for-all") expect(parsed.draw).toBe(true);
  });

  it("rejects a drawn duel with a ranked winner", () => {
    const bad = () =>
      MatchOutcomeSchema.parse({
        kind: "free-for-all",
        draw: true,
        players: [
          { ...sampleParticipant("u1", "Alice"), score: 0, rank: 1 },
          { ...sampleParticipant("u2", "Bob"), score: 0 },
        ],
      });
    expect(bad).toThrow(/drawn match cannot have a ranked winner/);
  });

  it("rejects draw: false — the flag is literal true or absent", () => {
    expect(() =>
      MatchOutcomeSchema.parse({
        kind: "free-for-all",
        draw: false,
        players: [
          { ...sampleParticipant("u1", "Alice"), score: 0 },
          { ...sampleParticipant("u2", "Bob"), score: 0 },
        ],
      }),
    ).toThrow();
  });

  it("rejects a free-for-all role longer than 64 chars", () => {
    expect(() =>
      MatchOutcomeSchema.parse({
        kind: "free-for-all",
        players: [
          { ...sampleParticipant("u1", "Alice"), score: 0, role: "x".repeat(65) },
          { ...sampleParticipant("u2", "Bob"), score: 0 },
        ],
      }),
    ).toThrow();
  });

  // ── Best-of-three round records (Jaipur) ──────────────────────────────

  // A comes back 2–1 on seals despite the lower rupee total — the exact case
  // the round record exists for. Rank carries the match result.
  const jaipurRounds = {
    kind: "free-for-all",
    scenario: "Standard",
    players: [
      { ...sampleParticipant("u1", "Alice"), score: 97, rank: 1, roundScores: [52, 10, 35] },
      { ...sampleParticipant("u2", "Bob"), score: 110, rank: 2, roundScores: [48, 60, 2] },
    ],
  } as const;

  it("accepts a best-of-three round record — seal winner ranked 1 over a higher total", () => {
    const parsed = MatchOutcomeSchema.parse(jaipurRounds);
    expect(parsed.kind).toBe("free-for-all");
    if (parsed.kind === "free-for-all") {
      expect(parsed.players[0].roundScores).toEqual([52, 10, 35]);
      expect(parsed.players[0].rank).toBe(1);
    }
  });

  it("accepts a two-round sweep", () => {
    const swept = {
      ...jaipurRounds,
      players: [
        { ...sampleParticipant("u1", "Alice"), score: 100, rank: 1, roundScores: [52, 48] },
        { ...sampleParticipant("u2", "Bob"), score: 88, rank: 2, roundScores: [48, 40] },
      ],
    };
    expect(() => MatchOutcomeSchema.parse(swept)).not.toThrow();
  });

  it("accepts a rupee-tied round settled by the rulebook tiebreak (bonus, then goods tokens)", () => {
    const byBonus = MatchOutcomeSchema.parse({
      ...jaipurRounds,
      players: [
        { ...sampleParticipant("u1", "Alice"), score: 90, rank: 1, roundScores: [50, 10, 30] },
        { ...sampleParticipant("u2", "Bob"), score: 112, rank: 2, roundScores: [50, 60, 2] },
      ],
      roundTiebreaks: [{ round: 0, bonusTokens: [3, 1] }],
    });
    if (byBonus.kind === "free-for-all") {
      expect(byBonus.roundTiebreaks).toEqual([{ round: 0, bonusTokens: [3, 1] }]);
    }
    const byGoods = {
      ...jaipurRounds,
      players: [
        { ...sampleParticipant("u1", "Alice"), score: 90, rank: 2, roundScores: [50, 10, 30] },
        { ...sampleParticipant("u2", "Bob"), score: 112, rank: 1, roundScores: [50, 60, 2] },
      ],
      roundTiebreaks: [{ round: 0, bonusTokens: [2, 2], goodsTokens: [4, 7] }],
    };
    expect(() => MatchOutcomeSchema.parse(byGoods)).not.toThrow();
  });

  it("rejects a tied round with no tiebreak, and a tiebreak that doesn't settle it", () => {
    const tiedPlayers = [
      { ...sampleParticipant("u1", "Alice"), score: 90, roundScores: [50, 10, 30] },
      { ...sampleParticipant("u2", "Bob"), score: 112, roundScores: [50, 60, 2] },
    ];
    expect(() => MatchOutcomeSchema.parse({ ...jaipurRounds, players: tiedPlayers })).toThrow(
      /round 1 is tied — record its bonus tokens/,
    );
    expect(() =>
      MatchOutcomeSchema.parse({
        ...jaipurRounds,
        players: tiedPlayers,
        roundTiebreaks: [{ round: 0, bonusTokens: [2, 2] }],
      }),
    ).toThrow(/bonus tokens are tied — record its goods tokens/);
  });

  it("rejects malformed tiebreaks — stale round, negative tokens, misaligned arrays", () => {
    expect(() =>
      MatchOutcomeSchema.parse({
        ...jaipurRounds,
        roundTiebreaks: [{ round: 0, bonusTokens: [3, 1] }],
      }),
    ).toThrow(/isn't tied — remove its tiebreak/);
    const tiedPlayers = [
      { ...sampleParticipant("u1", "Alice"), score: 90, rank: 1, roundScores: [50, 10, 30] },
      { ...sampleParticipant("u2", "Bob"), score: 112, rank: 2, roundScores: [50, 60, 2] },
    ];
    expect(() =>
      MatchOutcomeSchema.parse({
        ...jaipurRounds,
        players: tiedPlayers,
        roundTiebreaks: [{ round: 0, bonusTokens: [-1, 1] }],
      }),
    ).toThrow();
    expect(() =>
      MatchOutcomeSchema.parse({
        ...jaipurRounds,
        players: tiedPlayers,
        roundTiebreaks: [{ round: 0, bonusTokens: [3, 1, 2] }],
      }),
    ).toThrow(/must cover every player/);
  });

  it("rejects a crowned winner who doesn't hold the most round wins", () => {
    const bad = {
      ...jaipurRounds,
      players: [
        { ...sampleParticipant("u1", "Alice"), score: 97, rank: 2, roundScores: [52, 10, 35] },
        { ...sampleParticipant("u2", "Bob"), score: 110, rank: 1, roundScores: [48, 60, 2] },
      ],
    };
    expect(() => MatchOutcomeSchema.parse(bad)).toThrow(/doesn't match the recorded round scores/);
  });

  it("rejects a total that isn't the sum of that player's rounds", () => {
    const bad = {
      ...jaipurRounds,
      players: [
        { ...sampleParticipant("u1", "Alice"), score: 98, rank: 1, roundScores: [52, 10, 35] },
        { ...sampleParticipant("u2", "Bob"), score: 110, rank: 2, roundScores: [48, 60, 2] },
      ],
    };
    expect(() => MatchOutcomeSchema.parse(bad)).toThrow(/sum of that player's round scores/);
  });

  it("rejects round records missing on one player or of unequal length", () => {
    const missing = {
      ...jaipurRounds,
      players: [
        { ...sampleParticipant("u1", "Alice"), score: 97, rank: 1, roundScores: [52, 10, 35] },
        { ...sampleParticipant("u2", "Bob"), score: 110, rank: 2 },
      ],
    };
    expect(() => MatchOutcomeSchema.parse(missing)).toThrow(/round scores recorded/);
    const unequal = {
      ...jaipurRounds,
      players: [
        { ...sampleParticipant("u1", "Alice"), score: 97, rank: 1, roundScores: [52, 10, 35] },
        { ...sampleParticipant("u2", "Bob"), score: 108, rank: 2, roundScores: [48, 60] },
      ],
    };
    expect(() => MatchOutcomeSchema.parse(unequal)).toThrow(/same number of rounds/);
  });

  it("rejects an unplaced round-scored match and out-of-bounds round counts", () => {
    const unranked = {
      ...jaipurRounds,
      players: [
        { ...sampleParticipant("u1", "Alice"), score: 97, roundScores: [52, 10, 35] },
        { ...sampleParticipant("u2", "Bob"), score: 110, roundScores: [48, 60, 2] },
      ],
    };
    expect(() => MatchOutcomeSchema.parse(unranked)).toThrow(/every player placed/);
    const oneRound = {
      ...jaipurRounds,
      players: [
        { ...sampleParticipant("u1", "Alice"), score: 52, rank: 1, roundScores: [52] },
        { ...sampleParticipant("u2", "Bob"), score: 48, rank: 2, roundScores: [48] },
      ],
    };
    expect(() => MatchOutcomeSchema.parse(oneRound)).toThrow();
    const fourRounds = {
      ...jaipurRounds,
      players: [
        { ...sampleParticipant("u1", "Alice"), score: 4, rank: 1, roundScores: [1, 1, 1, 1] },
        { ...sampleParticipant("u2", "Bob"), score: 0, rank: 2, roundScores: [0, 0, 0, 0] },
      ],
    };
    expect(() => MatchOutcomeSchema.parse(fourRounds)).toThrow();
  });

  // ── D&D co-op (campaign + resolution + per-player condition) ──────────

  it("accepts an UNRESOLVED D&D session — a campaign name in lieu of an outcome", () => {
    const parsed = MatchOutcomeSchema.parse({
      kind: "coop",
      campaign: "Curse of Strahd",
      participants: [sampleParticipant("u1", "Alice"), sampleParticipant("u2", "Bob")],
    });
    expect(parsed.kind).toBe("coop");
    if (parsed.kind === "coop") {
      expect(parsed.campaign).toBe("Curse of Strahd");
      expect(parsed.outcome).toBeUndefined();
    }
  });

  it("accepts an unresolved session stamped with its campaign's eventual result", () => {
    const parsed = MatchOutcomeSchema.parse({
      kind: "coop",
      campaign: "Curse of Strahd",
      campaignResult: "win",
      participants: [sampleParticipant("u1", "Alice")],
    });
    expect(parsed.kind === "coop" && parsed.campaignResult).toBe("win");
  });

  it("rejects an invalid campaignResult value", () => {
    const result = MatchOutcomeSchema.safeParse({
      kind: "coop",
      campaign: "Curse of Strahd",
      campaignResult: "draw",
      participants: [sampleParticipant("u1", "Alice")],
    });
    expect(result.success).toBe(false);
  });

  it("accepts a RESOLVED D&D session with a campaign and a win", () => {
    const parsed = MatchOutcomeSchema.parse({
      kind: "coop",
      campaign: "Curse of Strahd",
      outcome: "win",
      participants: [sampleParticipant("u1", "Alice")],
    });
    expect(parsed.kind === "coop" && parsed.outcome).toBe("win");
  });

  it("keeps per-player condition (unconscious / dead)", () => {
    const parsed = MatchOutcomeSchema.parse({
      kind: "coop",
      campaign: "The Wild Beyond",
      participants: [
        { ...sampleParticipant("u1", "Alice"), condition: "dead" },
        { ...sampleParticipant("u2", "Bob"), condition: "unconscious" },
        sampleParticipant("u3", "Cara"),
      ],
    });
    if (parsed.kind === "coop") {
      expect(parsed.participants[0].condition).toBe("dead");
      expect(parsed.participants[1].condition).toBe("unconscious");
      expect(parsed.participants[2].condition).toBeUndefined();
    }
  });

  it("rejects an unknown per-player condition", () => {
    expect(() =>
      MatchOutcomeSchema.parse({
        kind: "coop",
        campaign: "x",
        participants: [{ ...sampleParticipant("u1", "Alice"), condition: "poisoned" }],
      }),
    ).toThrow();
  });

  it("still rejects a co-op with no outcome, no score, and no campaign", () => {
    expect(() =>
      MatchOutcomeSchema.parse({
        kind: "coop",
        participants: [sampleParticipant("u1", "Alice")],
      }),
    ).toThrow();
  });

  it("keeps the D&D Dungeon Master (moderator) separate from the party", () => {
    const parsed = MatchOutcomeSchema.parse({
      kind: "coop",
      campaign: "Curse of Strahd",
      outcome: "win",
      participants: [sampleParticipant("u1", "Alice"), sampleParticipant("u2", "Bob")],
      moderator: sampleParticipant("u3", "Cara"),
    });
    if (parsed.kind === "coop") {
      expect(parsed.participants).toHaveLength(2);
      expect(parsed.moderator?.userId).toBe("u3");
      // The DM is not one of the adventurers.
      expect(parsed.participants.some((p) => p.userId === "u3")).toBe(false);
    }
  });

  it("rejects teams with a winner index out of range", () => {
    expect(() => MatchOutcomeSchema.parse({ ...sampleTeams, winnerTeamIndices: [5] })).toThrow(
      /out of range/,
    );
  });

  it("accepts teams with an optional moderator (Storyteller / Fabled)", () => {
    expect(() =>
      MatchOutcomeSchema.parse({
        ...sampleTeams,
        moderator: { ...sampleParticipant("u9", "Storyteller Sam"), role: "Angel" },
      }),
    ).not.toThrow();
    expect(() =>
      MatchOutcomeSchema.parse({
        ...sampleTeams,
        moderator: sampleParticipant("u9", "Storyteller Sam"),
      }),
    ).not.toThrow();
  });

  it("keeps the optional per-player role label (Dungeon Mayhem hero) on last-standing", () => {
    const parsed = MatchOutcomeSchema.parse({
      kind: "last-standing",
      scenario: "Standard + Monster Madness",
      players: [
        { ...sampleParticipant("u1", "Alice"), role: "Sutha" },
        { ...sampleParticipant("u2", "Bob"), eliminationOrder: 0, role: "Blorp" },
      ],
    });
    expect(parsed.kind).toBe("last-standing");
    if (parsed.kind === "last-standing") {
      expect(parsed.players[0].role).toBe("Sutha");
      expect(parsed.players[1].role).toBe("Blorp");
      expect(parsed.scenario).toBe("Standard + Monster Madness");
    }
  });

  it("rejects a last-standing role longer than 64 chars", () => {
    expect(() =>
      MatchOutcomeSchema.parse({
        kind: "last-standing",
        players: [
          { ...sampleParticipant("u1", "Alice"), role: "x".repeat(65) },
          { ...sampleParticipant("u2", "Bob"), eliminationOrder: 0 },
        ],
      }),
    ).toThrow();
  });

  it("keeps the optional survivorRank (poker chip standings) on surviving players", () => {
    const parsed = MatchOutcomeSchema.parse({
      kind: "last-standing",
      players: [
        { ...sampleParticipant("u1", "Alice"), survivorRank: 2 },
        { ...sampleParticipant("u2", "Bob"), survivorRank: 1 },
        { ...sampleParticipant("u3", "Cara"), eliminationOrder: 0 },
      ],
    });
    expect(parsed.kind).toBe("last-standing");
    if (parsed.kind === "last-standing") {
      expect(parsed.players[0].survivorRank).toBe(2);
      expect(parsed.players[1].survivorRank).toBe(1);
      expect(parsed.players[2].survivorRank).toBeUndefined();
    }
  });

  it("rejects a survivorRank on an eliminated player", () => {
    expect(() =>
      MatchOutcomeSchema.parse({
        kind: "last-standing",
        players: [
          { ...sampleParticipant("u1", "Alice"), survivorRank: 1 },
          { ...sampleParticipant("u2", "Bob"), eliminationOrder: 0, survivorRank: 2 },
        ],
      }),
    ).toThrow(/only allowed on surviving players/);
  });

  it("rejects duplicate survivorRank values", () => {
    expect(() =>
      MatchOutcomeSchema.parse({
        kind: "last-standing",
        players: [
          { ...sampleParticipant("u1", "Alice"), survivorRank: 1 },
          { ...sampleParticipant("u2", "Bob"), survivorRank: 1 },
        ],
      }),
    ).toThrow(/must be unique/);
  });

  it("rejects a survivorRank below 1", () => {
    expect(() =>
      MatchOutcomeSchema.parse({
        kind: "last-standing",
        players: [
          { ...sampleParticipant("u1", "Alice"), survivorRank: 0 },
          { ...sampleParticipant("u2", "Bob"), eliminationOrder: 0 },
        ],
      }),
    ).toThrow();
  });

  it("rejects last-standing with no survivor", () => {
    expect(() =>
      MatchOutcomeSchema.parse({
        kind: "last-standing",
        players: [
          { ...sampleParticipant("u1", "Alice"), eliminationOrder: 0 },
          { ...sampleParticipant("u2", "Bob"), eliminationOrder: 1 },
        ],
      }),
    ).toThrow(/at least one player must survive/);
  });

  it("rejects coop with an unknown outcome", () => {
    expect(() => MatchOutcomeSchema.parse({ ...sampleCoop, outcome: "draw" })).toThrow();
  });

  it("accepts a scored co-op with no win/loss outcome (Just One)", () => {
    const parsed = MatchOutcomeSchema.parse({
      kind: "coop",
      participants: [sampleParticipant("u1", "Alice"), sampleParticipant("u2", "Bob")],
      score: 11,
    });
    expect(parsed.kind).toBe("coop");
    if (parsed.kind === "coop") {
      expect(parsed.score).toBe(11);
      expect(parsed.outcome).toBeUndefined();
    }
  });

  it("rejects a co-op with neither outcome nor score", () => {
    expect(() =>
      MatchOutcomeSchema.parse({
        kind: "coop",
        participants: [sampleParticipant("u1", "Alice")],
      }),
    ).toThrow(/win\/loss outcome or a score/);
  });

  it("rejects a negative or fractional co-op score", () => {
    expect(() =>
      MatchOutcomeSchema.parse({
        kind: "coop",
        participants: [sampleParticipant("u1", "Alice")],
        score: -1,
      }),
    ).toThrow();
    expect(() =>
      MatchOutcomeSchema.parse({
        kind: "coop",
        participants: [sampleParticipant("u1", "Alice")],
        score: 4.5,
      }),
    ).toThrow();
  });
});

describe("MatchRecordSchema", () => {
  const sampleRecord = {
    id: 17,
    dateKey: "2026-05-10",
    playedAt: "2026-05-10T19:30:00.000Z",
    gameSlug: "lost-cities",
    gameTitle: "Lost Cities",
    outcome: sampleFreeForAll,
    notes: null,
    recordedBy: "user-1",
    recordedAt: "2026-05-10 19:35:01",
    updatedAt: null,
    sortOrder: 0,
  };

  it("accepts a fully-populated record", () => {
    expect(() => MatchRecordSchema.parse(sampleRecord)).not.toThrow();
  });

  it("rejects a missing or non-integer sortOrder", () => {
    const { sortOrder: _omit, ...withoutOrder } = sampleRecord;
    expect(() => MatchRecordSchema.parse(withoutOrder)).toThrow();
    expect(() => MatchRecordSchema.parse({ ...sampleRecord, sortOrder: 1.5 })).toThrow();
  });

  it("accepts a record with null dateKey and gameSlug", () => {
    expect(() =>
      MatchRecordSchema.parse({ ...sampleRecord, dateKey: null, gameSlug: null }),
    ).not.toThrow();
  });

  it("accepts the looser playedAt formats the form may produce", () => {
    expect(() =>
      MatchRecordSchema.parse({ ...sampleRecord, playedAt: "2026-05-10T19:30Z" }),
    ).not.toThrow();
    expect(() =>
      MatchRecordSchema.parse({ ...sampleRecord, playedAt: "2026-05-10T19:30:00+02:00" }),
    ).not.toThrow();
  });

  it("rejects a non-ISO playedAt", () => {
    expect(() => MatchRecordSchema.parse({ ...sampleRecord, playedAt: "May 10 7pm" })).toThrow();
  });

  it("rejects a malformed dateKey", () => {
    expect(() => MatchRecordSchema.parse({ ...sampleRecord, dateKey: "May 10" })).toThrow();
  });

  it("rejects a malformed gameSlug", () => {
    expect(() => MatchRecordSchema.parse({ ...sampleRecord, gameSlug: "Lost Cities" })).toThrow();
  });
});

describe("MatchCreateInputSchema", () => {
  it("accepts a minimal create payload", () => {
    expect(() =>
      MatchCreateInputSchema.parse({
        dateKey: null,
        playedAt: "2026-05-10T19:30Z",
        gameSlug: null,
        gameTitle: "Casual party game",
        outcome: sampleCoop,
        notes: null,
      }),
    ).not.toThrow();
  });

  it("rejects an empty gameTitle", () => {
    expect(() =>
      MatchCreateInputSchema.parse({
        dateKey: null,
        playedAt: "2026-05-10T19:30Z",
        gameSlug: null,
        gameTitle: "",
        outcome: sampleCoop,
        notes: null,
      }),
    ).toThrow();
  });
});

describe("AdminLastPlayedResponseSchema", () => {
  it("accepts a userId → dateKey map, empty included", () => {
    expect(() =>
      AdminLastPlayedResponseSchema.parse({
        lastPlayedByUser: { u1: "2026-08-20", u2: "2026-05-15" },
      }),
    ).not.toThrow();
    expect(() => AdminLastPlayedResponseSchema.parse({ lastPlayedByUser: {} })).not.toThrow();
  });

  it("rejects a non-dateKey value and a missing map", () => {
    expect(() =>
      AdminLastPlayedResponseSchema.parse({ lastPlayedByUser: { u1: "2026-08-20T19:00:00Z" } }),
    ).toThrow();
    expect(() => AdminLastPlayedResponseSchema.parse({})).toThrow();
  });
});

describe("MatchReorderInputSchema", () => {
  it("accepts a dateKey with a non-empty ordered id list", () => {
    expect(() =>
      MatchReorderInputSchema.parse({ dateKey: "2026-05-10", orderedIds: [3, 1, 2] }),
    ).not.toThrow();
  });

  it("accepts a null dateKey (standalone day reorder)", () => {
    expect(() =>
      MatchReorderInputSchema.parse({ dateKey: null, orderedIds: [3, 1, 2] }),
    ).not.toThrow();
  });

  it("rejects an empty orderedIds list", () => {
    expect(() =>
      MatchReorderInputSchema.parse({ dateKey: "2026-05-10", orderedIds: [] }),
    ).toThrow();
  });

  it("rejects a malformed dateKey", () => {
    expect(() => MatchReorderInputSchema.parse({ dateKey: "May 10", orderedIds: [1] })).toThrow();
  });

  it("rejects a non-integer id", () => {
    expect(() =>
      MatchReorderInputSchema.parse({ dateKey: "2026-05-10", orderedIds: [1.5] }),
    ).toThrow();
  });
});

describe("HistoryListResponseSchema", () => {
  it("accepts an empty list with null cursor", () => {
    expect(() => HistoryListResponseSchema.parse({ matches: [], nextBefore: null })).not.toThrow();
  });

  it("rejects a missing nextBefore field", () => {
    expect(() => HistoryListResponseSchema.parse({ matches: [] })).toThrow();
  });
});

describe("HistoryListQuerySchema", () => {
  it("coerces the limit query string to a number", () => {
    const parsed = HistoryListQuerySchema.parse({ limit: "25" });
    expect(parsed.limit).toBe(25);
  });

  it("rejects a negative limit", () => {
    expect(() => HistoryListQuerySchema.parse({ limit: "-1" })).toThrow();
  });
});
