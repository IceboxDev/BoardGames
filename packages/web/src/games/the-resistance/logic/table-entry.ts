import type {
  MissionCard,
  ResistanceRecord,
  Role,
} from "@boardgames/core/games/the-resistance/record";
import {
  failsNeeded,
  openProposal,
  tablePosition,
} from "@boardgames/core/games/the-resistance/rules";

// Building a tabletop game's record one step at a time, as the table plays:
// propose → votes → mission result, repeat. Every step returns a new record;
// `undo` walks back exactly one of them.

export function emptyRecord(playerCount = 5): ResistanceRecord {
  return {
    playerCount,
    names: Array.from({ length: playerCount }, () => ""),
    variants: { targeting: false, blindSpies: false },
    firstLeader: 0,
    rounds: [],
    roles: null,
  };
}

export function hasStarted(record: ResistanceRecord): boolean {
  return record.rounds.some((r) => r.proposals.length > 0);
}

/** Change the table size before the first proposal (names kept where they fit). */
export function resize(record: ResistanceRecord, playerCount: number): ResistanceRecord {
  const names = Array.from({ length: playerCount }, (_, i) => record.names?.[i] ?? "");
  return {
    ...record,
    playerCount,
    names,
    firstLeader: Math.min(record.firstLeader, playerCount - 1),
    roles: null,
  };
}

export type EntryStep = "propose" | "votes" | "result" | "over";

export function entryStep(record: ResistanceRecord): EntryStep {
  if (tablePosition(record).winner) return "over";
  const open = openProposal(record);
  if (!open) return "propose";
  return open.votes === null ? "votes" : "result";
}

export function propose(
  record: ResistanceRecord,
  mission: number,
  team: readonly number[],
): ResistanceRecord {
  const leader = tablePosition(record).leader;
  const proposal = { leader, mission, team: [...team].sort((a, b) => a - b), votes: null };
  const last = record.rounds.at(-1);
  if (!last || last.result) {
    return { ...record, rounds: [...record.rounds, { proposals: [proposal], result: null }] };
  }
  return {
    ...record,
    rounds: [...record.rounds.slice(0, -1), { ...last, proposals: [...last.proposals, proposal] }],
  };
}

function withLastProposal(
  record: ResistanceRecord,
  edit: (round: ResistanceRecord["rounds"][number]) => ResistanceRecord["rounds"][number],
): ResistanceRecord {
  const last = record.rounds.at(-1);
  if (!last) return record;
  return { ...record, rounds: [...record.rounds.slice(0, -1), edit(last)] };
}

export function recordVotes(record: ResistanceRecord, votes: readonly boolean[]): ResistanceRecord {
  return withLastProposal(record, (round) => ({
    ...round,
    proposals: round.proposals.map((p, i) =>
      i === round.proposals.length - 1 ? { ...p, votes: [...votes] } : p,
    ),
  }));
}

export function recordResult(
  record: ResistanceRecord,
  fails: number,
  cards?: readonly (MissionCard | null)[],
): ResistanceRecord {
  const open = openProposal(record);
  if (!open) return record;
  const success = fails < failsNeeded(record.playerCount, open.mission);
  const withCards = cards?.some((c) => c !== null) ? { cards: [...cards] } : {};
  const next = withLastProposal(record, (round) => ({
    ...round,
    result: { mission: open.mission, team: open.team, fails, success, ...withCards },
  }));
  const pos = tablePosition(next);
  return { ...next, winner: pos.winner, winReason: pos.winReason };
}

export function setRoles(record: ResistanceRecord, spies: readonly number[]): ResistanceRecord {
  const roles: Role[] = Array.from({ length: record.playerCount }, (_, i) =>
    spies.includes(i) ? "spy" : "resistance",
  );
  return { ...record, roles };
}

/** Take back the last step: a result, a vote, or a proposal. */
export function undo(record: ResistanceRecord): ResistanceRecord {
  const last = record.rounds.at(-1);
  if (!last) return record;
  // Roles stay: they may have been entered from the start for a post-mortem.
  const cleared = { ...record, winner: null, winReason: null };
  if (last.result) return withLastProposal(cleared, (round) => ({ ...round, result: null }));
  const proposal = last.proposals.at(-1);
  if (!proposal) return { ...cleared, rounds: record.rounds.slice(0, -1) };
  if (proposal.votes !== null) {
    return withLastProposal(cleared, (round) => ({
      ...round,
      proposals: round.proposals.map((p, i) =>
        i === round.proposals.length - 1 ? { ...p, votes: null } : p,
      ),
    }));
  }
  const proposals = last.proposals.slice(0, -1);
  return proposals.length > 0
    ? withLastProposal(cleared, (round) => ({ ...round, proposals }))
    : { ...cleared, rounds: record.rounds.slice(0, -1) };
}
