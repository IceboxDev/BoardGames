import { describe, expect, it } from "vitest";
import { outcomeHeadline } from "./outcome-headline";

describe("outcomeHeadline", () => {
  it("names the winner and loser of a duel", () => {
    const duel = { kind: "ranked", placements: [2, 1] } as const;
    expect(outcomeHeadline(duel, 1)).toEqual({ headline: "You win!", color: "win" });
    expect(outcomeHeadline(duel, 0)).toEqual({ headline: "You lose", color: "lose" });
  });

  it("gives the place at a bigger table, and a shared first place", () => {
    const table = { kind: "ranked", placements: [1, 3, 1, 4] } as const;
    expect(outcomeHeadline(table, 1).headline).toBe("You finished 3rd");
    expect(outcomeHeadline(table, 0).headline).toBe("You tie for first!");
  });

  it("reads draws, teams and co-op games", () => {
    expect(outcomeHeadline({ kind: "ranked", placements: [1, 1] }, 0).headline).toBe("Draw!");
    const teams = { kind: "teams", teamOf: [0, 0, 1, 1], winningTeam: 1 } as const;
    expect(outcomeHeadline(teams, 3).headline).toBe("Your team wins!");
    expect(outcomeHeadline(teams, 0).headline).toBe("Your team lost");
    expect(outcomeHeadline({ kind: "coop", won: false }, 0)).toEqual({
      headline: "Defeat",
      color: "lose",
    });
  });

  it("falls back to a neutral line before any outcome", () => {
    expect(outcomeHeadline(null, 0)).toEqual({ headline: "Game over", color: "neutral" });
  });
});
