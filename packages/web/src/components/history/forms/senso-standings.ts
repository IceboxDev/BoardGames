import {
  CLAN_FACTIONS,
  EMPEROR_FACTION,
  factionsForTable,
  resolveStandings,
  type SensoStandings,
  type SensoTiebreak,
} from "@boardgames/core/games/senso-battle-for-japan/standings";
import type { MatchOutcomeFreeForAll, MatchOutcomeTeams } from "@boardgames/core/history/types";

// Pure recording rules behind SensoForm (standard play, a free-for-all) and
// SensoTeamsForm (2v2, a teams match), extracted like jaipur-rounds.ts so the
// derivation is testable without rendering. The ladder itself — points, then
// cubes on the map, then a seated Emperor — is core's `standings.ts`, the
// same function the online engine uses; this file owns only the FORM's
// policy: how a partial edit state converges to a wire-valid record whose
// `rank` / `winnerTeamIndices` are DERIVED, never picked by hand.

export const SENSO_SLUG = "senso-battle-for-japan";
/** Subtitle stamped on a standard (free-for-all) record. */
export const SENSO_STANDARD = "Standard";
/** Subtitle stamped on a 2v2 (teams) record. */
export const SENSO_2V2 = "2v2";
export const SENSO_TEAM_SIZE = 2;
export const SENSO_MAX_PLAYERS = 5;

type Player = MatchOutcomeFreeForAll["players"][number];
type Team = MatchOutcomeTeams["teams"][number];

export function isSensoSlug(slug: string | null): boolean {
  return slug === SENSO_SLUG;
}

/** The untouched all-zero table is not a five-way tie — nothing is derived until points exist. */
export function sensoScoresEntered(scored: readonly { score?: number }[]): boolean {
  return scored.some((s) => (s.score ?? 0) !== 0);
}

function dropKey<P extends object, K extends keyof P>(p: P, key: K): P {
  const { [key]: _drop, ...rest } = p;
  return rest as P;
}

// ── Standard play (free-for-all) ───────────────────────────────────────

export function sensoFfaStandings(players: readonly Player[]): SensoStandings {
  return resolveStandings(
    players.map((p) => ({
      score: p.score,
      cubes: p.tiebreak ?? 0,
      emperor: p.role === EMPEROR_FACTION,
    })),
  );
}

/** Indices of the players sharing the top score — the ones whose cubes decide anything. */
export function sensoTiedLeaders(players: readonly Player[]): number[] {
  if (players.length === 0) return [];
  const top = Math.max(...players.map((p) => p.score));
  return players.flatMap((p, i) => (p.score === top ? [i] : []));
}

/**
 * Whether a points tie is still waiting on a cube count. A cube count nobody
 * has typed yet is NOT zero: treating it as zero would make every tie look
 * persistent and hand the Emperor a throne it hasn't earned yet. The result
 * line waits on this; the save-time validator says the same thing in words.
 */
export function sensoFfaAwaitingCubes(players: readonly Player[]): boolean {
  const leaders = sensoTiedLeaders(players);
  return leaders.length > 1 && leaders.some((i) => players[i]?.tiebreak === undefined);
}

/**
 * Converge a standard record: the subtitle reads "Standard"; the Emperor,
 * who owns no cubes, carries an explicit 0 so a tie never waits on that
 * input; ranks follow the ladder once any points are entered and clear while
 * the table is untouched (so a fresh form doesn't crown everyone).
 */
export function normalizeSensoFfa(outcome: MatchOutcomeFreeForAll): MatchOutcomeFreeForAll {
  const players = outcome.players.map((p) =>
    p.role === EMPEROR_FACTION && p.tiebreak !== 0 ? { ...p, tiebreak: 0 } : p,
  );
  if (!sensoScoresEntered(players)) {
    return {
      ...outcome,
      scenario: SENSO_STANDARD,
      players: players.map((p) => dropKey(p, "rank")),
    };
  }
  const { placements } = sensoFfaStandings(players);
  return {
    ...outcome,
    scenario: SENSO_STANDARD,
    players: players.map((p, i) => ({ ...p, rank: placements[i] })),
  };
}

export function sensoFfaEqual(a: MatchOutcomeFreeForAll, b: MatchOutcomeFreeForAll): boolean {
  const project = (o: MatchOutcomeFreeForAll) =>
    JSON.stringify([
      o.scenario,
      o.players.map((p) => [p.userId, p.score, p.rank ?? null, p.tiebreak ?? null, p.role ?? null]),
    ]);
  return project(a) === project(b);
}

/**
 * Why the record is still not saveable, in the order the form reads: the
 * seats, the factions (unique; the Emperor exactly at a five-seat table),
 * the points, and the cubes the tie is waiting on. An entered 0 counts —
 * `tiebreak` is present, not undefined.
 */
