// Score-limit races: penalty games played as a series of hands until someone's
// running total hits the game's limit, then the LOWEST total wins. Take 5
// ("bis ein Spieler insgesamt über 66 Hornochsen eingesammelt hat" — strictly
// over 66) and Bandit (ends when someone reaches 100; a hand may score
// negative, the −10 for a correct "Bandit!" call) are the motivating cases.
//
// The record carries each player's per-hand points (`raceRounds`) beside the
// summed `score`, so a match is entered hand by hand — like Decrypto's tokens —
// and the end of the game falls out of the numbers: the hand that pushes a
// total past the limit is the last one.
//
// Shared by the web form, the client-side outcome validation, the core
// wire-schema superRefine and the server's outcome allowlist. The structural
// rules (same hand count everywhere, totals add up) need no slug; the limit
// rules (the game ended exactly on the last hand) do, so they run where the
// slug is known.

/** Most hands one record can hold — far beyond any real game to 66 or 100. */
export const SCORE_RACE_MAX_ROUNDS = 60;

export interface ScoreRace {
  /** The total that ends the game. */
  limit: number;
  /** "reach": a total of `limit` or more ends it; "exceed": only more than `limit`. */
  endsWhen: "reach" | "exceed";
  /** What one hand is called on the score sheet. */
  roundLabel: string;
}

const SCORE_RACES: Record<string, ScoreRace> = {
  "take-5": { limit: 66, endsWhen: "exceed", roundLabel: "Hand" },
  bandit: { limit: 100, endsWhen: "reach", roundLabel: "Round" },
};

export function scoreRaceForSlug(slug: string | null | undefined): ScoreRace | undefined {
  return slug ? SCORE_RACES[slug] : undefined;
}

/** "passes 66" / "reaches 100" — the end condition in words ("passed 66" in the past tense). */
export function describeRaceLimit(race: ScoreRace, tense: "present" | "past" = "present"): string {
  const verb =
    race.endsWhen === "exceed"
      ? tense === "past"
        ? "passed"
        : "passes"
      : tense === "past"
        ? "reached"
        : "reaches";
  return `${verb} ${race.limit}`;
}

export function crossesLimit(race: ScoreRace, total: number): boolean {
  return race.endsWhen === "exceed" ? total > race.limit : total >= race.limit;
}

export interface RacePlayer {
  score: number;
  raceRounds?: readonly number[];
}

/**
 * Recorded before hand-by-hand entry existed: final totals only, no hands.
 * Still a valid record — old matches stay editable without inventing hands.
 */
export function isRaceTotalsOnly(players: readonly RacePlayer[]): boolean {
  return players.every((p) => p.raceRounds === undefined) && players.some((p) => p.score !== 0);
}

/** Each player's running total after every hand. */
export function runningTotals(players: readonly RacePlayer[]): number[][] {
  return players.map((p) => {
    let sum = 0;
    return (p.raceRounds ?? []).map((s) => {
      sum += s;
      return sum;
    });
  });
}

export type RaceStatus =
  | { status: "empty" }
  | { status: "running"; rounds: number }
  | {
      status: "finished";
      rounds: number;
      /** Indices of the players whose total crossed the limit on the last hand. */
      crossed: number[];
    }
  | { status: "invalid"; reason: string };

/**
 * Where the race stands: no hands yet, still running, or over — the last hand
 * pushed somebody across the limit. A record that keeps going after the hand
 * that ended the game is invalid.
 */
export function raceStatus(race: ScoreRace, players: readonly RacePlayer[]): RaceStatus {
  const rounds = players[0]?.raceRounds?.length ?? 0;
  if (players.length === 0 || rounds === 0) return { status: "empty" };
  const totals = runningTotals(players);
  for (let r = 0; r < rounds; r++) {
    const crossed = totals.flatMap((t, i) => (crossesLimit(race, t[r] ?? 0) ? [i] : []));
    if (crossed.length === 0) continue;
    if (r < rounds - 1) {
      return {
        status: "invalid",
        reason: `The game ended after ${race.roundLabel.toLowerCase()} ${r + 1}, when a total ${describeRaceLimit(race)} — remove the later ones`,
      };
    }
    return { status: "finished", rounds, crossed };
  }
  return { status: "running", rounds };
}

/**
 * Structural check on a race record: either no player carries `raceRounds`,
 * or every player does, with the same number of hands, and each `score` is
 * the sum of its hands. Returns a human-readable reason, or null when fine.
 */
export function describeRaceRoundsError(outcome: {
  players: readonly RacePlayer[];
}): string | null {
  const withRounds = outcome.players.filter((p) => p.raceRounds !== undefined);
  if (withRounds.length === 0) return null;
  if (withRounds.length !== outcome.players.length) {
    return "every player needs the same hands recorded";
  }
  const rounds = outcome.players[0].raceRounds?.length ?? 0;
  if (rounds < 1 || rounds > SCORE_RACE_MAX_ROUNDS) {
    return `a score race holds 1–${SCORE_RACE_MAX_ROUNDS} hands`;
  }
  for (const p of outcome.players) {
    if ((p.raceRounds?.length ?? 0) !== rounds) {
      return "every player needs the same hands recorded";
    }
    const sum = (p.raceRounds ?? []).reduce((a, b) => a + b, 0);
    if (sum !== p.score) return "a player's total doesn't match their hands";
  }
  return null;
}

/**
 * Full check once the game is known: the structural rules plus the limit —
 * the record must end exactly on the hand that crossed it.
 */
export function describeScoreRaceError(
  race: ScoreRace,
  outcome: { players: readonly RacePlayer[] },
): string | null {
  const structural = describeRaceRoundsError(outcome);
  if (structural) return structural;
  const status = raceStatus(race, outcome.players);
  switch (status.status) {
    case "empty":
      return `Enter the scores ${race.roundLabel.toLowerCase()} by ${race.roundLabel.toLowerCase()}`;
    case "running":
      return `Keep adding ${race.roundLabel.toLowerCase()}s until a total ${describeRaceLimit(race)}`;
    case "invalid":
      return status.reason;
    case "finished":
      return null;
  }
}
