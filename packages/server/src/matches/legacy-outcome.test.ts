import { seatResult } from "@boardgames/core/machines/outcome";
import { describe, expect, it } from "vitest";
import { legacyOutcome } from "./legacy-outcome.ts";

const row = (gameSlug: string, winner: string | null, playerCount: number | null = 2) => ({
  gameSlug,
  winner,
  playerCount,
  scores: null,
});

describe("legacyOutcome", () => {
  it("reads a head-to-head winner seat", () => {
    const o = legacyOutcome(row("lost-cities", "p1"));
    expect(seatResult(o, 0)).toBe("loss");
    expect(seatResult(o, 1)).toBe("win");
  });

  it("crowns N-player winners at any seat and keeps a draw a draw", () => {
    expect(seatResult(legacyOutcome(row("senso-battle-for-japan", "p3", 4)), 3)).toBe("win");
    expect(seatResult(legacyOutcome(row("the-hunger", "draw", 3)), 0)).toBe("draw");
  });

  it("reads Durak's stored seat as the loser, not the winner", () => {
    const o = legacyOutcome(row("durak", "p0", 3));
    expect(seatResult(o, 0)).toBe("loss");
    expect(seatResult(o, 1)).toBe("win");
    expect(seatResult(o, 2)).toBe("win");
  });

  it("reads co-op rows as a team result", () => {
    expect(legacyOutcome(row("sky-team", "p0"))).toEqual({ kind: "coop", won: true });
    expect(legacyOutcome(row("quiztopia", "p1", 1))).toEqual({ kind: "coop", won: false });
    expect(legacyOutcome(row("pandemic", "draw", 4))).toEqual({ kind: "coop", won: false });
  });

  it("reads Decrypto's stored team", () => {
    const o = legacyOutcome(row("decrypto", "p1", 4));
    expect(o).toEqual({ kind: "teams", teamOf: [0, 0, 1, 1], winningTeam: 1 });
    expect(seatResult(o, 2)).toBe("win");
    expect(seatResult(legacyOutcome(row("decrypto", "draw", 3)), 0)).toBe("draw");
  });

  it("keeps recorded scores when they match the table size", () => {
    const o = legacyOutcome({
      gameSlug: "senso-battle-for-japan",
      winner: "p0",
      playerCount: 2,
      scores: [9, 4],
    });
    expect(o).toEqual({ kind: "ranked", placements: [1, 2], scores: [9, 4] });
  });
});
