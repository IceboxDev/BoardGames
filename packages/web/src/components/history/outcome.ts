// Pure helpers extracted from RecordMatchModal so the (kind A → kind B)
// participant-carry-over matrix and the per-kind validation rules can be
// tested without spinning up the modal itself. Nothing here touches React,
// the query cache, or the network — every function is a pure transform.

import type {
  MatchKind,
  MatchOutcome,
  MatchOutcomeCoop,
  MatchOutcomeFreeForAll,
  MatchOutcomeLastStanding,
  MatchOutcomeOneVsMany,
  MatchOutcomeTeams,
  Participant,
} from "@boardgames/core/history/types";

/** Current timestamp as an ISO string. Wrapped so tests can stub it. */
export function isoNow(): string {
  return new Date().toISOString();
}

/**
 * Build a fresh outcome of the given kind, seeded with a flat participant
 * list. Used both for the create-mode initial state and as the destination
 * shape when the user flips kind mid-form.
 */
export function emptyOutcome(kind: MatchKind, prefill: Participant[]): MatchOutcome {
  switch (kind) {
    case "free-for-all":
      return {
        kind,
        players: prefill.map((p) => ({ ...p, score: 0 })),
      };
    case "teams":
      // Drop the whole pre-filled roster into team 0 so the admin can split it
      // into actual teams from there. For ClocktowerForm / WerewolfForm — which
      // read every team's members as a single roster — this puts them all in
      // the per-player role picker immediately.
      return {
        kind,
        teams: [{ members: prefill.map((p) => ({ ...p })) }, { members: [] }],
        winnerTeamIndices: [],
      };
    case "last-standing":
      return { kind, players: prefill.map((p) => ({ ...p })) };
    case "coop":
      return { kind, participants: prefill.map((p) => ({ ...p })), outcome: "win" };
    case "one-vs-many":
      return {
        kind,
        solo: { userId: "", displayName: "" },
        team: { members: [] },
        winnerSide: "team",
      };
  }
}

/**
 * Read the per-game variant tag (`scenario`) off an outcome. one-vs-many is the
 * only kind without that field, so it always reads as undefined.
 */
export function getScenario(outcome: MatchOutcome): string | undefined {
  return outcome.kind === "one-vs-many" ? undefined : outcome.scenario;
}

/**
 * Set (or clear, when `scenario` is undefined) the variant tag on an outcome.
 * one-vs-many has no scenario field so it's returned untouched. Shared by the
 * variant picker and the modal's default-seeding so the write is identical.
 */
export function applyScenario(outcome: MatchOutcome, scenario: string | undefined): MatchOutcome {
  if (outcome.kind === "one-vs-many") return outcome;
  const { scenario: _drop, ...rest } = outcome;
  return scenario === undefined ? (rest as MatchOutcome) : ({ ...rest, scenario } as MatchOutcome);
}

/**
 * Convert the modal's local state into the wire-shaped create input. Mostly a
 * shallow projection plus the trim-empty-to-null trick on notes that the
 * server-side schema requires.
 */
export function toCreateInput(state: {
  dateKey: string | null;
  playedAt: string;
  gameSlug: string | null;
  gameTitle: string;
  outcome: MatchOutcome;
  notes: string;
}) {
  return {
    dateKey: state.dateKey,
    playedAt: state.playedAt,
    gameSlug: state.gameSlug,
    gameTitle: state.gameTitle,
    outcome: state.outcome,
    notes: state.notes.trim() ? state.notes.trim() : null,
  };
}

/**
 * Sort the game-night dropdown: today and past nights only (newest → oldest).
 * Future-dated locks are filtered out — you can't record a match for a game
 * night that hasn't happened yet.
 */
export function sortLockKeys(keys: string[]): string[] {
  const today = new Date().toISOString().slice(0, 10);
  return keys.filter((k) => k <= today).sort((a, b) => b.localeCompare(a));
}