export function describeSensoFfaError(outcome: MatchOutcomeFreeForAll): string | null {
  const players = outcome.players;
  if (players.length < 2) return "Add at least two players";
  if (players.length > SENSO_MAX_PLAYERS) return `Sensō seats at most ${SENSO_MAX_PLAYERS}`;
  const factionError = describeFactionError(players.map((p) => p.role));
  if (factionError) return factionError;
  const emperors = players.filter((p) => p.role === EMPEROR_FACTION).length;
  if (emperors > 0 && players.length < SENSO_MAX_PLAYERS) {
    return "The Emperor only sits at a five-player table";
  }
  if (players.length === SENSO_MAX_PLAYERS && emperors === 0) {
    return "Five players means one of them is the Emperor — pick who";
  }
  if (!sensoScoresEntered(players)) return "Enter each player's points";
  if (sensoFfaAwaitingCubes(players)) {
    return "Tied on points — enter each tied player's cubes on the map";
  }
  return null;
}

// ── 2v2 (teams) ────────────────────────────────────────────────────────

/** The 2v2 counterpart of `sensoFfaAwaitingCubes`: tied on points, a pair's cubes not yet typed. */
export function sensoTeamsAwaitingCubes(teams: readonly Team[]): boolean {
  const [a, b] = teams;
  if (!a || !b || (a.score ?? 0) !== (b.score ?? 0)) return false;
  return a.tiebreak === undefined || b.tiebreak === undefined;
}

export function sensoTeamsStandings(teams: readonly Team[]): SensoStandings {
  return resolveStandings(
    teams.map((t) => ({ score: t.score ?? 0, cubes: t.tiebreak ?? 0, emperor: false })),
  );
}

/**
 * Converge a 2v2 record: exactly two teams (extras from another game's
 * outcome are dropped, missing ones materialised empty), the subtitle reads
 * "2v2", and the winning side is derived once any points exist — a tie on
 * points goes to the partners' combined cubes; a tie that survives that is
 * shared (no Emperor plays 2v2).
 */
export function normalizeSensoTeams(outcome: MatchOutcomeTeams): MatchOutcomeTeams {
  const teams: Team[] = [outcome.teams[0] ?? { members: [] }, outcome.teams[1] ?? { members: [] }];
  const base = { ...outcome, scenario: SENSO_2V2, teams };
  if (!sensoScoresEntered(teams)) return { ...base, winnerTeamIndices: [] };
  return { ...base, winnerTeamIndices: sensoTeamsStandings(teams).winners };
}

export function sensoTeamsEqual(a: MatchOutcomeTeams, b: MatchOutcomeTeams): boolean {
  const project = (o: MatchOutcomeTeams) =>
    JSON.stringify([
      o.scenario,
      o.winnerTeamIndices,
      o.teams.map((t) => [
        t.score ?? null,
        t.tiebreak ?? null,
        t.members.map((m) => [m.userId, m.role ?? null]),
      ]),
    ]);
  return project(a) === project(b);
}

export function describeSensoTeamsError(outcome: MatchOutcomeTeams): string | null {
  if (outcome.teams.length !== 2) return "2v2 Sensō is exactly two teams";
  for (const [i, team] of outcome.teams.entries()) {
    if (team.members.length !== SENSO_TEAM_SIZE) {
      return `Team ${i + 1} needs exactly ${SENSO_TEAM_SIZE} players`;
    }
  }
  const roles = outcome.teams.flatMap((t) => t.members.map((m) => m.role));
  if (roles.includes(EMPEROR_FACTION)) return "The Emperor doesn't play 2v2";
  const factionError = describeFactionError(roles);
  if (factionError) return factionError;
  if (!sensoScoresEntered(outcome.teams)) return "Enter each team's points";
  if (sensoTeamsAwaitingCubes(outcome.teams)) {
    return "Tied on points — enter each team's cubes on the map";
  }
  return null;
}

/** Factions are optional labels, but one faction can't sit in two seats. */
function describeFactionError(roles: readonly (string | undefined)[]): string | null {
  const seen = new Set<string>();
  for (const role of roles) {
    if (role === undefined) continue;
    if (seen.has(role)) return `Two players can't both be ${role}`;
    seen.add(role);
  }
  return null;
}

// ── Shared display ─────────────────────────────────────────────────────

export { CLAN_FACTIONS, EMPEROR_FACTION, factionsForTable };

/** The rung that decided it, for the form's result line and the history card — null when points alone did. */
export function describeSensoTiebreak(tiebreak: SensoTiebreak): string | null {
  switch (tiebreak) {
    case "cubes":
      return "won on cubes";
    case "emperor":
      return "the Emperor takes a tied throne";
    case "draw":
      return "unbreakable tie";
    case "score":
      return null;
  }
}
