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
