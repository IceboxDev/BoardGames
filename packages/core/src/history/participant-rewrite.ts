// Rewrite a participant's identity inside a match outcome — the core of the
// admin "merge guest into real account" flow. Walks every slot a userId can
// occupy (mirroring `extractParticipantIds` path-for-path) and swaps both the
// id and the display name, so merged matches read with the account's real
// name everywhere.

import type { MatchOutcome } from "../protocol/http/history.ts";

export type ParticipantIdentity = { userId: string; displayName: string };

type Slot = { userId: string; displayName: string };

function swap<T extends Slot>(slot: T, fromId: string, to: ParticipantIdentity): T {
  if (slot.userId !== fromId) return slot;
  return { ...slot, userId: to.userId, displayName: to.displayName };
}

/**
 * Replace `fromId` with `to` in every participant slot of `outcome`.
 * Returns the rewritten outcome, or null when the outcome doesn't name
 * `fromId` at all (nothing to do).
 */
export function replaceParticipant(
  outcome: MatchOutcome,
  fromId: string,
  to: ParticipantIdentity,
): MatchOutcome | null {
  switch (outcome.kind) {
    case "free-for-all": {
      if (!outcome.players.some((p) => p.userId === fromId)) return null;
      return { ...outcome, players: outcome.players.map((p) => swap(p, fromId, to)) };
    }
    case "last-standing": {
      if (!outcome.players.some((p) => p.userId === fromId)) return null;
      return { ...outcome, players: outcome.players.map((p) => swap(p, fromId, to)) };
    }
    case "teams": {
      const inTeams = outcome.teams.some((t) => t.members.some((m) => m.userId === fromId));
      const isMod = outcome.moderator?.userId === fromId;
      if (!inTeams && !isMod) return null;
      return {
        ...outcome,
        teams: outcome.teams.map((t) => ({
          ...t,
          members: t.members.map((m) => swap(m, fromId, to)),
        })),
        ...(outcome.moderator ? { moderator: swap(outcome.moderator, fromId, to) } : {}),
      };
    }
    case "coop": {
      const inParty = outcome.participants.some((p) => p.userId === fromId);
      const isMod = outcome.moderator?.userId === fromId;
      if (!inParty && !isMod) return null;
      return {
        ...outcome,
        participants: outcome.participants.map((p) => swap(p, fromId, to)),
        ...(outcome.moderator ? { moderator: swap(outcome.moderator, fromId, to) } : {}),
      };
    }
    case "one-vs-many": {
      const isSolo = outcome.solo.userId === fromId;
      const inTeam = outcome.team.members.some((m) => m.userId === fromId);
      if (!isSolo && !inTeam) return null;
      return {
        ...outcome,
        solo: swap(outcome.solo, fromId, to),
        team: { ...outcome.team, members: outcome.team.members.map((m) => swap(m, fromId, to)) },
      };
    }
  }
}
