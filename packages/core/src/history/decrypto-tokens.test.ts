import { describe, expect, it } from "vitest";
import {
  type DecryptoTokenRound,
  deriveDecryptoOutcome,
  describeDecryptoRecordError,
} from "./decrypto-tokens";

// Shorthand: r(whiteIntercept, whiteMiscomm, blackIntercept, blackMiscomm)
function r(wi: boolean, wm: boolean, bi: boolean, bm: boolean): DecryptoTokenRound {
  return { interception: [wi, bi], miscommunication: [wm, bm] };
}
const quiet = r(false, false, false, false);

describe("deriveDecryptoOutcome", () => {
  it("two interceptions win", () => {
    const d = deriveDecryptoOutcome([
      quiet,
      r(true, false, false, false),
      r(true, false, false, false),
    ]);
    expect(d).toMatchObject({
      status: "decided",
      winners: [0],
      reason: "interceptions",
      rounds: 3,
    });
  });

  it("two miscommunications lose", () => {
    const d = deriveDecryptoOutcome([r(false, true, false, false), r(false, true, false, false)]);
    expect(d).toMatchObject({
      status: "decided",
      winners: [1],
      reason: "miscommunications",
      rounds: 2,
    });
  });

  it("simultaneous thresholds fall to points", () => {
    // Both teams intercept in rounds 2 and 3; White also miscommunicated once.
    const d = deriveDecryptoOutcome([
      r(false, true, false, false),
      r(true, false, true, false),
      r(true, false, true, false),
    ]);
    expect(d).toMatchObject({ status: "decided", winners: [1], reason: "points" });
  });

  it("a points tie asks for the keyword-guess tiebreaker, then resolves it", () => {
    const tied: DecryptoTokenRound[] = [r(false, true, false, true), r(false, true, false, true)];
    expect(deriveDecryptoOutcome(tied)).toMatchObject({ status: "needs-tiebreak" });
    expect(deriveDecryptoOutcome(tied, 0)).toMatchObject({
      status: "decided",
      winners: [0],
      reason: "tiebreak",
    });
    expect(deriveDecryptoOutcome(tied, "shared")).toMatchObject({ winners: [0, 1] });
  });

  it("round-8 hard stop decides on points", () => {
    const rounds = [quiet, r(true, false, false, false), ...Array(6).fill(quiet)];
    const d = deriveDecryptoOutcome(rounds);
    expect(d).toMatchObject({ status: "decided", winners: [0], reason: "points", rounds: 8 });
  });

  it("rejects rounds recorded after the game ended", () => {
    const d = deriveDecryptoOutcome([
      r(false, true, false, false),
      r(false, true, false, false),
      quiet,
    ]);
    expect(d).toMatchObject({ status: "invalid" });
  });

  it("rejects interceptions in round 1 and more than 8 rounds", () => {
    expect(deriveDecryptoOutcome([r(true, false, false, false)])).toMatchObject({
      status: "invalid",
    });
    expect(deriveDecryptoOutcome(Array(9).fill(quiet))).toMatchObject({ status: "invalid" });
  });

  it("is unfinished with no rounds or no decision", () => {
    expect(deriveDecryptoOutcome([])).toMatchObject({ status: "unfinished" });
    expect(deriveDecryptoOutcome([quiet, quiet])).toMatchObject({ status: "unfinished" });
  });
});

describe("describeDecryptoRecordError", () => {
  const teams = [{}, {}];
  const win: DecryptoTokenRound[] = [r(false, true, false, false), r(false, true, false, false)];

  it("accepts a coherent record and ignores non-decrypto outcomes", () => {
    expect(
      describeDecryptoRecordError({ teams, winnerTeamIndices: [1], decryptoRounds: win }),
    ).toBeNull();
    expect(describeDecryptoRecordError({ teams, winnerTeamIndices: [0] })).toBeNull();
  });

  it("rejects a winner that contradicts the tokens", () => {
    expect(
      describeDecryptoRecordError({ teams, winnerTeamIndices: [0], decryptoRounds: win }),
    ).toContain("doesn't match");
  });

  it("demands the tiebreak exactly when needed", () => {
    const tied: DecryptoTokenRound[] = [r(false, true, false, true), r(false, true, false, true)];
    expect(
      describeDecryptoRecordError({ teams, winnerTeamIndices: [0], decryptoRounds: tied }),
    ).toContain("tiebreak");
    expect(
      describeDecryptoRecordError({
        teams,
        winnerTeamIndices: [0, 1],
        decryptoRounds: tied,
        decryptoTiebreak: "shared",
      }),
    ).toBeNull();
    expect(
      describeDecryptoRecordError({
        teams,
        winnerTeamIndices: [1],
        decryptoRounds: win,
        decryptoTiebreak: 1,
      }),
    ).toContain("remove the tiebreak");
  });

  it("requires exactly two teams and rounds for a tiebreak answer", () => {
    expect(
      describeDecryptoRecordError({
        teams: [{}, {}, {}],
        winnerTeamIndices: [0],
        decryptoRounds: win,
      }),
    ).toContain("two teams");
    expect(
      describeDecryptoRecordError({ teams, winnerTeamIndices: [0], decryptoTiebreak: 0 }),
    ).toContain("token record");
  });
});