/** Convert an ISO timestamp to the local-tz string `<input type="datetime-local">` expects. */
export function isoToLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const tz = d.getTimezoneOffset();
  const local = new Date(d.getTime() - tz * 60_000);
  return local.toISOString().slice(0, 16);
}

/** Inverse of `isoToLocalInput`. Falls back to now() when the input is empty / invalid. */
export function localInputToIso(local: string): string {
  if (!local) return new Date().toISOString();
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return new Date().toISOString();
  return d.toISOString();
}

/**
 * Pre-flight check run before we hit the wire schema. The Zod request schema
 * is correct but the errors it surfaces ("Invalid input" at
 * `outcome.winnerTeamIndices`) are useless to a human. Catch the empty/missing
 * cases here so the admin gets actionable feedback instead.
 */
export function describeOutcomeError(
  outcome: MatchOutcome,
  gameSlug: string | null,
): string | null {
  switch (outcome.kind) {
    case "free-for-all":
      if (gameSlug === "villainous") return describeVillainousError(outcome);
      if (outcome.players.length < 2) return "Add at least two players";
      return null;
    case "teams":
      if (gameSlug === "blood-on-the-clocktower") return describeClocktowerError(outcome);
      if (gameSlug === "one-night-ultimate-werewolf") return describeWerewolfError(outcome);
      if (gameSlug === "the-resistance") return describeResistanceError(outcome);
      return describeGenericTeamsError(outcome);
    case "last-standing":
      if (outcome.players.length < 2) return "Add at least two players";
      if (outcome.players.every((p) => p.eliminationOrder !== undefined))
        return "At least one player must survive";
      return null;
    case "coop":
      if (outcome.participants.length < 1) return "Add at least one participant";
      return null;
    case "one-vs-many":
      if (!outcome.solo.userId) return "Pick the solo player";
      if (outcome.team.members.length < 1) return "Add at least one team player";
      return null;
  }
}

/**
 * Villainous is a point-less free-for-all: every player must be tagged with the
 * villain they played, and exactly one of them wins (marked `rank: 1`).
 */
export function describeVillainousError(outcome: MatchOutcomeFreeForAll): string | null {
  if (outcome.players.length < 2) return "Add at least two players";
  const noVillain = outcome.players.find((p) => !p.role);
  if (noVillain) return `Pick a villain for ${noVillain.displayName}`;
  const winners = outcome.players.filter((p) => p.rank === 1);
  if (winners.length === 0) return "Crown the player who won";
  if (winners.length > 1) return "Only one player can win Villainous";
  return null;
}

export function describeGenericTeamsError(outcome: MatchOutcomeTeams): string | null {
  const empty = outcome.teams.findIndex((t) => t.members.length === 0);
  if (empty !== -1) return `Team ${empty + 1} needs at least one player`;
  if (outcome.winnerTeamIndices.length === 0) return "Pick at least one winning team";
  return null;
}

/**
 * The Resistance: team 0 is the Resistance Operatives, team 1 the Spies. Both
 * sides need at least one player and exactly one side wins.
 */
export function describeResistanceError(outcome: MatchOutcomeTeams): string | null {
  const [resistance, spies] = outcome.teams;
  if (!resistance || resistance.members.length === 0)
    return "Add at least one Resistance Operative";
  if (!spies || spies.members.length === 0) return "Add at least one Spy";
  if (outcome.winnerTeamIndices.length === 0) return "Pick the winning side";
  return null;
}

export function describeWerewolfError(outcome: MatchOutcomeTeams): string | null {
  const allMembers = outcome.teams.flatMap((t) => t.members);
  if (allMembers.length === 0) return "Add players";
  const unassigned = allMembers.find((m) => !m.role);
  if (unassigned) return `Pick a role for ${unassigned.displayName}`;
  if (outcome.teams.length < 2)
    return "Match needs at least one Werewolf, Minion, or Tanner besides Village";
  if (outcome.winnerTeamIndices.length === 0)
    return "No winning team — adjust roles or vote-outs so a side wins";
  return null;
}

