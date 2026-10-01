/**
 * The Resistance's tables and the position a record describes. Pure and
 * browser-safe: the engine, the player view, the Solver and the web UI all
 * read the table through `tablePosition`, so they can never disagree about
 * whose turn it is or what the score is.
 */

import type { ProposalRecord, ResistanceRecord, Role, RoundRecord, WinReason } from "./record";

export const MIN_PLAYERS = 5;
export const MAX_PLAYERS = 10;
export const MISSIONS = 5;
export const WINS_NEEDED = 3;
/** The fifth rejected proposal in one round hands the Spies the game. */
export const MAX_REJECTIONS = 5;

/** Spies at the table, by player count. */
export function spyCount(playerCount: number): number {
  const table: Record<number, number> = { 5: 2, 6: 2, 7: 3, 8: 3, 9: 3, 10: 4 };
  const spies = table[playerCount];
  if (spies === undefined) throw new Error(`The Resistance seats 5–10, not ${playerCount}`);
  return spies;
}

const TEAM_SIZES: Record<number, readonly number[]> = {
  5: [2, 3, 2, 3, 3],
  6: [2, 3, 4, 3, 4],
  7: [2, 3, 3, 4, 4],
  8: [3, 4, 4, 5, 5],
  9: [3, 4, 4, 5, 5],
  10: [3, 4, 4, 5, 5],
};

export function teamSize(playerCount: number, mission: number): number {
  const size = TEAM_SIZES[playerCount]?.[mission];
  if (size === undefined) throw new Error(`No mission ${mission + 1} at ${playerCount} players`);
  return size;
}

/** Fail cards needed to sink a mission: two on mission 4 at 7+ players. */
export function failsNeeded(playerCount: number, mission: number): number {
  return playerCount >= 7 && mission === 3 ? 2 : 1;
}

export function approvals(votes: readonly boolean[]): number {
  return votes.filter(Boolean).length;
}

/** A strict majority approves; a tie rejects. */
export function isApproved(votes: readonly boolean[] | null, playerCount: number): boolean {
  return votes !== null && approvals(votes) * 2 > playerCount;
}

/** `(firstLeader + k) mod n`: each proposal uses up one leadership, rejected or not. */
export function leaderOf(record: ResistanceRecord, proposalNumber: number): number {
  return (record.firstLeader + proposalNumber) % record.playerCount;
}

export interface TablePosition {
  /** `missionResults[m]` — true = success, null = not run yet. */
  missionResults: (boolean | null)[];
  successes: number;
  fails: number;
  /** Rejected proposals so far in the round being played. */
  rejections: number;
  /** Proposals made so far in the whole game. */
  proposalCount: number;
  /** Who proposes next (meaningful while the game is on). */
  leader: number;
  /** Missions the next proposal may target. */
  openMissions: number[];
  winner: Role | null;
  winReason: WinReason | null;
}

export function isRoundOver(round: RoundRecord): boolean {
  return round.result !== null;
}

/** The position after everything in `record` (open proposals don't count yet). */
export function tablePosition(record: ResistanceRecord): TablePosition {
  const n = record.playerCount;
  const missionResults: (boolean | null)[] = Array(MISSIONS).fill(null);
  let proposalCount = 0;
  let rejections = 0;
  let winReason: WinReason | null = null;

  for (const round of record.rounds) {
    rejections = 0;
    for (const proposal of round.proposals) {
      if (proposal.votes === null) continue;
      proposalCount++;
      if (!isApproved(proposal.votes, n)) rejections++;
    }
    if (round.result) missionResults[round.result.mission] = round.result.success;
    else if (rejections >= MAX_REJECTIONS) winReason = "five-rejections";
    if (round.result) rejections = 0;
  }

  const successes = missionResults.filter((r) => r === true).length;
  const fails = missionResults.filter((r) => r === false).length;
  if (successes >= WINS_NEEDED) winReason = "three-successes";
  else if (fails >= WINS_NEEDED) winReason = "three-fails";

  return {
    missionResults,
    successes,
    fails,
    rejections,
    proposalCount,
    leader: leaderOf(record, proposalCount),
    openMissions: openMissions(missionResults, successes, record.variants.targeting),
    winner: winReason === null ? null : winReason === "three-successes" ? "resistance" : "spy",
    winReason,
  };
}

/**
 * Missions a proposal may target: the lowest unplayed one, or with Targeting
 * any unplayed one — mission 5 only once two others have succeeded.
 */
export function openMissions(
  missionResults: readonly (boolean | null)[],
  successes: number,
  targeting: boolean,
): number[] {
  const unplayed = missionResults.flatMap((r, m) => (r === null ? [m] : []));
  if (!targeting) return unplayed.slice(0, 1);
  const open = unplayed.filter((m) => m !== MISSIONS - 1 || successes >= 2);
  return open.length > 0 ? open : unplayed;
}

/** The proposal awaiting votes or the mission awaiting cards, if any. */
export function openProposal(record: ResistanceRecord): ProposalRecord | null {
  const round = record.rounds.at(-1);
  if (!round || round.result) return null;
  const last = round.proposals.at(-1);
  if (!last) return null;
  if (last.votes === null || isApproved(last.votes, record.playerCount)) return last;
  return null;
}

/** Every `size`-subset of `0..n-1`, each ascending, in lexicographic order. */
export function combinations(n: number, size: number): number[][] {
  const out: number[][] = [];
  const pick: number[] = [];
  const walk = (start: number) => {
    if (pick.length === size) {
      out.push([...pick]);
      return;
    }
    for (let i = start; i <= n - (size - pick.length); i++) {
      pick.push(i);
      walk(i + 1);
      pick.pop();
    }
  };
  walk(0);
  return out;
}

export function maskOf(seats: readonly number[]): number {
  let mask = 0;
  for (const s of seats) mask |= 1 << s;
  return mask;
}

export function popcount(mask: number): number {
  let m = mask;
  let c = 0;
  while (m) {
    m &= m - 1;
    c++;
  }
  return c;
}

export function seatsOf(mask: number, n: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) if (mask & (1 << i)) out.push(i);
  return out;
}
