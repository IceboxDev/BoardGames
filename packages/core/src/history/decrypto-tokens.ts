// Decrypto's manual match recording works in the game's own currency: per
// round, each team can earn a WHITE interception token (they cracked the
// enemy code) and/or a BLACK miscommunication token (they misread their own).
// The winner is never entered by hand — it falls out of the token walk exactly
// as at the table: first team to 2 interceptions wins, 2 miscommunications
// loses, simultaneous thresholds go to the points tiebreak (interceptions
// minus miscommunications), and only a points TIE reaches the keyword-guess
// tiebreaker, which is the one thing the recorder must answer.
//
// Shared between the web form, the client-side outcome validation, the core
// wire-schema superRefine, and the server's outcome allowlist, so all four
// agree on what a legal token history is.

export const DECRYPTO_RECORD_MAX_ROUNDS = 8;
const TOKENS_TO_END = 2;

/** Tokens earned in one round, indexed by team (0 = White, 1 = Black). */
export interface DecryptoTokenRound {
  interception: [boolean, boolean];
  miscommunication: [boolean, boolean];
}

/** Winner of the keyword-guess tiebreaker (team index), or a shared victory. */
export type DecryptoTiebreak = 0 | 1 | "shared";

export type DecryptoDerivation =
  | { status: "unfinished"; reason: string }
  | { status: "invalid"; reason: string }
  | { status: "needs-tiebreak"; points: [number, number] }
  | {
      status: "decided";
      /** Winning team indices; [0, 1] = shared victory. */
      winners: number[];
      points: [number, number];
      reason: "interceptions" | "miscommunications" | "points" | "tiebreak";
      rounds: number;
    };

export function deriveDecryptoOutcome(
  rounds: readonly DecryptoTokenRound[],
  tiebreak?: DecryptoTiebreak,
): DecryptoDerivation {
  if (rounds.length === 0) {
    return { status: "unfinished", reason: "record at least one round of tokens" };
  }
  if (rounds.length > DECRYPTO_RECORD_MAX_ROUNDS) {
    return { status: "invalid", reason: `Decrypto ends after round ${DECRYPTO_RECORD_MAX_ROUNDS}` };
  }
  if (rounds[0]?.interception.some(Boolean)) {
    return { status: "invalid", reason: "round 1 has no interception attempts" };
  }

  const interceptions: [number, number] = [0, 0];
  const miscommunications: [number, number] = [0, 0];

  for (let r = 0; r < rounds.length; r++) {
    const round = rounds[r] as DecryptoTokenRound;
    for (const team of [0, 1] as const) {
      if (round.interception[team]) interceptions[team] += 1;
      if (round.miscommunication[team]) miscommunications[team] += 1;
    }

    const points: [number, number] = [
      interceptions[0] - miscommunications[0],
      interceptions[1] - miscommunications[1],
    ];
    const won = [interceptions[0] >= TOKENS_TO_END, interceptions[1] >= TOKENS_TO_END];
    const lost = [miscommunications[0] >= TOKENS_TO_END, miscommunications[1] >= TOKENS_TO_END];
    const ambiguous =
      (won[0] && lost[0]) || (won[1] && lost[1]) || (won[0] && won[1]) || (lost[0] && lost[1]);
    const lastAllowed = r === DECRYPTO_RECORD_MAX_ROUNDS - 1;

    let decided: DecryptoDerivation | null = null;
    if (!ambiguous && (won[0] || lost[1])) {
      decided = {
        status: "decided",
        winners: [0],
        points,
        reason: won[0] ? "interceptions" : "miscommunications",
        rounds: r + 1,
      };
    } else if (!ambiguous && (won[1] || lost[0])) {
      decided = {
        status: "decided",
        winners: [1],
        points,
        reason: won[1] ? "interceptions" : "miscommunications",
        rounds: r + 1,
      };
    } else if (ambiguous || lastAllowed) {
      // Simultaneous thresholds, or the round-8 hard stop: points decide;
      // a points tie goes to the keyword-guess tiebreaker.
      if (points[0] !== points[1]) {
        decided = {
          status: "decided",
          winners: [points[0] > points[1] ? 0 : 1],
          points,
          reason: "points",
          rounds: r + 1,
        };
      } else if (tiebreak !== undefined) {
        decided = {
          status: "decided",
          winners: tiebreak === "shared" ? [0, 1] : [tiebreak],
          points,
          reason: "tiebreak",
          rounds: r + 1,
        };
      } else {
        decided = { status: "needs-tiebreak", points };
      }
    }

    if (decided) {
      if (r < rounds.length - 1) {
        return {
          status: "invalid",
          reason: `the game ended in round ${r + 1} — remove the later rounds`,
        };
      }
      return decided;
    }
  }

  return {
    status: "unfinished",
    reason: "no side has finished yet — record the remaining rounds",
  };
}

/**
 * Full consistency check for a recorded teams outcome carrying a token
 * history. Returns a human-readable problem, or null when the record is
 * coherent. `tiebreak` must be present exactly when the walk needs it, and
 * `winnerTeamIndices` must match what the tokens derive.
 */
export function describeDecryptoRecordError(outcome: {
  teams: readonly unknown[];
  winnerTeamIndices: readonly number[];
  decryptoRounds?: readonly DecryptoTokenRound[];
  decryptoTiebreak?: DecryptoTiebreak;
}): string | null {
  const rounds = outcome.decryptoRounds;
  if (!rounds) {
    return outcome.decryptoTiebreak !== undefined
      ? "a tiebreak answer needs a round-by-round token record"
      : null;
  }
  if (outcome.teams.length !== 2) return "Decrypto is recorded as exactly two teams";

  const derived = deriveDecryptoOutcome(rounds, outcome.decryptoTiebreak);
  if (derived.status === "unfinished" || derived.status === "invalid") return derived.reason;
  if (derived.status === "needs-tiebreak") {
    return "points are tied — pick the keyword-guess tiebreaker result";
  }
  if (derived.reason !== "tiebreak" && outcome.decryptoTiebreak !== undefined) {
    return "the tokens already decide this game — remove the tiebreak answer";
  }
  const recorded = [...outcome.winnerTeamIndices].sort().join(",");
  const expected = [...derived.winners].sort().join(",");
  if (recorded !== expected) {
    return "the winner doesn't match the recorded tokens";
  }
  return null;
}