export function describeClocktowerError(outcome: MatchOutcomeTeams): string | null {
  const allMembers = outcome.teams.flatMap((t) => t.members);
  if (allMembers.length === 0) return "Add players";
  const unassigned = allMembers.find((m) => !m.role);
  if (unassigned) return `Pick a character for ${unassigned.displayName}`;
  const [good, evil] = outcome.teams;
  if (!good || good.members.length === 0) return "At least one good player is required";
  if (!evil || evil.members.length === 0) return "At least one evil player is required";
  if (outcome.winnerTeamIndices.length === 0) return "Pick the winning side";
  return null;
}

/**
 * Pull whatever participants the user has already selected into the new kind's
 * shape so we don't lose work when they flip the type. Only safe across kinds
 * that operate on a flat list of players (free-for-all, last-standing, coop).
 * Teams and one-vs-many start fresh because their slots are structurally
 * different.
 */
export function carryOverParticipants(nextKind: MatchKind, prev: MatchOutcome): MatchOutcome {
  const flat = flatParticipants(prev);
  return applyParticipants(nextKind, emptyOutcome(nextKind, flat), flat);
}

export function flatParticipants(outcome: MatchOutcome): Participant[] {
  switch (outcome.kind) {
    case "free-for-all":
    case "last-standing":
      return outcome.players.map((p) => ({ userId: p.userId, displayName: p.displayName }));
    case "teams":
      return outcome.teams.flatMap((t) => t.members);
    case "coop":
      return outcome.participants;
    case "one-vs-many":
      return [
        ...(outcome.solo.userId
          ? [{ userId: outcome.solo.userId, displayName: outcome.solo.displayName }]
          : []),
        ...outcome.team.members,
      ];
  }
}

export function applyParticipants(
  kind: MatchKind,
  base: MatchOutcome,
  participants: Participant[],
): MatchOutcome {
  switch (kind) {
    case "free-for-all": {
      const ffa = base as MatchOutcomeFreeForAll;
      const byId = new Map(ffa.players.map((p) => [p.userId, p] as const));
      return {
        ...ffa,
        // Keep score/role/rank for players that remain (Villainous villain +
        // winner survive a game-night re-prefill); refresh name from the picker.
        players: participants.map((p) => {
          const prev = byId.get(p.userId);
          return prev ? { ...prev, ...p } : { ...p, score: 0 };
        }),
      };
    }
    case "last-standing": {
      const ls = base as MatchOutcomeLastStanding;
      const elimById = new Map(ls.players.map((p) => [p.userId, p.eliminationOrder]));
      return {
        ...ls,
        players: participants.map((p) => ({
          ...p,
          ...(elimById.get(p.userId) !== undefined
            ? { eliminationOrder: elimById.get(p.userId) }
            : {}),
        })),
      };
    }
    case "coop":
      return { ...(base as MatchOutcomeCoop), participants };
    case "teams": {
      // Re-load the picked-night's roster into team 0 (or team 1 if the form
      // already has team-1 members alongside an empty team 0 — preserves edits
      // the admin already made). Roles get carried over when the same userId
      // re-appears so we don't wipe a partially-assigned Clocktower/Werewolf
      // form on a re-prefill.
      const teamsBase = base as MatchOutcomeTeams;
      const existingByUserId = new Map(
        teamsBase.teams.flatMap((t) => t.members.map((m) => [m.userId, m] as const)),
      );
      const dumpInto =
        teamsBase.teams[0].members.length === 0 && teamsBase.teams[1]?.members.length ? 1 : 0;
      const teams = teamsBase.teams.map((t, i) => {
        if (i !== dumpInto) return t;
        return {
          ...t,
          members: participants.map((p) => existingByUserId.get(p.userId) ?? p),
        };
      });
      return { ...teamsBase, teams };
    }
    case "one-vs-many":
      // one-vs-many's structure (solo + team) isn't a flat list, so we keep
      // whatever the user already has. flatParticipants/carryOver still works
      // for transitions OUT of one-vs-many — only the inverse skips the merge.
      return base as MatchOutcomeOneVsMany;
  }
}
