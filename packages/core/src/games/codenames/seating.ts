/**
 * Who plays what, from the seat index alone. Rooms pack filled slots into
 * seats 0…n−1 (the host's swaps reorder them), so a role that depends only on
 * the index is the same for every table size:
 *
 *   seat 0 — Red spymaster      seat 1 — Blue spymaster
 *   seat 2k — Red operative     seat 2k+1 — Blue operative   (k ≥ 1)
 */

export type Team = 0 | 1;
export type Role = "spymaster" | "operative";

export const TEAM_NAMES: Record<Team, string> = { 0: "Red", 1: "Blue" };

export const SEAT_NAMES = [
  "Red Spymaster",
  "Blue Spymaster",
  "Red Operative",
  "Blue Operative",
  "Red Operative 2",
  "Blue Operative 2",
  "Red Operative 3",
  "Blue Operative 3",
] as const;

export function teamOf(seat: number): Team {
  return (seat % 2) as Team;
}

export function roleOf(seat: number): Role {
  return seat < 2 ? "spymaster" : "operative";
}

export function spymasterOf(team: Team): number {
  return team;
}

/** The operatives of `team` at a table of `seatCount`, lowest seat first. */
export function operativesOf(team: Team, seatCount: number): number[] {
  const seats: number[] = [];
  for (let seat = 2 + team; seat < seatCount; seat += 2) seats.push(seat);
  return seats;
}

export function otherTeam(team: Team): Team {
  return (1 - team) as Team;
}
