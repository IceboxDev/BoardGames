import { type Rng, shuffle } from "@boardgames/core/lib/rng";
import { z } from "zod";
import type { Attendee } from "./calendar-games";

// Team generator for a night's Attendees tab. Entirely client-side: whoever
// taps "Make teams" holds their phone up to the table, and the split is kept
// per night in localStorage so closing the modal doesn't lose it.

/** Shuffle, then deal round-robin: sizes differ by at most one, no team is empty. */
export function dealTeams(ids: readonly string[], teamCount: number, rng?: Rng): string[][] {
  const count = Math.max(1, Math.min(teamCount, ids.length));
  const teams: string[][] = Array.from({ length: count }, () => []);
  shuffle(ids, rng).forEach((id, i) => {
    teams[i % count].push(id);
  });
  return teams;
}

/** Who the pool offers at all: invited-without-reply and declined seats are not at the table. */
export function isTeamCandidate(a: Attendee): boolean {
  return a.seat !== "invited" && a.seat !== "declined";
}

/** Confirmed people start in; maybes and the waitlist start out (tap to add). */
export function defaultInPool(a: Attendee): boolean {
  if (a.seat !== null) return a.seat === "host" || a.seat === "seated";
  return a.status === "definite";
}

/** At least two teams; at most one team per two players (a 3-player pool still gets 2). */
export function teamCountBounds(poolSize: number): { min: number; max: number } {
  return { min: 2, max: Math.max(2, Math.floor(poolSize / 2)) };
}

/** "3 + 3 + 2" — the sizes a deal of `poolSize` into `teamCount` teams produces. */
export function splitCaption(poolSize: number, teamCount: number): string {
  if (poolSize === 0) return "Nobody in the pool";
  const count = Math.min(teamCount, poolSize);
  const base = Math.floor(poolSize / count);
  const extra = poolSize % count;
  return Array.from({ length: count }, (_, i) => base + (i < extra ? 1 : 0)).join(" + ");
}

const TeamsStateSchema = z.object({
  teamCount: z.number().int().min(1),
  /** userId → in (true) / out (false), only where it differs from `defaultInPool`. */
  overrides: z.record(z.string(), z.boolean()),
  teams: z.array(z.array(z.string())).nullable(),
});
export type TeamsState = z.infer<typeof TeamsStateSchema>;

export const DEFAULT_TEAMS_STATE: TeamsState = { teamCount: 2, overrides: {}, teams: null };

const storageKey = (date: string) => `bg:teams:${date}`;

export function loadTeams(date: string): TeamsState {
  try {
    const raw = window.localStorage.getItem(storageKey(date));
    if (!raw) return DEFAULT_TEAMS_STATE;
    const parsed = TeamsStateSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : DEFAULT_TEAMS_STATE;
  } catch {
    return DEFAULT_TEAMS_STATE;
  }
}

export function saveTeams(date: string, state: TeamsState): void {
  try {
    window.localStorage.setItem(storageKey(date), JSON.stringify(state));
  } catch {
    // Private window / storage full: the teams still show, they just won't survive a reload.
  }
}
