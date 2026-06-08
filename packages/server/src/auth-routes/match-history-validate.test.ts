import { describe, expect, it } from "vitest";
import { parseOutcome } from "./match-history-validate.ts";

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
